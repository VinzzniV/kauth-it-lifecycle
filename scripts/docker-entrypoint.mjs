import { spawn, spawnSync } from "node:child_process";

const port = process.env.PORT || "8080";
const dataPath = process.env.DATA_PATH || "/data";
const wrangler = "./node_modules/wrangler/bin/wrangler.js";
const common = ["--config", "wrangler.local.jsonc"];

const migration = spawnSync(process.execPath, [wrangler, "d1", "migrations", "apply", "DB", "--local", "--persist-to", dataPath, ...common], {
  stdio: "inherit",
  env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
});
if (migration.status !== 0) process.exit(migration.status ?? 1);

const args = [wrangler, "dev", "--ip", "0.0.0.0", "--port", port, "--persist-to", dataPath, ...common];
for (const key of ["MANAGEMENT_AGENT_URL", "MANAGEMENT_AGENT_TOKEN", "LOCAL_BASIC_AUTH_ENABLED", "APP_USERNAME", "APP_PASSWORD"]) {
  if (process.env[key]) args.push("--var", `${key}:${process.env[key]}`);
}
const server = spawn(process.execPath, args, { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));

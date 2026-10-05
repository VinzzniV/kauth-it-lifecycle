import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const port = process.env.PORT || "8080";
const dataPath = process.env.DATA_PATH || "/data";
const wrangler = "./node_modules/wrangler/bin/wrangler.js";
const common = ["--config", "wrangler.local.jsonc"];

const migration = spawnSync(process.execPath, [wrangler, "d1", "migrations", "apply", "DB", "--local", "--persist-to", dataPath, ...common], {
  stdio: "inherit",
  env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
});
if (migration.status !== 0) process.exit(migration.status ?? 1);

const config = JSON.parse(readFileSync("wrangler.local.jsonc", "utf8"));
config.vars = {};
for (const key of ["MANAGEMENT_AGENT_URL", "MANAGEMENT_AGENT_TOKEN", "LOCAL_BASIC_AUTH_ENABLED", "APP_USERNAME", "APP_PASSWORD", "IT_LIFECYCLE_WEB_URL", "AD_DOMAIN", "AD_MAIL_DOMAIN", "HELPDESK_BASE_URL", "M365_SYNC_SERVER", "GIT_REVISION"]) {
  if (process.env[key]) config.vars[key] = process.env[key];
}
// Keep secrets out of argv and suppress request logs containing status-link tokens.
writeFileSync(".runtime-wrangler.json", JSON.stringify(config), { mode: 0o600 });
const args = [wrangler, "dev", "--ip", "0.0.0.0", "--port", port, "--persist-to", dataPath, "--config", ".runtime-wrangler.json", "--log-level", "error"];
const server = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" } });
function redact(chunk) {
  let value = String(chunk).replace(/\/status\/[^\s?"<>]+/g, "/status/[redacted]").replace(/([?&]token=)[^\s&"<>]+/g, "$1[redacted]");
  for (const key of ["APP_PASSWORD", "MANAGEMENT_AGENT_TOKEN"]) if (process.env[key]) value = value.replaceAll(process.env[key], "[redacted]");
  return value;
}
server.stdout.on("data", (data) => process.stdout.write(redact(data)));
server.stderr.on("data", (data) => process.stderr.write(redact(data)));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));

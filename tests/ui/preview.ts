import { createServer } from "node:http";
import { fixtureEmployees, defaultMasterData } from "./fixtures";
import { publicLists } from "../../lib/ui-projections";

// A read-only synthetic data adapter; never connects to a gateway or live volume.
const before = process.argv.includes("--before");
const port = Number(process.env.UI_PREVIEW_PORT || 18081);
const upstream = process.env.UI_PREVIEW_UPSTREAM || "http://127.0.0.1:18082";
const auth = `Basic ${Buffer.from("ui-preview:synthetic-only").toString("base64")}`;
const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${port}`);
  const json = (data: unknown, status = 200) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(data)); };
  if (url.pathname.startsWith("/api/")) {
    if (request.method !== "GET") return json({ error: "Die isolierte Vorschau ist nur lesbar. Es werden keine Aufträge gestartet oder Daten verändert." }, 403);
    if (url.pathname === "/api/health") return json({ status: "ok", syntheticOnly: true, readOnly: true });
    if (url.pathname === "/api/employees") return json({ employees: fixtureEmployees });
    if (url.pathname === "/api/master-data") return json({ items: defaultMasterData });
    if (url.pathname === "/api/public/status") {
      const employee = fixtureEmployees.find((person) => person.shareToken === url.searchParams.get("token"));
      if (!employee) return json({ error: "Testlink ungültig" }, 404);
      const projection = publicLists(employee);
      return json({ employee: { firstName: employee.firstName, lastName: employee.lastName, department: employee.department, status: employee.status, startDate: employee.startDate, ...projection, ...(before ? { tasks: employee.tasks, services: employee.services } : {}), automationRuns: employee.automationRuns?.map(({ status, mode, operation, startedAt, completedAt }) => ({ status, mode, operation, startedAt, completedAt })) || [] } });
    }
    return json({ error: "In der Vorschau nicht verfügbar" }, 404);
  }
  try {
    const result = await fetch(upstream + request.url, { headers: { authorization: auth, accept: request.headers.accept || "*/*" }, redirect: "manual" });
    response.writeHead(result.status, Object.fromEntries([...result.headers].filter(([key]) => !["content-encoding", "content-length", "transfer-encoding"].includes(key))));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch { json({ error: "Vorschau-Webdienst ist nicht erreichbar" }, 502); }
});
server.listen(port, "0.0.0.0", () => process.stdout.write(`Synthetic read-only preview: http://localhost:${port}\n`));

import { env } from "cloudflare:workers";

export class ManagementHttpError extends Error {
  constructor(message: string, public status: number, public noExecution = false) { super(message); }
}

async function managementRequest(path: string, init: RequestInit) {
  const runtime = env as unknown as Record<string, string | undefined>;
  const tunnel = (
    env as unknown as {
      CUSTOMER_HTTP_MANAGEMENT_AGENT?: {
        fetch: (request: Request) => Promise<Response>;
      };
    }
  ).CUSTOMER_HTTP_MANAGEMENT_AGENT;
  const gatewayUrl = runtime.MANAGEMENT_AGENT_URL;
  if (!gatewayUrl && !tunnel)
    throw new Error(
      "Der Management-Agent ist noch nicht mit der Website verbunden.",
    );
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (runtime.MANAGEMENT_AGENT_TOKEN)
    headers.authorization = `Bearer ${runtime.MANAGEMENT_AGENT_TOKEN}`;
  const target = gatewayUrl
    ? `${gatewayUrl.replace(/\/$/, "")}${path}`
    : `http://management-agent${path}`;
  const outgoing = new Request(target, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  let response: Response;
  try {
    response = tunnel ? await tunnel.fetch(outgoing) : await fetch(outgoing);
  } catch {
    throw new Error("Der Management-Agent ist nicht erreichbar.");
  }
  if (!response.ok) {
    const details = (await response
      .clone()
      .json()
      .catch(() => ({}))) as {
      error?: string;
      noExecution?: boolean;
    };
    if (response.status === 401)
      throw new ManagementHttpError(
        "Webanwendung und Management-Agent verwenden unterschiedliche Gateway-Token. Docker-Container und Windows-Gateway nach einer Änderung der .env neu starten.",
        401, details.noExecution === true,
      );
    throw new ManagementHttpError(
      details.error ??
        `Der Management-Agent hat den Auftrag abgelehnt (${response.status}).`,
      response.status,
      details.noExecution === true,
    );
  }
  return response;
}

export async function forwardToManagementAgent(payload: unknown) {
  const job = payload as Record<string, unknown>;
  return managementRequest("/jobs", {
    method: "POST",
    body: JSON.stringify({ ...job, runId: job.jobId }),
  });
}

export async function readManagementAgentResult(jobId: string) {
  return managementRequest(`/results?jobId=${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
}

export async function managementHealth() {
  return managementRequest("/health", { method: "GET" });
}

export async function reconcileManagementJob(jobId: string) {
  return managementRequest("/jobs/reconcile", { method: "POST", body: JSON.stringify({ jobId }) });
}

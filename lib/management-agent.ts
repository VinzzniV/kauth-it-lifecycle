import { env } from "cloudflare:workers";

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
    };
    throw new Error(
      details.error ??
        `Der Management-Agent hat den Auftrag abgelehnt (${response.status}).`,
    );
  }
  return response;
}

export async function forwardToManagementAgent(payload: unknown) {
  return managementRequest("/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function readManagementAgentResult(jobId: string) {
  return managementRequest(`/results?jobId=${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
}

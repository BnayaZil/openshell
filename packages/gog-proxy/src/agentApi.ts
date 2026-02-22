type OpenSessionResponse = {
  sessionId: string;
};

async function readJsonSafely(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function parseError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  return typeof record["error"] === "string" ? record["error"] : undefined;
}

async function ensureSession(agentServerUrl: string, sessionId: string): Promise<OpenSessionResponse> {
  const response = await fetch(`${agentServerUrl}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw new Error(parseError(payload) ?? `Failed to open session (${response.status}).`);
  }
  if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>)["sessionId"] !== "string") {
    throw new Error("Agent session response is invalid.");
  }
  return { sessionId: (payload as Record<string, unknown>)["sessionId"] as string };
}

async function submitMessage(agentServerUrl: string, sessionId: string, content: string): Promise<void> {
  const response = await fetch(`${agentServerUrl}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw new Error(parseError(payload) ?? `Failed to submit message (${response.status}).`);
  }
}

export async function publishObjectiveToAgent(input: {
  agentServerUrl: string;
  sessionId: string;
  objective: string;
}): Promise<void> {
  const opened = await ensureSession(input.agentServerUrl, input.sessionId);
  await submitMessage(input.agentServerUrl, opened.sessionId, input.objective);
}

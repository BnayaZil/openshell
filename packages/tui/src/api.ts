import { parseErrorPayload, parseOpenSessionResult, type OpenSessionResult } from "./protocol.js";

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

function buildRequestError(operation: string, response: Response, payload: unknown): Error {
  return new Error(parseErrorPayload(payload) ?? `Failed ${operation} (${response.status}).`);
}

export async function openSession(baseUrl: string, targetSessionId: string): Promise<OpenSessionResult> {
  const response = await fetch(`${baseUrl}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: targetSessionId }),
  });
  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw buildRequestError("opening session", response, payload);
  }

  return parseOpenSessionResult(payload);
}

export async function submitPrompt(baseUrl: string, sessionId: string, rawContent: string): Promise<boolean> {
  const content = rawContent.trim();
  if (!content) {
    return false;
  }

  const response = await fetch(`${baseUrl}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw buildRequestError("to submit prompt", response, payload);
  }

  return true;
}

export async function cancelTurn(baseUrl: string, sessionId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/sessions/${sessionId}/control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "cancel" }),
  });
  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw buildRequestError("to cancel turn", response, payload);
  }
}

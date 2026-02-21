import { parseSessionEvent, type SessionEvent } from "./protocol.js";

const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;

export function parseSseFrame(frame: string): SessionEvent | undefined {
  const dataLine = frame
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data: "));

  if (!dataLine) {
    return undefined;
  }

  try {
    return parseSessionEvent(JSON.parse(dataLine.slice(6)));
  } catch {
    return undefined;
  }
}

export async function streamSessionEvents(input: {
  baseUrl: string;
  sessionId: string;
  signal: AbortSignal;
  onEvent: (event: SessionEvent) => void;
  maxBufferBytes?: number;
}): Promise<void> {
  const response = await fetch(`${input.baseUrl}/sessions/${input.sessionId}/events`, {
    method: "GET",
    signal: input.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Failed connecting to event stream (${response.status}).`);
  }

  const maxBufferBytes = input.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });

    if (buffer.length > maxBufferBytes) {
      buffer = buffer.slice(-maxBufferBytes);
    }

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const event = parseSseFrame(frame);
      if (event) {
        input.onEvent(event);
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
}

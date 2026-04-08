import type { IncomingHttpHeaders } from "node:http";

export type NormalizedGogEvent = {
  threadId: string;
  eventKey: string;
  rawPayload: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readHeaderString(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return readString(value[0]);
  }
  return readString(value);
}

function firstFoundString(paths: Array<Array<string>>, payload: unknown): string | undefined {
  for (const path of paths) {
    let current: unknown = payload;
    let found = true;
    for (const key of path) {
      const record = asRecord(current);
      if (!record || !(key in record)) {
        found = false;
        break;
      }
      current = record[key];
    }
    if (found) {
      const value = readString(current);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

export function normalizeIncomingGogEvent(payload: unknown, headers: IncomingHttpHeaders): NormalizedGogEvent {
  const threadId =
    readHeaderString(headers, "x-gog-thread-id") ??
    firstFoundString(
      [
        ["threadId"],
        ["thread_id"],
        ["message", "threadId"],
        ["gmail", "threadId"],
        ["event", "threadId"],
      ],
      payload,
    );

  if (!threadId) {
    throw new Error("Incoming event is missing threadId.");
  }

  const eventKey =
    readHeaderString(headers, "x-gog-event-id") ??
    firstFoundString(
      [
        ["eventId"],
        ["event_id"],
        ["id"],
        ["messageId"],
        ["historyId"],
        ["message", "id"],
      ],
      payload,
    ) ??
    threadId;

  return {
    threadId,
    eventKey,
    rawPayload: payload,
  };
}

export function renderObjectiveFromTemplate(template: string, input: { threadId: string; payload: unknown }): string {
  const compactPayload = JSON.stringify(input.payload);
  return template
    .replaceAll("{{threadId}}", input.threadId)
    .replaceAll("{{payload}}", compactPayload ?? "{}");
}

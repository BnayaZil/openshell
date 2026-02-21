import { describe, expect, it, vi } from "vitest";
import { createInitialSessionState } from "@openshell/agent/session";
import { parseSseFrame, streamSessionEvents } from "../src/eventStream";

describe("eventStream", () => {
  it("parses valid data frame and ignores malformed frame", () => {
    const state = createInitialSessionState({ cwd: "/tmp", model: "gpt-4.1-mini" });
    const ok = parseSseFrame(`data: ${JSON.stringify({ type: "session.snapshot", sessionId: "s1", state })}`);
    const bad = parseSseFrame("data: {not-json");

    expect(ok?.type).toBe("session.snapshot");
    expect(bad).toBeUndefined();
  });

  it("streams events and skips malformed frames", async () => {
    const state = createInitialSessionState({ cwd: "/tmp", model: "gpt-4.1-mini" });
    const chunks = [
      `data: ${JSON.stringify({ type: "session.snapshot", sessionId: "s1", state })}\n\n`,
      "data: {bad-json\n\n",
      `data: ${JSON.stringify({ type: "turn.failed", sessionId: "s1", turnId: 3, error: "boom" })}\n\n`,
    ];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const events: string[] = [];
    await streamSessionEvents({
      baseUrl: "http://localhost:3001",
      sessionId: "s1",
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event.type),
    });

    expect(events).toEqual(["session.snapshot", "turn.failed"]);
  });
});

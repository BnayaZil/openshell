import { describe, expect, it } from "vitest";
import { normalizeIncomingGogEvent, renderObjectiveFromTemplate } from "../src/events";

describe("gog-proxy events", () => {
  it("normalizes threadId from nested payload and event id from payload", () => {
    const event = normalizeIncomingGogEvent(
      {
        message: {
          threadId: "thread-123",
        },
        eventId: "evt-1",
      },
      {},
    );

    expect(event.threadId).toBe("thread-123");
    expect(event.eventKey).toBe("evt-1");
  });

  it("prefers explicit headers when present", () => {
    const event = normalizeIncomingGogEvent(
      {
        threadId: "payload-thread",
      },
      {
        "x-gog-thread-id": "header-thread",
        "x-gog-event-id": "header-event",
      },
    );
    expect(event.threadId).toBe("header-thread");
    expect(event.eventKey).toBe("header-event");
  });

  it("renders objective template placeholders", () => {
    const objective = renderObjectiveFromTemplate("Skill run for {{threadId}} payload={{payload}}", {
      threadId: "th-7",
      payload: { hello: "world" },
    });
    expect(objective).toContain("th-7");
    expect(objective).toContain('{"hello":"world"}');
  });
});

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSessionFile, saveSessionFile, SESSION_FILE_NAME } from "../src/tuiSessionStore";
import type { PersistedTuiSession } from "../src/tuiState";

function sampleSession(): PersistedTuiSession {
  return {
    rollingSummary: "summary",
    messages: [
      { id: 1, role: "user", content: "hello", createdAt: 1 },
      { id: 2, role: "assistant", content: "hi", createdAt: 2 },
    ],
    turns: [
      {
        id: 1,
        userMessageId: 1,
        objective: "hello",
        status: "finished",
        startedAt: 1,
        finishedAt: 2,
        commands: [],
      },
    ],
    nextMessageId: 3,
    nextTurnId: 2,
    nextCommandId: 1,
  };
}

describe("tuiSessionStore", () => {
  it("saves and loads a session file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openshell-tui-"));
    const session = sampleSession();

    await saveSessionFile(dir, session);
    const loaded = await loadSessionFile(dir);

    expect(loaded.warning).toBeUndefined();
    expect(loaded.session?.rollingSummary).toBe("summary");
    expect(loaded.session?.messages).toHaveLength(2);
  });

  it("returns warning on invalid json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openshell-tui-"));
    await writeFile(join(dir, SESSION_FILE_NAME), "{invalid json", "utf8");

    const loaded = await loadSessionFile(dir);
    expect(loaded.session).toBeUndefined();
    expect(loaded.warning).toBeDefined();
  });
});

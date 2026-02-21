import { describe, expect, it } from "vitest";
import {
  applyTurnError,
  applyTurnResult,
  beginTurn,
  buildObjectiveForTurn,
  createInitialTuiState,
  hydrateFromSession,
  reduceAgentLogEvent,
  toPersistedSession,
} from "../src/tuiState";

describe("tuiState", () => {
  it("starts a turn and builds objective with user request", () => {
    const state = createInitialTuiState({
      cwd: "/tmp/work",
      model: "gpt-4.1-mini",
    });
    const prepared = beginTurn(state, "check git status");

    expect(prepared.state.isRunning).toBe(true);
    expect(prepared.state.messages[0]!.role).toBe("user");
    expect(prepared.objective).toContain("Latest user request:");
    expect(prepared.objective).toContain("check git status");
  });

  it("maps command execution logs into compact command entries", () => {
    let state = createInitialTuiState({
      cwd: "/tmp/work",
      model: "gpt-4.1-mini",
    });
    state = beginTurn(state, "run tests").state;

    state = reduceAgentLogEvent(state, {
      event: "agent.step.exec.result",
      payload: {
        step: 1,
        command: "npm test",
        commandResult: {
          exitCode: 1,
          timedOut: false,
          stdout: "some output\nline 2",
          stderr: "tests failed",
        },
      },
    });

    const turn = state.turns[state.turns.length - 1]!;
    expect(turn.commands).toHaveLength(1);
    expect(turn.commands[0]!.command).toBe("npm test");
    expect(turn.commands[0]!.stderrPreview).toContain("tests failed");
  });

  it("applies turn result and updates rolling summary", () => {
    let state = createInitialTuiState({
      cwd: "/tmp/work",
      model: "gpt-4.1-mini",
    });
    const prepared = beginTurn(state, "echo hello");
    state = prepared.state;

    const next = applyTurnResult(state, prepared.turnId, {
      status: "finished",
      result: `Objective: x
Response: hello complete
Work summary: 1 action
Key outputs:
- echo hello => ok, hello`,
      steps: [],
      observations: [],
    });

    expect(next.isRunning).toBe(false);
    expect(next.turns[next.turns.length - 1]!.status).toBe("finished");
    expect(next.messages[next.messages.length - 1]!.role).toBe("assistant");
    expect(next.rollingSummary).toContain("User:");
  });

  it("applies turn errors and persists cleanly", () => {
    let state = createInitialTuiState({
      cwd: "/tmp/work",
      model: "gpt-4.1-mini",
    });
    const prepared = beginTurn(state, "bad run");
    state = prepared.state;

    const next = applyTurnError(state, prepared.turnId, new Error("boom"));

    expect(next.isRunning).toBe(false);
    expect(next.turns[next.turns.length - 1]!.status).toBe("error");
    expect(next.messages[next.messages.length - 1]!.content).toContain("Run failed");

    const persisted = toPersistedSession(next);
    const hydrated = hydrateFromSession(
      createInitialTuiState({
        cwd: "/tmp/work",
        model: "gpt-4.1-mini",
      }),
      persisted,
    );

    expect(hydrated.isRunning).toBe(false);
    expect(hydrated.turns.length).toBe(1);
  });

  it("builds objective with rolling summary and recent command evidence", () => {
    let state = createInitialTuiState({
      cwd: "/tmp/work",
      model: "gpt-4.1-mini",
    });
    const first = beginTurn(state, "list files");
    state = first.state;
    state = reduceAgentLogEvent(state, {
      event: "agent.step.exec.result",
      payload: {
        step: 1,
        command: "ls",
        commandResult: {
          exitCode: 0,
          timedOut: false,
          stdout: "a\nb\nc",
          stderr: "",
        },
      },
    });
    state = applyTurnResult(state, first.turnId, {
      status: "finished",
      result: "Response: listed",
      steps: [],
      observations: [],
    });

    const objective = buildObjectiveForTurn(state, "now run tests");
    expect(objective).toContain("Prior session summary:");
    expect(objective).toContain("Recent terminal activity:");
    expect(objective).toContain("now run tests");
  });
});

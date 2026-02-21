import { describe, expect, it } from "vitest";
import { defaultAgentConfig } from "../src/config";
import { createDefaultHooks } from "../src/defaultHooks";
import type { AgentContext } from "../src/hooks";
import { runPostObserve, runPostThink, runPreAction, runPreThink } from "../src/hooks";

const baseContext: AgentContext = {
  objective: "test objective",
  cwd: process.cwd(),
  startedAt: Date.now(),
  step: 1,
  maxSteps: 10,
  observations: [],
};

describe("hooks", () => {
  it("rejects denied commands in preAction", async () => {
    const hooks = createDefaultHooks(defaultAgentConfig);
    const result = await runPreAction(hooks, baseContext, {
      command: "rm -rf /",
      cwd: process.cwd(),
      timeoutMs: 1000,
    });

    expect(result.status).toBe("reject");
  });

  it("allows compound shell commands in preAction", async () => {
    const hooks = createDefaultHooks(defaultAgentConfig);
    const result = await runPreAction(hooks, baseContext, {
      command: "git status --porcelain & ls -1",
      cwd: process.cwd(),
      timeoutMs: 1000,
    });

    expect(result.status).toBe("modify");
    if (result.status === "modify") {
      expect(result.value.command).toBe("git status --porcelain & ls -1");
    }
  });

  it("trims history in preThink", async () => {
    const hooks = createDefaultHooks({
      ...defaultAgentConfig,
      historyWindow: 1,
    });
    const result = await runPreThink(hooks, {
      ...baseContext,
      observations: [
        {
          summary: "a",
          exitCode: 0,
          signals: [],
          raw: {
            executions: [{ command: "echo a", result: { stdout: "", stderr: "", exitCode: 0, durationMs: 0, timedOut: false } }],
            aggregateExitCode: 0,
            allSucceeded: true,
            anyTimedOut: false,
            stdout: "",
            stderr: "",
            durationMs: 0,
          },
        },
        {
          summary: "b",
          exitCode: 1,
          signals: [],
          raw: {
            executions: [
              { command: "echo b", result: { stdout: "", stderr: "x", exitCode: 1, durationMs: 0, timedOut: false } },
            ],
            aggregateExitCode: 1,
            allSucceeded: false,
            anyTimedOut: false,
            stdout: "",
            stderr: "x",
            durationMs: 0,
          },
        },
      ],
    });

    expect(result.status).toBe("modify");
    if (result.status === "modify") {
      expect(result.value.observations).toHaveLength(1);
      expect(result.value.observations[0]!.summary).toBe("b");
    }
  });

  it("enriches observation signals in postObserve", async () => {
    const hooks = createDefaultHooks(defaultAgentConfig);
    const result = await runPostObserve(hooks, baseContext, {
      summary: "raw",
      exitCode: 1,
      signals: [],
      raw: {
        executions: [
          {
            command: "cat secret.txt",
            result: {
              stdout: "",
              stderr: "Permission denied while reading file",
              exitCode: 1,
              durationMs: 5,
              timedOut: false,
            },
          },
        ],
        aggregateExitCode: 1,
        allSucceeded: false,
        anyTimedOut: false,
        stdout: "",
        stderr: "Permission denied while reading file",
        durationMs: 5,
      },
    });

    expect(result.status).toBe("modify");
    if (result.status === "modify") {
      expect(result.value.signals).toContain("permission");
      expect(result.value.signals).toContain("error");
      expect(result.value.summary).toContain("exitCode=1");
    }
  });

  it("rejects duplicated action batches in postThink", async () => {
    const hooks = createDefaultHooks({
      ...defaultAgentConfig,
      maxRepeatedActionBatches: 2,
    });

    const contextWithRepeats: AgentContext = {
      ...baseContext,
      observations: [
        {
          summary: "batch=ok",
          exitCode: 0,
          signals: [],
          raw: {
            executions: [{ command: "git status --porcelain", result: { stdout: "M a.ts", stderr: "", exitCode: 0, durationMs: 1, timedOut: false } }],
            aggregateExitCode: 0,
            allSucceeded: true,
            anyTimedOut: false,
            stdout: "M a.ts",
            stderr: "",
            durationMs: 1,
          },
        },
        {
          summary: "batch=ok",
          exitCode: 0,
          signals: [],
          raw: {
            executions: [{ command: "git status --porcelain", result: { stdout: "M a.ts", stderr: "", exitCode: 0, durationMs: 1, timedOut: false } }],
            aggregateExitCode: 0,
            allSucceeded: true,
            anyTimedOut: false,
            stdout: "M a.ts",
            stderr: "",
            durationMs: 1,
          },
        },
      ],
    };

    const result = await runPostThink(hooks, contextWithRepeats, {
      type: "action",
      commands: ["git status --porcelain"],
    });

    expect(result.status).toBe("reject");
  });
});

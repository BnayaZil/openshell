import { describe, expect, it } from "vitest";
import { runAgent } from "../src/loop";

describe("runAgent", () => {
  it("runs action then finish", async () => {
    let callCount = 0;
    const result = await runAgent({
      objective: "print hello",
      cwd: process.cwd(),
      think: async () => {
        callCount += 1;
        if (callCount === 1) {
          return { type: "action", commands: ["echo hello"] };
        }
        return { type: "finish", result: "completed" };
      },
    });

    expect(result.status).toBe("finished");
    expect(result.result).toContain("Objective: print hello");
    expect(result.result).toContain("Response: completed");
    expect(result.result).toContain("Work summary:");
    expect(result.result).toContain("Key outputs:");
    expect(result.observations.length).toBe(1);
    expect(result.observations[0]!.raw.executions[0]!.result.stdout).toContain("hello");
  });

  it("recovers from rejected command and still finishes", async () => {
    let callCount = 0;
    const result = await runAgent({
      objective: "reject then finish",
      cwd: process.cwd(),
      think: async () => {
        callCount += 1;
        if (callCount === 1) {
          return { type: "action", commands: ["rm -rf /"] };
        }
        return { type: "finish", result: "stopped safely" };
      },
    });

    expect(result.status).toBe("finished");
    expect(result.observations[0]!.signals).toContain("commandDenied");
  });

  it("stops when max steps are exhausted", async () => {
    const result = await runAgent({
      objective: "never finish",
      cwd: process.cwd(),
      config: { maxSteps: 2 },
      think: async () => ({ type: "action", commands: ["echo still-running"] }),
    });

    expect(result.status).toBe("maxStepsReached");
    expect(result.result).toContain("Objective: never finish");
    expect(result.result).toContain("step budget exhausted");
  });

  it("executes batched commands and emits one observation", async () => {
    let callCount = 0;
    const result = await runAgent({
      objective: "run two commands then finish",
      cwd: process.cwd(),
      think: async () => {
        callCount += 1;
        if (callCount === 1) {
          return { type: "action", commands: ["echo first", "echo second"] };
        }
        return { type: "finish", result: "done" };
      },
    });

    expect(result.status).toBe("finished");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]!.raw.executions).toHaveLength(2);
    expect(result.observations[0]!.raw.executions[0]!.result.stdout).toContain("first");
    expect(result.observations[0]!.raw.executions[1]!.result.stdout).toContain("second");
  });

  it("emits duplicateAction when model repeats same batch", async () => {
    const result = await runAgent({
      objective: "repeat guard",
      cwd: process.cwd(),
      config: { maxSteps: 4, maxRepeatedActionBatches: 1 },
      think: async () => ({ type: "action", commands: ["git status --porcelain"] }),
    });

    expect(result.status).toBe("maxStepsReached");
    expect(result.observations.some((observation) => observation.signals.includes("duplicateAction"))).toBe(true);
  });

  it("cancels an in-flight run when signal is aborted", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const result = await runAgent({
      objective: "cancel test",
      cwd: process.cwd(),
      signal: controller.signal,
      think: async () => ({ type: "action", commands: ["sleep 3"] }),
    });

    expect(result.status).toBe("cancelled");
    expect(result.result).toContain("Cancelled by user.");
  });
});

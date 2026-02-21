import { isObject } from "./shared.js";

export type ModelActionDecision = {
  type: "action";
  commands: string[];
};

export type ModelFinishDecision = {
  type: "finish";
  result: string;
};

export type ModelDecision = ModelActionDecision | ModelFinishDecision;

export type CommandRequest = {
  command: string;
  cwd: string;
  timeoutMs: number;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
};

export type ActionExecution = {
  command: string;
  result: CommandResult;
};

export type ActionResult = {
  executions: ActionExecution[];
  aggregateExitCode: number;
  allSucceeded: boolean;
  anyTimedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type Observation = {
  summary: string;
  exitCode: number;
  signals: string[];
  raw: ActionResult;
};

export function assertModelDecision(value: unknown): ModelDecision {
  if (!isObject(value) || typeof value["type"] !== "string") {
    throw new Error("ModelDecision must be an object with a string type.");
  }

  const type = value["type"];
  if (type === "action") {
    const commands = value["commands"];
    if (Array.isArray(commands)) {
      if (commands.length === 0 || commands.some((command) => typeof command !== "string" || command.trim().length === 0)) {
        throw new Error("Model action decision requires non-empty commands.");
      }

      return {
        type: "action",
        commands,
      };
    }

    // Backwards compatible path for older prompts.
    const legacyCommand = value["command"];
    if (typeof legacyCommand !== "string" || legacyCommand.trim().length === 0) {
      throw new Error("Model action decision requires a non-empty command or commands array.");
    }

    return {
      type: "action",
      commands: [legacyCommand],
    };
  }

  if (type === "finish") {
    const result = value["result"];
    if (typeof result !== "string" || result.trim().length === 0) {
      throw new Error("Model finish decision requires a non-empty result.");
    }

    return {
      type: "finish",
      result,
    };
  }

  throw new Error("ModelDecision type must be either 'action' or 'finish'.");
}

export function assertCommandRequest(value: unknown): CommandRequest {
  if (!isObject(value)) {
    throw new Error("CommandRequest must be an object.");
  }

  const command = value["command"];
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new Error("CommandRequest.command must be a non-empty string.");
  }

  const cwd = value["cwd"];
  if (typeof cwd !== "string" || cwd.trim().length === 0) {
    throw new Error("CommandRequest.cwd must be a non-empty string.");
  }

  const timeoutMs = value["timeoutMs"];
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("CommandRequest.timeoutMs must be a positive number.");
  }

  return {
    command,
    cwd,
    timeoutMs,
  };
}

export function assertActionResult(value: unknown): ActionResult {
  if (!isObject(value)) {
    throw new Error("ActionResult must be an object.");
  }

  const executionsInput = value["executions"];
  if (!Array.isArray(executionsInput)) {
    throw new Error("ActionResult.executions must be an array.");
  }

  const executions: ActionExecution[] = executionsInput.map((entry) => {
    if (!isObject(entry)) {
      throw new Error("ActionResult execution must be an object.");
    }
    const command = entry["command"];
    if (typeof command !== "string" || command.trim().length === 0) {
      throw new Error("ActionResult execution command must be a non-empty string.");
    }
    return {
      command,
      result: assertCommandResult(entry["result"]),
    };
  });

  const aggregateExitCode = value["aggregateExitCode"];
  if (typeof aggregateExitCode !== "number" || !Number.isInteger(aggregateExitCode)) {
    throw new Error("ActionResult.aggregateExitCode must be an integer.");
  }
  const allSucceeded = value["allSucceeded"];
  if (typeof allSucceeded !== "boolean") {
    throw new Error("ActionResult.allSucceeded must be a boolean.");
  }
  const anyTimedOut = value["anyTimedOut"];
  if (typeof anyTimedOut !== "boolean") {
    throw new Error("ActionResult.anyTimedOut must be a boolean.");
  }
  const stdout = value["stdout"];
  if (typeof stdout !== "string") {
    throw new Error("ActionResult.stdout must be a string.");
  }
  const stderr = value["stderr"];
  if (typeof stderr !== "string") {
    throw new Error("ActionResult.stderr must be a string.");
  }
  const durationMs = value["durationMs"];
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error("ActionResult.durationMs must be a non-negative number.");
  }

  return {
    executions,
    aggregateExitCode,
    allSucceeded,
    anyTimedOut,
    stdout,
    stderr,
    durationMs,
  };
}

export function assertCommandResult(value: unknown): CommandResult {
  if (!isObject(value)) {
    throw new Error("CommandResult must be an object.");
  }

  const stdout = value["stdout"];
  if (typeof stdout !== "string") {
    throw new Error("CommandResult.stdout must be a string.");
  }

  const stderr = value["stderr"];
  if (typeof stderr !== "string") {
    throw new Error("CommandResult.stderr must be a string.");
  }

  const exitCode = value["exitCode"];
  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
    throw new Error("CommandResult.exitCode must be an integer.");
  }

  const durationMs = value["durationMs"];
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error("CommandResult.durationMs must be a non-negative number.");
  }

  const timedOut = value["timedOut"];
  if (typeof timedOut !== "boolean") {
    throw new Error("CommandResult.timedOut must be a boolean.");
  }

  return {
    stdout,
    stderr,
    exitCode,
    durationMs,
    timedOut,
  };
}

export function assertObservation(value: unknown): Observation {
  if (!isObject(value)) {
    throw new Error("Observation must be an object.");
  }

  const summary = value["summary"];
  if (typeof summary !== "string" || summary.trim().length === 0) {
    throw new Error("Observation.summary must be a non-empty string.");
  }

  const exitCode = value["exitCode"];
  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
    throw new Error("Observation.exitCode must be an integer.");
  }

  const signals = value["signals"];
  if (!Array.isArray(signals) || signals.some((signal) => typeof signal !== "string")) {
    throw new Error("Observation.signals must be a string array.");
  }

  return {
    summary,
    exitCode,
    signals,
    raw: assertActionResult(value["raw"]),
  };
}

import {
  assertActionResult,
  assertCommandRequest,
  assertCommandResult,
  assertModelDecision,
  assertObservation,
  type ActionExecution,
  type ActionResult,
  type CommandRequest,
  type CommandResult,
  type ModelDecision,
  type Observation,
} from "./contracts.js";
import { defaultAgentConfig, type AgentConfig } from "./config.js";
import { createDefaultHooks } from "./defaultHooks.js";
import {
  runPostAction,
  runPostObserve,
  runPostThink,
  runPreAction,
  runPreObserve,
  runPreThink,
  type AgentContext,
  type HookChainResult,
  type AgentHooks,
} from "./hooks.js";
import { formatCancelledResult, formatFinishResult, formatFinishStepSummary, formatMaxStepsResult } from "./loopFormatting.js";
import { executeShellCommand } from "./shellExecutor.js";
import { parseErrorMessage } from "./shared.js";

export type AgentStepLog = {
  step: number;
  type: "agent_response" | "observation" | "finish";
  commands?: string[];
  exitCode?: number;
  summary: string;
};

export type AgentResult = {
  status: "finished" | "maxStepsReached" | "cancelled";
  result: string;
  steps: AgentStepLog[];
  observations: Observation[];
};

export type ThinkFn = (input: {
  objective: string;
  step: number;
  maxSteps: number;
  observations: Observation[];
}) => Promise<unknown>;

export type RunAgentOptions = {
  objective: string;
  cwd?: string;
  config?: Partial<AgentConfig>;
  hooks?: AgentHooks;
  think: ThinkFn;
  logger?: (event: string, payload: unknown) => void;
  signal?: AbortSignal;
};

function combineHooks(base: AgentHooks, extra?: AgentHooks): AgentHooks {
  if (!extra) {
    return base;
  }

  return {
    preThink: [...(base.preThink ?? []), ...(extra.preThink ?? [])],
    postThink: [...(base.postThink ?? []), ...(extra.postThink ?? [])],
    preAction: [...(base.preAction ?? []), ...(extra.preAction ?? [])],
    postAction: [...(base.postAction ?? []), ...(extra.postAction ?? [])],
    preObserve: [...(base.preObserve ?? []), ...(extra.preObserve ?? [])],
    postObserve: [...(base.postObserve ?? []), ...(extra.postObserve ?? [])],
  };
}

function asSyntheticObservation(reason: string, code: string, exitCode = 1): Observation {
  const actionResult: ActionResult = {
    executions: [],
    aggregateExitCode: exitCode,
    allSucceeded: false,
    anyTimedOut: false,
    stdout: "",
    stderr: reason,
    durationMs: 0,
  };

  return {
    summary: `${code}: ${reason}`,
    exitCode,
    signals: [code],
    raw: actionResult,
  };
}

function buildActionResult(executions: ActionExecution[]): ActionResult {
  const aggregateExitCode = executions.find((execution) => execution.result.exitCode !== 0)?.result.exitCode ?? 0;
  const allSucceeded = executions.every((execution) => execution.result.exitCode === 0);
  const anyTimedOut = executions.some((execution) => execution.result.timedOut);
  const durationMs = executions.reduce((total, execution) => total + execution.result.durationMs, 0);
  const stdout = executions.map((execution) => execution.result.stdout).filter(Boolean).join("\n");
  const stderr = executions.map((execution) => execution.result.stderr).filter(Boolean).join("\n");

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

function appendObservation(context: AgentContext, observation: Observation): AgentContext {
  return { ...context, observations: [...context.observations, observation] };
}

function pushObservationStepLog(
  stepLogs: AgentStepLog[],
  input: { step: number; observation: Observation; commands?: string[] },
): void {
  stepLogs.push({
    step: input.step,
    type: "observation",
    ...(input.commands ? { commands: input.commands } : {}),
    summary: input.observation.summary,
    exitCode: input.observation.exitCode,
  });
}

function commandErrorResult(reason: string): CommandResult {
  return {
    stdout: "",
    stderr: reason,
    exitCode: 1,
    durationMs: 0,
    timedOut: false,
  };
}

function hookRejectToObservation(result: HookChainResult<unknown>): Observation {
  if (result.status !== "reject") {
    return asSyntheticObservation("Unknown hook state", "hookFailure");
  }
  return asSyntheticObservation(result.reason, result.code ?? "hookRejected");
}

async function guardedHookRun<T>(
  runner: () => Promise<HookChainResult<T>>,
  failureCode: string,
): Promise<HookChainResult<T>> {
  try {
    return await runner();
  } catch (error) {
    return {
      status: "reject",
      reason: parseErrorMessage(error),
      code: failureCode,
    };
  }
}

export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const logger = options.logger ?? (() => undefined);
  const mergedConfig: AgentConfig = {
    ...defaultAgentConfig,
    ...options.config,
  };
  const cwd = options.cwd ?? mergedConfig.workspaceRoot;
  const hooks = combineHooks(createDefaultHooks(mergedConfig), options.hooks);

  let context: AgentContext = {
    objective: options.objective,
    cwd,
    startedAt: Date.now(),
    step: 0,
    maxSteps: mergedConfig.maxSteps,
    observations: [],
  };

  const stepLogs: AgentStepLog[] = [];
  logger("agent.start", {
    objective: options.objective,
    cwd,
    maxSteps: mergedConfig.maxSteps,
  });

  const isCancelled = (): boolean => options.signal?.aborted === true;

  const cancelledResult = (): AgentResult => {
    const resultText = formatCancelledResult(context.objective, stepLogs, context.observations);
    logger("agent.cancelled", { stepLogs, resultText });
    return {
      status: "cancelled",
      result: resultText,
      steps: stepLogs,
      observations: context.observations,
    };
  };

  for (let step = 1; step <= mergedConfig.maxSteps; step += 1) {
    if (isCancelled()) {
      return cancelledResult();
    }
    context = { ...context, step };
    logger("agent.step.start", {
      step,
      observationCount: context.observations.length,
    });

    const preThinkResult = await guardedHookRun(() => runPreThink(hooks, context), "preThinkFailure");
    if (isCancelled()) {
      return cancelledResult();
    }
    if (preThinkResult.status === "reject") {
      const observation = hookRejectToObservation(preThinkResult);
      context = appendObservation(context, observation);
      pushObservationStepLog(stepLogs, { step, observation });
      logger("agent.step.preThink.reject", { step, observation });
      continue;
    }
    context = preThinkResult.value;
    logger("agent.step.preThink.ok", {
      step,
      observationCount: context.observations.length,
    });

    let decision: ModelDecision;
    try {
      const rawDecision = await options.think({
        objective: context.objective,
        step,
        maxSteps: context.maxSteps,
        observations: context.observations,
      });
      logger("agent.step.think.rawDecision", { step, rawDecision });
      decision = assertModelDecision(rawDecision);
      logger("agent.step.think.validDecision", { step, decision });
    } catch (error) {
      const observation = asSyntheticObservation(parseErrorMessage(error), "invalidModelDecision");
      context = appendObservation(context, observation);
      pushObservationStepLog(stepLogs, { step, observation });
      logger("agent.step.think.error", { step, error: parseErrorMessage(error), observation });
      continue;
    }
    if (isCancelled()) {
      return cancelledResult();
    }

    const postThinkResult = await guardedHookRun(() => runPostThink(hooks, context, decision), "postThinkFailure");
    if (isCancelled()) {
      return cancelledResult();
    }
    if (postThinkResult.status === "reject") {
      const observation = hookRejectToObservation(postThinkResult);
      context = appendObservation(context, observation);
      pushObservationStepLog(stepLogs, { step, observation });
      logger("agent.step.postThink.reject", { step, observation });
      continue;
    }
    decision = postThinkResult.value;
    logger("agent.step.postThink.ok", { step, decision });

    if (decision.type === "finish") {
      stepLogs.push({
        step,
        type: "finish",
        summary: formatFinishStepSummary(decision.result),
      });
      const finalResult = formatFinishResult(context.objective, decision.result, stepLogs, context.observations);
      logger("agent.finish", { step, decision, stepLogs, finalResult });
      return {
        status: "finished",
        result: finalResult,
        steps: stepLogs,
        observations: context.observations,
      };
    }

    const executions: ActionExecution[] = [];
    const runInParallel = decision.commands.length > 1;
    stepLogs.push({
      step,
      type: "agent_response",
      commands: decision.commands,
      summary: `Agent response: execute ${decision.commands.length} command(s) ${runInParallel ? "in parallel" : "sequentially"}.`,
    });
    logger("agent.step.exec.mode", { step, mode: runInParallel ? "parallel" : "sequential", commands: decision.commands });

    const approvedRequests: CommandRequest[] = [];

    for (const command of decision.commands) {
      if (isCancelled()) {
        return cancelledResult();
      }
      let request: CommandRequest = assertCommandRequest({
        command,
        cwd: context.cwd,
        timeoutMs: mergedConfig.defaultTimeoutMs,
      });

      const preActionResult = await guardedHookRun(() => runPreAction(hooks, context, request), "preActionFailure");
      if (preActionResult.status === "reject") {
        const deniedResult = commandErrorResult(preActionResult.reason);
        executions.push({ command, result: deniedResult });
        logger("agent.step.preAction.reject", { step, command, reason: preActionResult.reason });
        continue;
      }
      request = preActionResult.value;
      logger("agent.step.preAction.ok", { step, request });
      approvedRequests.push(request);
    }

    const executedActions = await Promise.all(
      approvedRequests.map(async (request): Promise<ActionExecution> => {
        let commandResult: CommandResult;
        try {
          const executorOptions = {
            workspaceRoot: mergedConfig.workspaceRoot,
            maxStdoutBytes: mergedConfig.maxStdoutBytes,
            maxStderrBytes: mergedConfig.maxStderrBytes,
            ...(options.signal ? { signal: options.signal } : {}),
          };
          commandResult = await executeShellCommand(request, {
            ...executorOptions,
          });
          commandResult = assertCommandResult(commandResult);
        } catch (error) {
          commandResult = commandErrorResult(parseErrorMessage(error));
        }
        logger("agent.step.exec.result", { step, command: request.command, commandResult });

        const postActionResult = await guardedHookRun(
          () => runPostAction(hooks, context, commandResult),
          "postActionFailure",
        );
        if (postActionResult.status === "reject") {
          const rejectedResult = commandErrorResult(postActionResult.reason);
          logger("agent.step.postAction.reject", { step, command: request.command, reason: postActionResult.reason });
          return { command: request.command, result: rejectedResult };
        }

        logger("agent.step.postAction.ok", { step, commandResult: postActionResult.value });
        return { command: request.command, result: postActionResult.value };
      }),
    );

    executions.push(...executedActions);
    if (isCancelled()) {
      return cancelledResult();
    }

    const actionResult = assertActionResult(buildActionResult(executions));

    const preObserveResult = await guardedHookRun(
      () => runPreObserve(hooks, context, actionResult),
      "preObserveFailure",
    );
    if (preObserveResult.status === "reject") {
      const observation = hookRejectToObservation(preObserveResult);
      context = appendObservation(context, observation);
      pushObservationStepLog(stepLogs, { step, observation, commands: decision.commands });
      logger("agent.step.preObserve.reject", { step, commands: decision.commands, observation });
      continue;
    }
    const observedActionResult = preObserveResult.value;
    logger("agent.step.preObserve.ok", { step, actionResult: observedActionResult });

    let observation: Observation = assertObservation({
      summary: observedActionResult.aggregateExitCode === 0 ? "All commands succeeded." : "One or more commands failed.",
      exitCode: observedActionResult.aggregateExitCode,
      signals: [],
      raw: observedActionResult,
    });

    const postObserveResult = await guardedHookRun(
      () => runPostObserve(hooks, context, observation),
      "postObserveFailure",
    );
    if (postObserveResult.status === "reject") {
      observation = hookRejectToObservation(postObserveResult);
      logger("agent.step.postObserve.reject", { step, observation });
    } else {
      observation = postObserveResult.value;
      logger("agent.step.postObserve.ok", { step, observation });
    }

    context = appendObservation(context, observation);
    pushObservationStepLog(stepLogs, { step, observation, commands: decision.commands });
    logger("agent.step.end", { step, log: stepLogs[stepLogs.length - 1] });
  }

  logger("agent.maxStepsReached", {
    maxSteps: mergedConfig.maxSteps,
    stepLogs,
  });
  return {
    status: "maxStepsReached",
    result: formatMaxStepsResult(context.objective, mergedConfig.maxSteps, stepLogs, context.observations),
    steps: stepLogs,
    observations: context.observations,
  };
}

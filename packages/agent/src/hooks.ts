import type { ActionResult, CommandRequest, CommandResult, ModelDecision, Observation } from "./contracts.js";

export type HookOk = { status: "ok" };
export type HookReject = { status: "reject"; reason: string; code?: string };
export type HookModify<T> = { status: "modify"; value: T };
export type HookResult<T> = HookOk | HookReject | HookModify<T>;
export type HookChainResult<T> = HookReject | HookModify<T>;

export type AgentContext = {
  objective: string;
  cwd: string;
  startedAt: number;
  step: number;
  maxSteps: number;
  observations: Observation[];
};

export type AgentHooks = {
  preThink?: Array<(context: AgentContext) => HookResult<AgentContext> | Promise<HookResult<AgentContext>>>;
  postThink?: Array<
    (context: AgentContext, decision: ModelDecision) => HookResult<ModelDecision> | Promise<HookResult<ModelDecision>>
  >;
  preAction?: Array<
    (context: AgentContext, request: CommandRequest) => HookResult<CommandRequest> | Promise<HookResult<CommandRequest>>
  >;
  postAction?: Array<
    (context: AgentContext, result: CommandResult) => HookResult<CommandResult> | Promise<HookResult<CommandResult>>
  >;
  preObserve?: Array<
    (context: AgentContext, result: ActionResult) => HookResult<ActionResult> | Promise<HookResult<ActionResult>>
  >;
  postObserve?: Array<
    (context: AgentContext, observation: Observation) => HookResult<Observation> | Promise<HookResult<Observation>>
  >;
};

async function runChain<T>(
  hooks: Array<(value: T) => HookResult<T> | Promise<HookResult<T>>> | undefined,
  initialValue: T,
): Promise<HookChainResult<T>> {
  if (!hooks || hooks.length === 0) {
    return { status: "modify", value: initialValue };
  }

  let currentValue = initialValue;

  for (const hook of hooks) {
    const response = await hook(currentValue);

    if (response.status === "reject") {
      return response;
    }

    if (response.status === "modify") {
      currentValue = response.value;
    }
  }

  return { status: "modify", value: currentValue };
}

export async function runPreThink(hooks: AgentHooks, context: AgentContext): Promise<HookChainResult<AgentContext>> {
  return runChain(hooks.preThink, context);
}

export async function runPostThink(
  hooks: AgentHooks,
  context: AgentContext,
  decision: ModelDecision,
): Promise<HookChainResult<ModelDecision>> {
  const wrapped = hooks.postThink?.map((hook) => (value: ModelDecision) => hook(context, value));
  return runChain(wrapped, decision);
}

export async function runPreAction(
  hooks: AgentHooks,
  context: AgentContext,
  request: CommandRequest,
): Promise<HookChainResult<CommandRequest>> {
  const wrapped = hooks.preAction?.map((hook) => (value: CommandRequest) => hook(context, value));
  return runChain(wrapped, request);
}

export async function runPostAction(
  hooks: AgentHooks,
  context: AgentContext,
  commandResult: CommandResult,
): Promise<HookChainResult<CommandResult>> {
  const wrapped = hooks.postAction?.map((hook) => (value: CommandResult) => hook(context, value));
  return runChain(wrapped, commandResult);
}

export async function runPreObserve(
  hooks: AgentHooks,
  context: AgentContext,
  actionResult: ActionResult,
): Promise<HookChainResult<ActionResult>> {
  const wrapped = hooks.preObserve?.map((hook) => (value: ActionResult) => hook(context, value));
  return runChain(wrapped, actionResult);
}

export async function runPostObserve(
  hooks: AgentHooks,
  context: AgentContext,
  observation: Observation,
): Promise<HookChainResult<Observation>> {
  const wrapped = hooks.postObserve?.map((hook) => (value: Observation) => hook(context, value));
  return runChain(wrapped, observation);
}

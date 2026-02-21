export type AgentConfig = {
  maxSteps: number;
  defaultTimeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  workspaceRoot: string;
  historyWindow: number;
  maxRepeatedActionBatches: number;
  deniedCommandPatterns: RegExp[];
};

export const defaultAgentConfig: AgentConfig = {
  maxSteps: 10,
  defaultTimeoutMs: 30_000,
  maxStdoutBytes: 32_000,
  maxStderrBytes: 32_000,
  workspaceRoot: process.cwd(),
  historyWindow: 5,
  maxRepeatedActionBatches: 2,
  deniedCommandPatterns: [
    /\brm\s+-rf\s+\/(\s|$)/,
    /\bmkfs\b/,
    /:\(\)\s*\{\s*:\|:&\s*};:/,
    /\bdd\s+if=.*\bof=\/dev\//,
  ],
};

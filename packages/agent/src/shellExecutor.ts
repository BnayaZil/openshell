import { exec, type ExecException } from "node:child_process";
import { resolve } from "node:path";
import type { CommandRequest, CommandResult } from "./contracts.js";
import { truncateByBytes } from "./text.js";

export type ShellExecutorOptions = {
  workspaceRoot: string;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  signal?: AbortSignal;
};

function toExitCode(error: ExecException | null): number {
  if (!error) {
    return 0;
  }
  return typeof error.code === "number" ? error.code : 1;
}

function isTimedOut(error: ExecException | null): boolean {
  if (!error) {
    return false;
  }
  return error.killed === true && /timed out/i.test(error.message);
}

function isWithinWorkspace(workspaceRoot: string, cwd: string): boolean {
  const root = resolve(workspaceRoot);
  const target = resolve(cwd);
  return target === root || target.startsWith(`${root}/`);
}

export async function executeShellCommand(
  request: CommandRequest,
  options: ShellExecutorOptions,
): Promise<CommandResult> {
  if (!isWithinWorkspace(options.workspaceRoot, request.cwd)) {
    throw new Error(`Command cwd must stay inside workspace root: ${options.workspaceRoot}`);
  }

  const startedAt = Date.now();

  if (options.signal?.aborted) {
    return {
      stdout: "",
      stderr: "Command cancelled.",
      exitCode: 130,
      durationMs: 0,
      timedOut: false,
    };
  }

  return new Promise((resolvePromise) => {
    const child = exec(
      request.command,
      {
        cwd: request.cwd,
        timeout: request.timeoutMs,
        maxBuffer: Math.max(options.maxStdoutBytes, options.maxStderrBytes) * 2,
      },
      (error, stdout, stderr) => {
        if (abortListener) {
          options.signal?.removeEventListener("abort", abortListener);
        }
        const durationMs = Date.now() - startedAt;
        const timedOut = isTimedOut(error);
        const exitCode = toExitCode(error);

        resolvePromise({
          stdout: truncateByBytes(stdout ?? "", options.maxStdoutBytes),
          stderr: truncateByBytes(stderr ?? "", options.maxStderrBytes),
          exitCode,
          durationMs,
          timedOut,
        });
      },
    );

    let abortListener: (() => void) | undefined;
    if (options.signal) {
      abortListener = () => {
        child.kill("SIGTERM");
      };
      options.signal.addEventListener("abort", abortListener, { once: true });
    }
  });
}

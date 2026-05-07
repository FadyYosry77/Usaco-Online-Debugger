import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { RunResult } from "@usaco-helper/shared-types";
import { EventBus } from "../server/EventBus.js";

export class RunService {
  private activeProcess: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly eventBus: EventBus) {}

  async run(executablePath: string, stdin: string, timeoutMs: number): Promise<RunResult> {
    const startedAt = Date.now();
    this.eventBus.emit("run_started", { startedAt: new Date(startedAt).toISOString() });

    return new Promise<RunResult>(async (resolve, reject) => {
      const child = await spawnWithRetry(executablePath).catch(reject);
      if (!child) {
        return;
      }
      this.activeProcess = child;

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      const finish = (result: RunResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.activeProcess = null;
        this.eventBus.emit("run_finished", {
          finishedAt: new Date().toISOString(),
          result
        });
        resolve(result);
      };

      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.activeProcess = null;
        reject(error);
      };

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        this.eventBus.emit("run_output", { chunk: text, stream: "stdout" });
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        this.eventBus.emit("run_output", { chunk: text, stream: "stderr" });
      });

      child.on("error", (error) => {
        fail(error);
      });

      child.stdin.on("error", (error) => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EPIPE" || code === "EOF") {
          return;
        }
        fail(error);
      });

      child.on("close", (exitCode, signal) => {
        finish({
          exitCode,
          signal,
          stdout,
          stderr,
          runtimeMs: Date.now() - startedAt,
          timedOut
        });
      });

      child.stdin.write(stdin);
      child.stdin.end();
    });
  }

  stopActiveRun(): void {
    this.activeProcess?.kill();
    this.activeProcess = null;
  }
}

async function spawnWithRetry(
  executablePath: string,
  retries = 5,
  delayMs = 120
): Promise<ChildProcessWithoutNullStreams> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return spawn(executablePath, [], {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (error) {
      if (!isRetriableSpawnError(error) || attempt === retries) {
        throw error;
      }
      await delay(delayMs);
    }
  }

  throw new Error("Could not launch compiled program.");
}

function isRetriableSpawnError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code !== undefined
    && ["EBUSY", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

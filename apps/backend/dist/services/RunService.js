import { spawn } from "node:child_process";
export class RunService {
    eventBus;
    activeProcess = null;
    constructor(eventBus) {
        this.eventBus = eventBus;
    }
    async run(executablePath, stdin, timeoutMs) {
        const startedAt = Date.now();
        this.eventBus.emit("run_started", { startedAt: new Date(startedAt).toISOString() });
        return new Promise(async (resolve, reject) => {
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
            const finish = (result) => {
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
            const fail = (error) => {
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
                const code = error.code;
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
    stopActiveRun() {
        this.activeProcess?.kill();
        this.activeProcess = null;
    }
}
async function spawnWithRetry(executablePath, retries = 5, delayMs = 120) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return spawn(executablePath, [], {
                shell: false,
                stdio: ["pipe", "pipe", "pipe"]
            });
        }
        catch (error) {
            if (!isRetriableSpawnError(error) || attempt === retries) {
                throw error;
            }
            await delay(delayMs);
        }
    }
    throw new Error("Could not launch compiled program.");
}
function isRetriableSpawnError(error) {
    return error instanceof Error
        && "code" in error
        && error.code !== undefined
        && ["EBUSY", "EPERM"].includes(error.code ?? "");
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=RunService.js.map
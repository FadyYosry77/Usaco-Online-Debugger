import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { parseMiLine } from "@usaco-helper/debug-core";
export class GdbMiClient extends EventEmitter {
    child = null;
    tokenCounter = 1;
    stdoutBuffer = "";
    stderrBuffer = "";
    pending = new Map();
    start(gdbPath, cwd) {
        if (this.child) {
            return;
        }
        const child = spawn(gdbPath, ["--interpreter=mi2"], {
            cwd,
            shell: false,
            stdio: ["pipe", "pipe", "pipe"]
        });
        this.child = child;
        child.stdout.on("data", (chunk) => this.consumeStdout(chunk.toString()));
        child.stderr.on("data", (chunk) => this.consumeStderr(chunk.toString()));
        child.on("error", (error) => {
            if (this.child === child) {
                this.rejectPending(error);
                this.child = null;
                this.emit("error", error);
            }
        });
        child.on("close", (code, signal) => {
            if (this.child === child) {
                this.rejectPending(new Error("GDB process exited"));
                this.child = null;
                this.emit("exit", code, signal);
            }
        });
    }
    isRunning() {
        return this.child !== null;
    }
    stop() {
        if (!this.child) {
            return;
        }
        const child = this.child;
        this.child = null;
        this.rejectPending(new Error("GDB process stopped"));
        child.kill();
    }
    async send(command, timeoutMs = 5000) {
        if (!this.child) {
            throw new Error("GDB is not running");
        }
        const token = this.tokenCounter++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(token);
                reject(new Error(`Timed out waiting for GDB response to ${command}`));
            }, timeoutMs);
            this.pending.set(token, { resolve, reject, timer });
            this.child?.stdin.write(`${token}${command}\n`);
        });
    }
    consumeStdout(chunk) {
        this.stdoutBuffer += chunk;
        while (true) {
            const newlineIndex = this.stdoutBuffer.indexOf("\n");
            if (newlineIndex === -1) {
                break;
            }
            const line = this.stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
            this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
            this.handleLine(line);
        }
    }
    consumeStderr(chunk) {
        this.stderrBuffer += chunk;
        while (true) {
            const newlineIndex = this.stderrBuffer.indexOf("\n");
            if (newlineIndex === -1) {
                break;
            }
            const line = this.stderrBuffer.slice(0, newlineIndex).replace(/\r$/, "");
            this.stderrBuffer = this.stderrBuffer.slice(newlineIndex + 1);
            const record = {
                kind: "stream",
                streamType: "&",
                text: line
            };
            this.emit("record", record);
            this.emit("stream", record);
        }
    }
    handleLine(line) {
        const record = parseMiLine(line);
        this.emit("record", record);
        if (record.kind === "result") {
            if (record.token !== undefined) {
                const pending = this.pending.get(record.token);
                if (pending) {
                    clearTimeout(pending.timer);
                    this.pending.delete(record.token);
                    if (record.class === "error") {
                        pending.reject(new Error(readMiErrorMessage(record)));
                    }
                    else {
                        pending.resolve(record);
                    }
                }
            }
            this.emit("result", record);
            return;
        }
        if (record.kind === "async") {
            this.emit("async", record);
            return;
        }
        if (record.kind === "stream") {
            this.emit("stream", record);
        }
    }
    rejectPending(error) {
        for (const [token, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(error);
            this.pending.delete(token);
        }
    }
}
function readMiErrorMessage(record) {
    const message = record.results.find((result) => result.variable === "msg")?.value;
    return typeof message === "string" && message.trim() ? message : "GDB command failed";
}
//# sourceMappingURL=GdbMiClient.js.map
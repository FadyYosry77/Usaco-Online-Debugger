import { EventEmitter } from "node:events";
import type { MiResultRecord } from "@usaco-helper/debug-core";
export declare class GdbMiClient extends EventEmitter {
    private child;
    private tokenCounter;
    private stdoutBuffer;
    private stderrBuffer;
    private readonly pending;
    start(gdbPath: string, cwd: string): void;
    isRunning(): boolean;
    stop(): void;
    send(command: string, timeoutMs?: number): Promise<MiResultRecord>;
    private consumeStdout;
    private consumeStderr;
    private handleLine;
    private rejectPending;
}

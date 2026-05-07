import type { RunResult } from "@usaco-helper/shared-types";
import { EventBus } from "../server/EventBus.js";
export declare class RunService {
    private readonly eventBus;
    private activeProcess;
    constructor(eventBus: EventBus);
    run(executablePath: string, stdin: string, timeoutMs: number): Promise<RunResult>;
    stopActiveRun(): void;
}

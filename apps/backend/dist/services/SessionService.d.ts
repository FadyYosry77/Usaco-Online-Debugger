import type { Breakpoint, SessionSnapshot, WatchExpression } from "@usaco-helper/shared-types";
export declare class SessionService {
    private readonly store;
    readonly workspaceDir: string;
    constructor(baseDir: string);
    getSnapshot(): Promise<SessionSnapshot>;
    ensureWorkspace(): Promise<void>;
    syncCode(sourceCode: string, sourceFileName?: string, pageUrl?: string): Promise<SessionSnapshot>;
    saveBreakpoints(breakpoints: Breakpoint[]): Promise<SessionSnapshot>;
    saveWatches(watches: WatchExpression[]): Promise<SessionSnapshot>;
    getSourcePath(snapshot: SessionSnapshot): string;
    getExecutablePath(): string;
}

export type HelperMode = "practice" | "analysis";
export type ThemeMode = "system" | "light" | "dark";
export type BuildProfile = "usaco" | "debug";
export type DebugStateValue = "disconnected" | "idle" | "building" | "ready" | "running" | "paused" | "stopping" | "error";
export interface HelperSettings {
    compilerPath: string;
    gdbPath: string;
    cxxStandard: string;
    extraCompileFlags: string[];
    autoSyncOnCodeChange: boolean;
    debounceMs: number;
    localhostPort: number;
    localhostHost: string;
    prettyPrinters: boolean;
    maxVariablePreviewLength: number;
    safePracticeBanner: boolean;
    theme: ThemeMode;
    executionTimeoutMs: number;
}
export interface Breakpoint {
    id: string;
    file: string;
    line: number;
    enabled: boolean;
    condition?: string;
    gdbId?: string;
}
export interface WatchExpression {
    id: string;
    expression: string;
}
export interface TestCase {
    id: string;
    name: string;
    input: string;
    expectedOutput?: string;
    createdAt: string;
    updatedAt: string;
}
export interface SessionSnapshot {
    sourceFileName: string;
    sourceCode: string;
    sourceHash: string;
    updatedAt: string;
    breakpoints: Breakpoint[];
    watches: WatchExpression[];
    pageUrl?: string;
}
export interface BuildDiagnostic {
    file?: string;
    line?: number;
    column?: number;
    severity: "error" | "warning" | "note";
    message: string;
    raw: string;
}
export interface BuildResult {
    success: boolean;
    command: string[];
    stdout: string;
    stderr: string;
    diagnostics: BuildDiagnostic[];
    executablePath?: string;
}
export interface RunResult {
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    runtimeMs: number;
    timedOut: boolean;
}
export interface DebugFrame {
    level: number;
    func?: string;
    file?: string;
    fullname?: string;
    line?: number;
    address?: string;
}
export interface DebugVariable {
    name: string;
    value: string;
    type?: string;
    variablesReference?: string;
    hasChildren?: boolean;
}
export interface DebugThread {
    id: number;
    targetId?: string;
    state?: string;
    details?: string;
    frame?: DebugFrame;
}
export interface RegisterValue {
    number: number;
    value: string;
}
export interface MemoryRead {
    address: string;
    bytes: string;
    ascii: string;
}
export interface DebugSessionView {
    state: DebugStateValue;
    executablePath?: string;
    sourceFile?: string;
    currentLine?: number;
    currentFile?: string;
    breakpoints: Breakpoint[];
    watches: WatchExpression[];
    lastError?: string;
}
export interface EvaluateResult {
    expression: string;
    value: string;
}

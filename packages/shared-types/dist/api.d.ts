import type { Breakpoint, BuildProfile, BuildResult, DebugFrame, DebugSessionView, DebugThread, DebugVariable, EvaluateResult, HelperSettings, MemoryRead, RegisterValue, RunResult, SessionSnapshot, TestCase, WatchExpression } from "./models.js";
export interface HealthResponse {
    ok: true;
    service: string;
    version: string;
    mode: "practice-only";
}
export interface SyncCodeRequest {
    sourceCode: string;
    sourceFileName?: string;
    pageUrl?: string;
}
export interface SyncCodeResponse {
    snapshot: SessionSnapshot;
}
export interface BuildRequest {
    profile?: BuildProfile;
    sourceCode?: string;
    sourceFileName?: string;
}
export interface RunRequest {
    stdin: string;
    testcaseId?: string;
}
export interface DebugStartRequest {
    stdin?: string;
}
export interface RunToLineRequest {
    line: number;
}
export interface ToggleBreakpointRequest {
    breakpoint: Breakpoint;
}
export interface ToggleBreakpointResponse {
    breakpoints: Breakpoint[];
}
export interface EvaluateRequest {
    expression: string;
}
export type EvaluateResponse = EvaluateResult;
export interface MemoryReadRequest {
    address: string;
    count: number;
}
export interface SaveWatchesRequest {
    watches: WatchExpression[];
}
export interface SaveWatchesResponse {
    watches: WatchExpression[];
}
export interface TestCaseCreateRequest {
    name: string;
    input: string;
    expectedOutput?: string;
}
export interface TestCaseUpdateRequest {
    name?: string;
    input?: string;
    expectedOutput?: string;
}
export interface DeleteResponse {
    removed: boolean;
}
export type SettingsResponse = HelperSettings;
export type SessionStateResponse = DebugSessionView;
export type StackResponse = DebugFrame[];
export type VariablesResponse = DebugVariable[];
export type ThreadsResponse = DebugThread[];
export type RegistersResponse = RegisterValue[];
export type MemoryResponse = MemoryRead;
export type TestCasesResponse = TestCase[];
export type BuildResponse = BuildResult;
export type RunResponse = RunResult;

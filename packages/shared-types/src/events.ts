import type {
  BuildResult,
  DebugFrame,
  DebugSessionView,
  DebugThread,
  DebugVariable,
  RegisterValue,
  RunResult
} from "./models.js";

export interface EventMap {
  backend_status: { connected: boolean; message: string };
  build_started: { startedAt: string };
  build_finished: { startedAt: string; finishedAt: string; result: BuildResult };
  run_started: { startedAt: string };
  run_output: { chunk: string; stream: "stdout" | "stderr" };
  run_finished: { finishedAt: string; result: RunResult };
  debug_started: { startedAt: string; state: DebugSessionView };
  debug_paused: { reason: string; state: DebugSessionView };
  debug_resumed: { state: DebugSessionView };
  breakpoint_hit: { breakpointId?: string; state: DebugSessionView };
  variables_updated: { variables: DebugVariable[] };
  stack_updated: { stack: DebugFrame[] };
  threads_updated: { threads: DebugThread[] };
  registers_updated: { registers: RegisterValue[] };
  debugger_output: { channel: "console" | "log" | "target" | "mi"; message: string };
  debugger_error: { message: string };
}

export type EventName = keyof EventMap;

export interface BackendEvent<K extends EventName = EventName> {
  type: K;
  payload: EventMap[K];
}

export type AnyBackendEvent = {
  [K in EventName]: BackendEvent<K>;
}[EventName];

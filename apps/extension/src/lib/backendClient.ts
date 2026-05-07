import type {
  AnyBackendEvent,
  Breakpoint,
  BuildResult,
  BuildResponse,
  DebugStartRequest,
  EvaluateRequest,
  EvaluateResponse,
  HealthResponse,
  MemoryReadRequest,
  MemoryResponse,
  RunRequest,
  RunResponse,
  SaveWatchesRequest,
  SaveWatchesResponse,
  SessionStateResponse,
  SettingsResponse,
  StackResponse,
  SyncCodeRequest,
  SyncCodeResponse,
  TestCase,
  TestCaseCreateRequest,
  TestCaseUpdateRequest,
  TestCasesResponse,
  ThreadsResponse,
  ToggleBreakpointRequest,
  ToggleBreakpointResponse,
  VariablesResponse,
  RegistersResponse
} from "@usaco-helper/shared-types";
import { BACKEND_HTTP_ORIGIN, BACKEND_WS_ORIGIN } from "./constants";

interface BackendResponseLike {
  ok: boolean;
  status: number;
  statusText?: string;
  text(): Promise<string>;
}

interface BackendProxyResponse {
  body: string;
  error?: string;
  ok: boolean;
  status: number;
  statusText: string;
}

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = "BackendRequestError";
  }
}

export class BackendBuildError extends BackendRequestError {
  constructor(
    message: string,
    status: number,
    readonly result: BuildResult
  ) {
    super(message, status, result);
    this.name = "BackendBuildError";
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const requestInit = withJsonHeaders(init);
  const response = await requestBackend(path, requestInit);

  if (!response.ok) {
    throw await toBackendError(response);
  }

  return response.json() as Promise<T>;
}

async function requestBackend(path: string, init?: RequestInit): Promise<Response> {
  if (canUseBackgroundProxy()) {
    const proxied = await requestViaBackground(path, init);
    return new Response(proxied.body, {
      status: proxied.status || 502,
      statusText: proxied.statusText || proxied.error || "Local backend unavailable"
    });
  }

  try {
    return await fetch(`${BACKEND_HTTP_ORIGIN}${path}`, init);
  } catch (error) {
    throw new BackendRequestError(formatNetworkError(error), 0);
  }
}

async function requestViaBackground(path: string, init?: RequestInit): Promise<BackendProxyResponse> {
  const response = await new Promise<BackendProxyResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        init: {
          body: typeof init?.body === "string" ? init.body : undefined,
          headers: headersToRecord(init?.headers),
          method: init?.method
        },
        path,
        type: "USACO_HELPER_BACKEND_REQUEST"
      },
      (message: BackendProxyResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new BackendRequestError(runtimeError.message ?? "Extension background worker failed.", 0));
          return;
        }

        if (!message) {
          reject(new BackendRequestError("Extension background worker did not respond.", 0));
          return;
        }

        resolve(message);
      }
    );
  });

  if (!response.ok && response.status === 0) {
    throw new BackendRequestError(formatNetworkError(response.error), 0, response);
  }

  return response;
}

function canUseBackgroundProxy(): boolean {
  return typeof chrome !== "undefined"
    && Boolean(chrome.runtime?.id)
    && typeof chrome.runtime.sendMessage === "function";
}

function withJsonHeaders(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  };
}

function headersToRecord(headers: RequestInit["headers"]): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

async function toBackendError(response: BackendResponseLike): Promise<Error> {
  const raw = await response.text();
  const payload = tryParseJson(raw);

  if (isBuildResult(payload)) {
    return new BackendBuildError(formatBuildErrorMessage(payload), response.status, payload);
  }

  const message = readPayloadMessage(payload) ?? (raw.trim() || `Request failed with status ${response.status}`);
  return new BackendRequestError(message, response.status, payload);
}

function formatNetworkError(error: unknown): string {
  const raw = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const detail = raw.trim() && !/^failed to fetch$/i.test(raw.trim()) ? ` (${raw.trim()})` : "";
  return `Local backend is not reachable on ${BACKEND_HTTP_ORIGIN}. From the project root, run START_USACO_HELPER.${detail}`;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function readPayloadMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : undefined;
}

function isBuildResult(payload: unknown): payload is BuildResult {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<BuildResult>;
  return typeof candidate.success === "boolean" &&
    typeof candidate.stdout === "string" &&
    typeof candidate.stderr === "string" &&
    Array.isArray(candidate.diagnostics);
}

function formatBuildErrorMessage(result: BuildResult): string {
  const diagnostic = result.diagnostics[0];
  if (diagnostic?.message) {
    const location = diagnostic.line ? `line ${diagnostic.line}` : "build";
    return `Build failed at ${location}: ${diagnostic.message}`;
  }

  const stderrLine = result.stderr.split(/\r?\n/).find((line) => line.trim());
  if (stderrLine) {
    return `Build failed: ${stderrLine.trim()}`;
  }

  return "Build failed. Open the build console for details.";
}

export const backendClient = {
  health: () => requestJson<HealthResponse>("/health"),
  getSettings: () => requestJson<SettingsResponse>("/settings"),
  updateSettings: (settings: Partial<SettingsResponse>) =>
    requestJson<SettingsResponse>("/settings", {
      method: "POST",
      body: JSON.stringify(settings)
    }),
  syncCode: (payload: SyncCodeRequest) =>
    requestJson<SyncCodeResponse>("/session/sync-code", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  build: () =>
    requestJson<BuildResponse>("/build", {
      method: "POST",
      body: JSON.stringify({})
    }),
  run: (payload: RunRequest) =>
    requestJson<RunResponse>("/run", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  debugStart: (payload: DebugStartRequest) =>
    requestJson<SessionStateResponse>("/debug/start", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  debugStop: () =>
    requestJson<SessionStateResponse>("/debug/stop", {
      method: "POST",
      body: JSON.stringify({})
    }),
  debugContinue: () =>
    requestJson<SessionStateResponse>("/debug/continue", {
      method: "POST",
      body: JSON.stringify({})
    }),
  debugPause: () =>
    requestJson<SessionStateResponse>("/debug/pause", {
      method: "POST",
      body: JSON.stringify({})
    }),
  stepOver: () =>
    requestJson<SessionStateResponse>("/debug/step-over", {
      method: "POST",
      body: JSON.stringify({})
    }),
  stepInto: () =>
    requestJson<SessionStateResponse>("/debug/step-into", {
      method: "POST",
      body: JSON.stringify({})
    }),
  stepOut: () =>
    requestJson<SessionStateResponse>("/debug/step-out", {
      method: "POST",
      body: JSON.stringify({})
    }),
  getDebugState: () => requestJson<SessionStateResponse>("/debug/state"),
  getStack: () => requestJson<StackResponse>("/debug/stack"),
  getVariables: () => requestJson<VariablesResponse>("/debug/variables"),
  getThreads: () => requestJson<ThreadsResponse>("/debug/threads"),
  getRegisters: () => requestJson<RegistersResponse>("/debug/registers"),
  evaluate: (payload: EvaluateRequest) =>
    requestJson<EvaluateResponse>("/debug/evaluate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  toggleBreakpoint: (payload: ToggleBreakpointRequest) =>
    requestJson<ToggleBreakpointResponse>("/debug/toggle-breakpoint", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  saveWatches: (payload: SaveWatchesRequest) =>
    requestJson<SaveWatchesResponse>("/debug/watches", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  readMemory: (payload: MemoryReadRequest) =>
    requestJson<MemoryResponse>("/debug/memory", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getTestCases: () => requestJson<TestCasesResponse>("/testcases"),
  createTestCase: (payload: TestCaseCreateRequest) =>
    requestJson<TestCase>("/testcases", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateTestCase: (id: string, payload: TestCaseUpdateRequest) =>
    requestJson<TestCase>(`/testcases/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteTestCase: (id: string) =>
    requestJson<{ removed: boolean }>(`/testcases/${id}`, {
      method: "DELETE"
    }),
  connectEvents(onEvent: (event: AnyBackendEvent) => void): WebSocket {
    const socket = new WebSocket(BACKEND_WS_ORIGIN);
    socket.addEventListener("message", (event) => {
      onEvent(JSON.parse(event.data) as AnyBackendEvent);
    });
    return socket;
  }
};

export type { Breakpoint };

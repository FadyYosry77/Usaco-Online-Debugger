import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  AnyBackendEvent,
  Breakpoint,
  BuildResult,
  DebugFrame,
  DebugSessionView,
  DebugVariable,
  HelperSettings,
  TestCase,
  WatchExpression
} from "@usaco-helper/shared-types";
import { backendClient, BackendBuildError } from "../lib/backendClient";
import { DEFAULT_SOURCE_FILE } from "../lib/constants";
import type { OutputMirrorPayload, PageAdapter } from "../lib/pageAdapter";

type CompactTab = "Console" | "Debugger" | "Tests" | "Settings";
type OutputView = "stdout" | "stderr" | "build";
type ActionKey =
  | "sync"
  | "build"
  | "run"
  | "debug"
  | "continue"
  | "pause"
  | "stop"
  | "stepOver"
  | "stepInto"
  | "stepOut";

type PanelFrame = { height: number; left: number; top: number; width: number };
type ResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

const compactTabs: CompactTab[] = ["Console", "Debugger", "Tests", "Settings"];
const PANEL_FRAME_STORAGE_KEY = "usaco-helper-panel-frame";
const COLLAPSED_FRAME = { height: 46, maxWidth: 300, minWidth: 244, width: 276 };
const resizeHandles: ResizeHandle[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

interface HelperPanelProps {
  adapter: PageAdapter;
  hostElement: HTMLElement;
}

export function HelperPanel({ adapter, hostElement }: HelperPanelProps) {
  const [activeTab, setActiveTab] = useState<CompactTab>("Console");
  const [consoleView, setConsoleView] = useState<OutputView>("stdout");
  const [status, setStatus] = useState("Checking local backend...");
  const [collapsed, setCollapsed] = useState(false);
  const [targetUrl, setTargetUrl] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [stdin, setStdin] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [hasRunResult, setHasRunResult] = useState(false);
  const [stdoutText, setStdoutText] = useState("");
  const [stderrText, setStderrText] = useState("");
  const [debugState, setDebugState] = useState<DebugSessionView | null>(null);
  const [variables, setVariables] = useState<DebugVariable[]>([]);
  const [stack, setStack] = useState<DebugFrame[]>([]);
  const [watches, setWatches] = useState<WatchExpression[]>([]);
  const [watchInput, setWatchInput] = useState("");
  const [watchResults, setWatchResults] = useState<string[]>([]);
  const [testcases, setTestcases] = useState<TestCase[]>([]);
  const [testcaseName, setTestcaseName] = useState("sample1");
  const [breakpointLine, setBreakpointLine] = useState("1");
  const [settings, setSettings] = useState<HelperSettings | null>(null);
  const [cxxStandard, setCxxStandard] = useState("c++17");
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionKey>("run");
  const frameRef = useRef<PanelFrame>(readInitialFrame());
  const collapsedRef = useRef(false);
  const toggleBreakpointRef = useRef(toggleBreakpoint);

  const capabilities = adapter.getCapabilities();
  const debugMode = debugState?.state ?? "idle";
  const isPaused = debugMode === "paused";
  const isRunning = debugMode === "running";
  const canControlExecution = !["idle", "disconnected", "error"].includes(debugMode);
  const breakpointLines = useMemo(
    () => [...(debugState?.breakpoints ?? [])].map((item) => item.line).sort((a, b) => a - b),
    [debugState]
  );
  const activeOutput =
    consoleView === "stdout"
      ? stdoutText || (hasRunResult ? "Program finished with no stdout." : "No stdout yet.")
      : consoleView === "stderr"
        ? stderrText || "No stderr yet."
        : buildResult
          ? buildResult.stderr || buildResult.stdout || stringifyDiagnostics(buildResult) || "No build output yet."
          : "No build output yet.";
  const diffStatus = useMemo(() => {
    if (!expectedOutput.trim()) {
      return "No expected output";
    }
    return normalize(stdoutText) === normalize(expectedOutput) ? "Matches expected output" : "Output differs";
  }, [expectedOutput, stdoutText]);
  const collapsedStatus = status === "Connected" ? "Connected" : "Offline";

  useEffect(() => {
    setTargetUrl(adapter.getIdeUrl());
  }, [adapter]);

  useEffect(() => {
    collapsedRef.current = collapsed;
    hostElement.classList.toggle("usaco-helper-host-collapsed", collapsed);
    if (collapsed) {
      applyCollapsedFrame(hostElement, frameRef.current);
    } else {
      applyFrame(hostElement, frameRef.current);
    }
  }, [collapsed, hostElement]);

  useEffect(() => {
    applyFrame(hostElement, frameRef.current);
    const resizeObserver = new ResizeObserver(() => {
      if (collapsedRef.current) {
        return;
      }
      const rect = hostElement.getBoundingClientRect();
      const nextFrame = clampFrame(
        { ...frameRef.current, height: Math.round(rect.height), width: Math.round(rect.width) },
        Math.round(rect.width),
        Math.round(rect.height)
      );
      frameRef.current = nextFrame;
      applyFrame(hostElement, nextFrame);
      saveFrame(nextFrame);
    });
    resizeObserver.observe(hostElement);
    return () => resizeObserver.disconnect();
  }, [hostElement]);

  useEffect(() => {
    void initialize();
    const socket = backendClient.connectEvents(handleEvent);
    const unsubscribeBreakpoints = adapter.subscribeBreakpointToggle((line) => {
      void toggleBreakpointRef.current(line);
    });
    return () => {
      socket.close();
      unsubscribeBreakpoints();
      adapter.destroy();
    };
  }, []);

  useEffect(() => {
    toggleBreakpointRef.current = toggleBreakpoint;
  });

  useEffect(() => {
    void adapter.syncDecorations({
      activeLine: debugState?.currentLine,
      breakpointLines
    });
  }, [adapter, breakpointLines, debugState?.currentLine]);

  async function initialize() {
    try {
      await backendClient.health();
      const [savedTestcases, state, pageInput, backendSettings] = await Promise.all([
        backendClient.getTestCases(),
        backendClient.getDebugState().catch(() => null),
        adapter.getInput().catch(() => undefined),
        backendClient.getSettings()
      ]);
      setStatus("Connected");
      setTestcases(savedTestcases);
      setDebugState(state);
      setWatches(state?.watches ?? []);
      setSettings(backendSettings);
      setCxxStandard(backendSettings.cxxStandard);
      if (pageInput !== undefined) {
        setStdin(pageInput);
      }
    } catch (error) {
      setStatus(readErrorMessage(error, "Local backend not detected on localhost:3777"));
    }
  }

  function handleEvent(event: AnyBackendEvent) {
    switch (event.type) {
      case "backend_status":
        setStatus(event.payload.message);
        break;
      case "build_started":
        setSelectedAction("build");
        setConsoleView("build");
        break;
      case "build_finished":
        setBuildResult(event.payload.result);
        setSelectedAction("build");
        setConsoleView("build");
        void mirrorOutputs({
          compileOutput: event.payload.result.stderr || event.payload.result.stdout || stringifyDiagnostics(event.payload.result)
        });
        break;
      case "run_started":
        setSelectedAction("run");
        setConsoleView("stdout");
        break;
      case "run_output":
        if (event.payload.stream === "stdout") {
          setStdoutText((current) => {
            const next = current + event.payload.chunk;
            void mirrorOutputs({ stdout: next });
            return next;
          });
          setConsoleView("stdout");
        } else {
          setStderrText((current) => {
            const next = current + event.payload.chunk;
            void mirrorOutputs({ stderr: next });
            return next;
          });
        }
        break;
      case "run_finished":
        setStdoutText(event.payload.result.stdout);
        setStderrText(event.payload.result.stderr);
        setSelectedAction("run");
        setConsoleView(event.payload.result.stderr ? "stderr" : "stdout");
        void mirrorOutputs({ stderr: event.payload.result.stderr, stdout: event.payload.result.stdout });
        break;
      case "variables_updated":
        setVariables(event.payload.variables);
        break;
      case "stack_updated":
        setStack(event.payload.stack);
        break;
      case "debug_started":
        setDebugState(event.payload.state);
        setSelectedAction("debug");
        setActiveTab("Debugger");
        break;
      case "debug_paused":
      case "breakpoint_hit":
        setDebugState(event.payload.state);
        setSelectedAction("pause");
        void refreshDebugViews();
        break;
      case "debug_resumed":
        setDebugState(event.payload.state);
        setSelectedAction("continue");
        break;
      case "debugger_error":
        setStatus(event.payload.message);
        break;
      default:
        break;
    }
  }

  async function resolveCode(): Promise<string> {
    try {
      return await adapter.getCode();
    } catch (error) {
      if (manualCode.trim()) {
        return manualCode;
      }
      throw error;
    }
  }

  async function resolveStdin(): Promise<string> {
    if (stdin.length > 0) {
      await adapter.setInput(stdin).catch(() => false);
      return stdin;
    }
    const pageInput = await adapter.getInput();
    if (pageInput !== undefined) {
      setStdin(pageInput);
      return pageInput;
    }
    return "";
  }

  async function syncCodeInternal() {
    const sourceCode = await resolveCode();
    await backendClient.syncCode({
      pageUrl: adapter.getIdeUrl(),
      sourceCode,
      sourceFileName: DEFAULT_SOURCE_FILE
    });
    setStatus("Code synced");
  }

  async function syncCode() {
    await runAction("sync", "Syncing code", async () => {
      await syncCodeInternal();
    });
  }

  async function saveCppStandard() {
    try {
      const nextSettings = await backendClient.updateSettings({ cxxStandard });
      setSettings(nextSettings);
      setCxxStandard(nextSettings.cxxStandard);
      setStatus(`C++ standard set to ${nextSettings.cxxStandard}`);
    } catch (error) {
      setStatus(readErrorMessage(error, "Could not save C++ standard"));
    }
  }

  async function build() {
    await runAction("build", "Building locally", async () => {
      await syncCodeInternal();
      const result = await backendClient.build();
      setBuildResult(result);
      setConsoleView("build");
      setActiveTab("Console");
      setStatus(result.success ? "Build succeeded" : "Build failed");
      await mirrorOutputs({
        compileOutput: result.stderr || result.stdout || stringifyDiagnostics(result)
      });
    });
  }

  async function run() {
    await runAction("run", "Running locally", async () => {
      await syncCodeInternal();
      const effectiveStdin = await resolveStdin();
      setHasRunResult(false);
      setStdoutText("");
      setStderrText("");
      const result = await backendClient.run({ stdin: effectiveStdin });
      setHasRunResult(true);
      setStdoutText(result.stdout);
      setStderrText(result.stderr);
      setConsoleView(result.stderr ? "stderr" : "stdout");
      setActiveTab("Console");
      setStatus(result.timedOut ? "Run timed out" : `Run finished with exit code ${result.exitCode ?? "signal"}`);
      await mirrorOutputs({ stderr: result.stderr, stdout: result.stdout });
    });
  }

  async function startDebug() {
    try {
      setBusyAction("debug");
      setSelectedAction("debug");
      setStatus("Starting local debug session");
      await syncCodeInternal();
      const effectiveStdin = await resolveStdin();
      const state = await backendClient.debugStart({ stdin: effectiveStdin });
      setDebugState(state);
      setActiveTab("Debugger");
      await refreshDebugViews();
    } catch (error) {
      if (error instanceof BackendBuildError) {
        setBuildResult(error.result);
        setConsoleView("build");
        setActiveTab("Console");
      }
      setStatus(readErrorMessage(error, "Debug session could not start"));
    } finally {
      setBusyAction(null);
    }
  }

  async function continueDebug() {
    await runAction("continue", "Continuing debugger", async () => {
      setDebugState(await backendClient.debugContinue());
    });
  }

  async function pauseDebug() {
    await runAction("pause", "Pausing debugger", async () => {
      setDebugState(await backendClient.debugPause());
      await refreshDebugViews();
    });
  }

  async function stopDebug() {
    await runAction("stop", "Stopping debugger", async () => {
      setDebugState(await backendClient.debugStop());
    });
  }

  async function stepOver() {
    await runAction("stepOver", "Stepping over", async () => {
      setDebugState(await backendClient.stepOver());
      await refreshDebugViews();
    });
  }

  async function stepInto() {
    await runAction("stepInto", "Stepping into", async () => {
      setDebugState(await backendClient.stepInto());
      await refreshDebugViews();
    });
  }

  async function stepOut() {
    await runAction("stepOut", "Stepping out", async () => {
      setDebugState(await backendClient.stepOut());
      await refreshDebugViews();
    });
  }

  async function refreshDebugViews() {
    const [state, nextVariables, nextStack] = await Promise.all([
      backendClient.getDebugState(),
      backendClient.getVariables(),
      backendClient.getStack()
    ]);
    setDebugState(state);
    setVariables(nextVariables);
    setStack(nextStack);
  }

  async function saveWatch() {
    if (!watchInput.trim()) {
      return;
    }
    try {
      const nextWatch: WatchExpression = { expression: watchInput, id: `watch-${Date.now()}` };
      const nextWatches = [...watches, nextWatch];
      await backendClient.saveWatches({ watches: nextWatches });
      const evaluation = await backendClient.evaluate({ expression: watchInput });
      setWatches(nextWatches);
      setWatchResults((current) => [formatWatchResult(evaluation.expression, evaluation.value), ...current].slice(0, 10));
      setWatchInput("");
    } catch (error) {
      setStatus(readErrorMessage(error, "Could not evaluate watch expression"));
    }
  }

  async function toggleBreakpoint(explicitLine?: number) {
    const line = explicitLine ?? Number.parseInt(breakpointLine, 10);
    if (!Number.isFinite(line) || line <= 0) {
      setStatus("Choose a valid source line before toggling a breakpoint.");
      return;
    }
    setBreakpointLine(String(line));
    const breakpoint: Breakpoint = {
      enabled: true,
      file: DEFAULT_SOURCE_FILE,
      id: `bp-${DEFAULT_SOURCE_FILE}-${line}`,
      line
    };
    try {
      const hadBreakpoint = breakpointLines.includes(line);
      const response = await backendClient.toggleBreakpoint({ breakpoint });
      setDebugState((current) =>
        current ? { ...current, breakpoints: response.breakpoints } : { breakpoints: response.breakpoints, state: "idle", watches }
      );
      setStatus(hadBreakpoint ? `Breakpoint removed at line ${line}` : `Breakpoint added at line ${line}`);
    } catch (error) {
      setStatus(readErrorMessage(error, "Could not toggle breakpoint"));
    }
  }

  async function saveTestcase() {
    try {
      const effectiveStdin = await resolveStdin();
      await backendClient.createTestCase({ expectedOutput, input: effectiveStdin, name: testcaseName });
      setTestcases(await backendClient.getTestCases());
      setStatus(`Saved testcase "${testcaseName}"`);
    } catch (error) {
      setStatus(readErrorMessage(error, "Could not save testcase"));
    }
  }

  async function loadTestcase(testcase: TestCase) {
    setTestcaseName(testcase.name);
    setExpectedOutput(testcase.expectedOutput ?? "");
    setStdin(testcase.input);
    await adapter.setInput(testcase.input).catch(() => false);
    setStatus(`Loaded testcase "${testcase.name}"`);
  }

  async function deleteTestcase(id: string) {
    try {
      await backendClient.deleteTestCase(id);
      setTestcases(await backendClient.getTestCases());
      setStatus("Testcase removed");
    } catch (error) {
      setStatus(readErrorMessage(error, "Could not delete testcase"));
    }
  }

  async function openTargetUrl() {
    try {
      window.location.href = normalizeIdeUrl(targetUrl);
    } catch (error) {
      setStatus(readErrorMessage(error, "Could not open IDE URL"));
    }
  }

  async function runAction(action: ActionKey, actionLabel: string, task: () => Promise<void>) {
    try {
      setBusyAction(action);
      setSelectedAction(action);
      setStatus(actionLabel);
      await task();
    } catch (error) {
      const message = readErrorMessage(error, actionLabel);
      if (error instanceof BackendBuildError) {
        setBuildResult(error.result);
        setConsoleView("build");
        setActiveTab("Console");
        void mirrorOutputs({
          compileOutput: error.result.stderr || error.result.stdout || stringifyDiagnostics(error.result)
        });
      } else {
        setStderrText(message);
        setConsoleView("stderr");
        setActiveTab("Console");
        void mirrorOutputs({ stderr: message });
      }
      setStatus(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function mirrorOutputs(payload: OutputMirrorPayload) {
    await adapter.writeOutputs(payload).catch(() => ({
      compileOutput: false,
      stderr: false,
      stdout: false
    }));
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest("button, input, select, textarea, .usaco-helper-resize-handle")) {
      return;
    }
    event.preventDefault();
    const startFrame = frameRef.current;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      const nextPosition = {
        left: startFrame.left + (moveEvent.clientX - startX),
        top: startFrame.top + (moveEvent.clientY - startY)
      };
      const nextFrame = collapsedRef.current
        ? {
            ...startFrame,
            ...clampCollapsedPosition(nextPosition, getCollapsedWidth())
          }
        : clampFrame(
            {
              ...startFrame,
              ...nextPosition
            },
            startFrame.width,
            startFrame.height
          );
      frameRef.current = nextFrame;
      if (collapsedRef.current) {
        applyCollapsedFrame(hostElement, nextFrame);
      } else {
        applyFrame(hostElement, nextFrame);
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      saveFrame(frameRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function beginResize(handle: ResizeHandle, event: ReactPointerEvent<HTMLDivElement>) {
    if (collapsed) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const startFrame = frameRef.current;
    const startX = event.clientX;
    const startY = event.clientY;

    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextFrame = resizeFrame(startFrame, handle, deltaX, deltaY);
      frameRef.current = nextFrame;
      applyFrame(hostElement, nextFrame);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      saveFrame(frameRef.current);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function getActionButtonClass(action: ActionKey, activeWhen?: boolean) {
    const classes = ["usaco-helper-tool"];
    if (selectedAction === action || activeWhen) {
      classes.push("active");
    }
    if (busyAction === action) {
      classes.push("busy");
    }
    return classes.join(" ");
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      collapsedRef.current = next;
      hostElement.classList.toggle("usaco-helper-host-collapsed", next);
      if (next) {
        applyCollapsedFrame(hostElement, frameRef.current);
      } else {
        applyFrame(hostElement, frameRef.current);
      }
      return next;
    });
  }

  return (
    <div className={`usaco-helper-panel ${collapsed ? "collapsed" : ""}`}>
      <div className="usaco-helper-header" onPointerDown={beginDrag}>
        <div className="usaco-helper-title-group">
          <div className="usaco-helper-title">Debugger</div>
          <div className={`usaco-helper-badge status ${status === "Connected" ? "ok" : "muted"}`}>
            {collapsed ? collapsedStatus : status}
          </div>
          <div className={`usaco-helper-badge debug-mode ${debugMode}`}>{debugMode}</div>
        </div>
        <button className="usaco-helper-header-button" onClick={toggleCollapsed}>
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="usaco-helper-toolbar">
            <button className={getActionButtonClass("sync")} onClick={() => void syncCode()}>Sync</button>
            <button className={getActionButtonClass("build", consoleView === "build")} onClick={() => void build()}>Build</button>
            <button className={getActionButtonClass("run", consoleView === "stdout" || consoleView === "stderr")} onClick={() => void run()}>Run</button>
            <button className={getActionButtonClass("debug", canControlExecution)} onClick={() => void startDebug()}>Debug</button>
            <button className={getActionButtonClass("continue", isRunning)} onClick={() => void continueDebug()} disabled={!isPaused && debugMode !== "ready"}>Continue</button>
            <button className={getActionButtonClass("pause", isPaused)} onClick={() => void pauseDebug()} disabled={!isRunning}>Pause</button>
            <button className={`${getActionButtonClass("stop")} stop`} onClick={() => void stopDebug()} disabled={!canControlExecution}>Stop</button>
            <button className={getActionButtonClass("stepOver")} onClick={() => void stepOver()} disabled={!isPaused}>Over</button>
            <button className={getActionButtonClass("stepInto")} onClick={() => void stepInto()} disabled={!isPaused}>Into</button>
            <button className={getActionButtonClass("stepOut")} onClick={() => void stepOut()} disabled={!isPaused}>Out</button>
          </div>

          <div className="usaco-helper-tabs">
            {compactTabs.map((tab) => (
              <button key={tab} className={`usaco-helper-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          <div className="usaco-helper-body">
            {activeTab === "Console" && (
              <div className="usaco-helper-pane-grid">
                <div className="usaco-helper-card">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Input</div>
                    <div className="usaco-helper-mini-note">{capabilities.pageInput ? "Linked to page input" : "Local input only"}</div>
                  </div>
                  <textarea className="usaco-helper-textarea compact" value={stdin} onChange={(event) => {
                    const nextValue = event.target.value;
                    setStdin(nextValue);
                    void adapter.setInput(nextValue);
                  }} placeholder="stdin" />
                </div>

                <div className="usaco-helper-card fill">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-output-tabs">
                      {(["stdout", "stderr", "build"] as OutputView[]).map((view) => (
                        <button key={view} className={`usaco-helper-output-tab ${consoleView === view ? "active" : ""}`} onClick={() => setConsoleView(view)}>
                          {view}
                        </button>
                      ))}
                    </div>
                    <div className="usaco-helper-mini-note">{diffStatus}</div>
                  </div>
                  <div className="usaco-helper-console">{activeOutput}</div>
                </div>

                <div className="usaco-helper-card">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Expected</div>
                  </div>
                  <textarea className="usaco-helper-textarea compact" value={expectedOutput} onChange={(event) => setExpectedOutput(event.target.value)} placeholder="optional expected output" />
                </div>
              </div>
            )}

            {activeTab === "Debugger" && (
              <div className="usaco-helper-pane-grid debugger">
                <div className="usaco-helper-card">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Breakpoints</div>
                    <div className="usaco-helper-mini-note">Click the IDE line number</div>
                  </div>
                  <div className="usaco-helper-inline">
                    <input className="usaco-helper-input short" value={breakpointLine} onChange={(event) => setBreakpointLine(event.target.value)} placeholder="line" />
                    <button className="usaco-helper-button" onClick={() => void toggleBreakpoint()}>Toggle</button>
                  </div>
                  <div className="usaco-helper-breakpoint-list">{breakpointLines.length === 0 ? "No breakpoints" : breakpointLines.join(", ")}</div>
                </div>

                <div className="usaco-helper-card">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Watches</div>
                  </div>
                  <div className="usaco-helper-inline">
                    <input className="usaco-helper-input" value={watchInput} onChange={(event) => setWatchInput(event.target.value)} placeholder="expression" />
                    <button className="usaco-helper-button" onClick={() => void saveWatch()}>Eval</button>
                  </div>
                  <div className="usaco-helper-mini-list">
                    {watchResults.length === 0 ? <div className="usaco-helper-empty">No watches yet.</div> : watchResults.map((value) => (
                      <div key={value} className="usaco-helper-list-item compact">{value}</div>
                    ))}
                  </div>
                </div>

                <div className="usaco-helper-card fill">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Locals</div>
                  </div>
                  <div className="usaco-helper-mini-list scroll">
                    {variables.length === 0 ? <div className="usaco-helper-empty">Pause execution to inspect locals.</div> : variables.map((variable) => (
                      <div key={`${variable.name}-${variable.value}`} className="usaco-helper-list-item compact">
                        <strong>{variable.name}</strong>
                        <span>{variable.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="usaco-helper-card fill">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Frames</div>
                  </div>
                  <div className="usaco-helper-mini-list scroll">
                    {stack.length === 0 ? <div className="usaco-helper-empty">No stack frames yet.</div> : stack.map((frame) => (
                      <button key={`${frame.level}-${frame.line}-${frame.func ?? "frame"}`} className="usaco-helper-stack-button compact" onClick={() => frame.line && void adapter.revealLine(frame.line)}>
                        <strong>#{frame.level}</strong>
                        <span>{frame.func ?? "frame"}</span>
                        <span>{frame.file ?? DEFAULT_SOURCE_FILE}:{frame.line ?? "?"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Tests" && (
              <div className="usaco-helper-pane-grid">
                <div className="usaco-helper-card">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Save testcase</div>
                  </div>
                  <div className="usaco-helper-inline">
                    <input className="usaco-helper-input" value={testcaseName} onChange={(event) => setTestcaseName(event.target.value)} placeholder="test case name" />
                    <button className="usaco-helper-button" onClick={() => void saveTestcase()}>Save</button>
                  </div>
                </div>
                <div className="usaco-helper-card fill">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Saved</div>
                  </div>
                  <div className="usaco-helper-mini-list scroll">
                    {testcases.length === 0 ? <div className="usaco-helper-empty">No saved testcases.</div> : testcases.map((testcase) => (
                      <div key={testcase.id} className="usaco-helper-list-item testcase">
                        <div className="usaco-helper-testcase-meta">
                          <strong>{testcase.name}</strong>
                          <span>{testcase.input.length} chars</span>
                        </div>
                        <div className="usaco-helper-inline">
                          <button className="usaco-helper-button" onClick={() => void loadTestcase(testcase)}>Load</button>
                          <button className="usaco-helper-button" onClick={() => void deleteTestcase(testcase.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Settings" && (
              <div className="usaco-helper-pane-grid">
                <div className="usaco-helper-card">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">IDE URL</div>
                  </div>
                  <div className="usaco-helper-inline">
                    <input className="usaco-helper-input" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://ide.usaco.guide/<share-id> or share-id" />
                    <button className="usaco-helper-button" onClick={() => void openTargetUrl()}>Open</button>
                  </div>
                  <div className="usaco-helper-mini-note">Paste the full URL or only the share id.</div>
                </div>
                <div className="usaco-helper-card">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Local compiler</div>
                    <div className="usaco-helper-mini-note">{settings ? settings.compilerPath : "loading"}</div>
                  </div>
                  <div className="usaco-helper-inline">
                    <select className="usaco-helper-input" value={cxxStandard} onChange={(event) => setCxxStandard(event.target.value)}>
                      <option value="c++17">USACO C++17</option>
                      <option value="c++11">USACO C++11</option>
                      <option value="gnu++17">GNU++17 local</option>
                      <option value="gnu++11">GNU++11 local</option>
                    </select>
                    <button className="usaco-helper-button" onClick={() => void saveCppStandard()}>Save</button>
                  </div>
                  <div className="usaco-helper-mini-note">Build/Run use USACO-style <code>-O2 -lm</code>. Debug uses <code>-O0 -g</code> with the same standard.</div>
                </div>
                <div className="usaco-helper-card fill">
                  <div className="usaco-helper-section-head">
                    <div className="usaco-helper-section-title">Manual source override</div>
                    <div className="usaco-helper-mini-note">{capabilities.bridge ? "Automatic editor sync enabled" : "Automatic editor sync not detected"}</div>
                  </div>
                  <textarea className="usaco-helper-textarea" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder={adapter.getManualSyncHint()} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!collapsed && resizeHandles.map((handle) => (
        <div
          key={handle}
          aria-hidden="true"
          className={`usaco-helper-resize-handle ${handle}`}
          onPointerDown={(event) => beginResize(handle, event)}
        />
      ))}
    </div>
  );
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function stringifyDiagnostics(result: BuildResult): string {
  return result.diagnostics.map((diagnostic) => diagnostic.raw).join("\n");
}

function formatWatchResult(expression: string, value: string): string {
  return `${expression} = ${value}`;
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BackendBuildError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return firstMeaningfulLine(error.message) ?? fallback;
  }
  return fallback;
}

function firstMeaningfulLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function readInitialFrame(): PanelFrame {
  const fallback = createDefaultFrame();
  try {
    const raw = window.localStorage.getItem(PANEL_FRAME_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<PanelFrame>;
    if (
      typeof parsed.left !== "number" ||
      typeof parsed.top !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return fallback;
    }
    return clampFrame(parsed as PanelFrame, parsed.width, parsed.height);
  } catch {
    return fallback;
  }
}

function createDefaultFrame(): PanelFrame {
  const width = 392;
  const height = 440;
  return clampFrame(
    {
      height,
      left: window.innerWidth - width - 18,
      top: Math.max(16, window.innerHeight - height - 18),
      width
    },
    width,
    height
  );
}

function clampFrame(frame: PanelFrame, width: number, height: number): PanelFrame {
  const safeWidth = Math.min(Math.max(width, 320), Math.max(320, window.innerWidth - 16));
  const safeHeight = Math.min(Math.max(height, 260), Math.max(260, window.innerHeight - 16));
  return {
    height: safeHeight,
    left: clamp(frame.left, 8, Math.max(8, window.innerWidth - safeWidth - 8)),
    top: clamp(frame.top, 8, Math.max(8, window.innerHeight - safeHeight - 8)),
    width: safeWidth
  };
}

function resizeFrame(startFrame: PanelFrame, handle: ResizeHandle, deltaX: number, deltaY: number): PanelFrame {
  let left = startFrame.left;
  let top = startFrame.top;
  let width = startFrame.width;
  let height = startFrame.height;

  if (handle.includes("e")) {
    width = startFrame.width + deltaX;
  }
  if (handle.includes("s")) {
    height = startFrame.height + deltaY;
  }
  if (handle.includes("w")) {
    left = startFrame.left + deltaX;
    width = startFrame.width - deltaX;
  }
  if (handle.includes("n")) {
    top = startFrame.top + deltaY;
    height = startFrame.height - deltaY;
  }

  return clampFrame({ height, left, top, width }, width, height);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getCollapsedWidth(): number {
  return Math.min(Math.max(COLLAPSED_FRAME.width, COLLAPSED_FRAME.minWidth), window.innerWidth - 16, COLLAPSED_FRAME.maxWidth);
}

function clampCollapsedPosition(position: Pick<PanelFrame, "left" | "top">, width: number): Pick<PanelFrame, "left" | "top"> {
  return {
    left: clamp(position.left, 8, Math.max(8, window.innerWidth - width - 8)),
    top: clamp(position.top, 8, Math.max(8, window.innerHeight - COLLAPSED_FRAME.height - 8))
  };
}

function applyFrame(hostElement: HTMLElement, frame: PanelFrame) {
  hostElement.style.minWidth = "";
  hostElement.style.minHeight = "";
  hostElement.style.left = `${frame.left}px`;
  hostElement.style.top = `${frame.top}px`;
  hostElement.style.width = `${frame.width}px`;
  hostElement.style.height = `${frame.height}px`;
  hostElement.style.right = "auto";
  hostElement.style.bottom = "auto";
}

function applyCollapsedFrame(hostElement: HTMLElement, frame: PanelFrame) {
  const width = getCollapsedWidth();
  const { left, top } = clampCollapsedPosition(frame, width);

  hostElement.style.minWidth = "0";
  hostElement.style.minHeight = "0";
  hostElement.style.left = `${left}px`;
  hostElement.style.top = `${top}px`;
  hostElement.style.width = `${width}px`;
  hostElement.style.height = `${COLLAPSED_FRAME.height}px`;
  hostElement.style.right = "auto";
  hostElement.style.bottom = "auto";
}

function saveFrame(frame: PanelFrame) {
  try {
    window.localStorage.setItem(PANEL_FRAME_STORAGE_KEY, JSON.stringify(frame));
  } catch {}
}

function normalizeIdeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Paste an ide.usaco.guide URL or share id.");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    if (!/(^|\.)ide\.usaco\.guide$/i.test(parsed.hostname)) {
      throw new Error("Use an ide.usaco.guide URL.");
    }
    return parsed.toString();
  }
  return `https://ide.usaco.guide/${trimmed.replace(/^\/+/, "")}`;
}

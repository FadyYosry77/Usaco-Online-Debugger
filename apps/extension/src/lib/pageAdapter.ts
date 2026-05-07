export interface PageCapabilities {
  breakpointClicks: boolean;
  bridge: boolean;
  lineDecorations: boolean;
  monacoModelCount: number;
  pageInput: boolean;
  pageOutput: boolean;
}

export interface OutputMirrorPayload {
  compileOutput?: string;
  stderr?: string;
  stdout?: string;
}

export interface OutputMirrorResult {
  compileOutput: boolean;
  stderr: boolean;
  stdout: boolean;
}

export interface PageAdapter {
  destroy(): void;
  getCapabilities(): PageCapabilities;
  getCode(): Promise<string>;
  getIdeUrl(): string;
  getInput(): Promise<string | undefined>;
  getLanguage(): Promise<string>;
  getManualSyncHint(): string;
  isSupportedPage(): boolean;
  revealLine(line: number): Promise<void>;
  setInput(value: string): Promise<boolean>;
  subscribeBreakpointToggle(handler: (line: number) => void): () => void;
  syncDecorations(state: { activeLine?: number; breakpointLines: number[] }): Promise<void>;
  writeOutputs(payload: OutputMirrorPayload): Promise<OutputMirrorResult>;
}

type BridgeModelSummary = {
  attached: boolean;
  index: number;
  languageId: string;
  lineCount: number;
  uri: string;
  valueLength: number;
};

type BridgeAction =
  | "getCode"
  | "getInput"
  | "getModelSummaries"
  | "setBreakpointDecorations"
  | "setInput"
  | "setOutputs";

interface BridgeRequestMessage {
  action: BridgeAction;
  id: string;
  payload?: unknown;
  type: typeof BRIDGE_REQUEST_TYPE;
}

interface BridgeResponseMessage {
  error?: string;
  id: string;
  ok: boolean;
  type: typeof BRIDGE_RESPONSE_TYPE;
  value?: unknown;
}

declare global {
  interface Window {
    __USACO_EDITOR_BRIDGE__?: {
      getCode?: () => string | undefined;
      getInput?: () => string | undefined;
      getModelSummaries?: () => BridgeModelSummary[];
      setBreakpointDecorations?: (state: { activeLine?: number; breakpointLines: number[] }) => boolean;
      setInput?: (value: string) => boolean;
      setOutputs?: (payload: OutputMirrorPayload) => OutputMirrorResult;
    };
  }
}

const BRIDGE_REQUEST_TYPE = "USACO_HELPER_BRIDGE_REQUEST";
const BRIDGE_RESPONSE_TYPE = "USACO_HELPER_BRIDGE_RESPONSE";
const BRIDGE_BREAKPOINT_TOGGLE_TYPE = "USACO_HELPER_BREAKPOINT_TOGGLE";
const BRIDGE_TIMEOUT_MS = 250;
const CODE_BRIDGE_RETRY_COUNT = 10;
const CODE_BRIDGE_RETRY_DELAY_MS = 150;
const PANEL_ROOT_SELECTOR = "#usaco-local-debug-helper-root";

export class UsacoPageAdapter implements PageAdapter {
  private activeLine?: number;
  private breakpointLines = new Set<number>();
  private bridgeRequestCounter = 0;
  private cachedBridge = false;
  private cachedModelSummaries: BridgeModelSummary[] = [];
  private observer?: MutationObserver;
  private breakpointUnsubscribe?: () => void;
  private breakpointHandler?: (line: number) => void;
  private overlay?: HTMLDivElement;
  private overlayRefreshFrame = 0;
  private readonly scheduleOverlayRefresh = () => {
    if (this.overlayRefreshFrame) {
      return;
    }
    this.overlayRefreshFrame = window.requestAnimationFrame(() => {
      this.overlayRefreshFrame = 0;
      this.renderBreakpointOverlay();
    });
  };

  destroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.breakpointUnsubscribe?.();
    this.breakpointUnsubscribe = undefined;
    this.breakpointHandler = undefined;
    if (this.overlayRefreshFrame) {
      window.cancelAnimationFrame(this.overlayRefreshFrame);
      this.overlayRefreshFrame = 0;
    }
    this.overlay?.remove();
    this.overlay = undefined;
  }

  isSupportedPage(): boolean {
    return /(^|\.)ide\.usaco\.guide$/i.test(window.location.hostname);
  }

  getIdeUrl(): string {
    return window.location.href;
  }

  async getCode(): Promise<string> {
    const directBridgeCode = this.callDirectBridge<string | undefined>("getCode");
    if (directBridgeCode?.trim()) {
      this.cachedBridge = true;
      return directBridgeCode;
    }

    const textarea = this.findVisibleCodeTextarea();
    if (textarea?.value.trim()) {
      return textarea.value;
    }

    const bridgeCode = await this.getBridgeCodeWithRetry();
    if (bridgeCode?.trim()) {
      return bridgeCode;
    }

    throw new Error(
      "Could not read source from the USACO editor. Click inside the code editor, wait for the page to finish saving, then press Sync again."
    );
  }

  async getInput(): Promise<string | undefined> {
    const bridgeInput = await this.callBridge<string | undefined>("getInput").catch(() => undefined);
    if (bridgeInput !== undefined) {
      return bridgeInput;
    }

    const textarea = this.findVisibleInputTextarea();
    if (textarea) {
      return textarea.value;
    }

    return undefined;
  }

  async setInput(value: string): Promise<boolean> {
    const didSetBridge = await this.callBridge<boolean>("setInput", value).catch(() => false);
    if (didSetBridge) {
      return true;
    }

    const textarea = this.findVisibleInputTextarea();
    if (!textarea) {
      return false;
    }

    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async writeOutputs(payload: OutputMirrorPayload): Promise<OutputMirrorResult> {
    const bridgeResult = (await this.callBridge<OutputMirrorResult>("setOutputs", payload).catch(() => ({
      compileOutput: false,
      stderr: false,
      stdout: false
    }))) ?? {
      compileOutput: false,
      stderr: false,
      stdout: false
    };

    const result: OutputMirrorResult = { ...bridgeResult };

    if (!result.stdout && payload.stdout !== undefined) {
      result.stdout = this.writeOutputTextarea(["stdout"], payload.stdout);
    }
    if (!result.stderr && payload.stderr !== undefined) {
      result.stderr = this.writeOutputTextarea(["stderr"], payload.stderr);
    }
    if (!result.compileOutput && payload.compileOutput !== undefined) {
      result.compileOutput = this.writeOutputTextarea(["compile output", "compile", "build"], payload.compileOutput);
    }

    return result;
  }

  async getLanguage(): Promise<string> {
    const summaries = await this.getBridgeModelSummaries();
    const codeModel = summaries.find((summary) => /(c|cpp|c\+\+)/i.test(summary.languageId));
    if (codeModel?.languageId) {
      return codeModel.languageId;
    }
    return "cpp";
  }

  async revealLine(line: number): Promise<void> {
    const lines = this.findCodeLines();
    const target = lines[line - 1];
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    this.activeLine = line;
    this.applyDecorations();
  }

  async syncDecorations(state: { activeLine?: number; breakpointLines: number[] }): Promise<void> {
    this.activeLine = state.activeLine;
    this.breakpointLines = new Set(state.breakpointLines);
    await this.callBridge<boolean>("setBreakpointDecorations", state).catch(() => false);
    this.ensureObserver();
    this.applyDecorations();
    this.renderBreakpointOverlay();
  }

  subscribeBreakpointToggle(handler: (line: number) => void): () => void {
    this.breakpointHandler = handler;
    const bridgeListener = (event: MessageEvent) => {
      if (!isSameWindowMessage(event) || !isBridgeBreakpointToggle(event.data)) {
        return;
      }
      handler(event.data.line);
    };

    const listener = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(PANEL_ROOT_SELECTOR)) {
        return;
      }

      const line = this.extractClickedLine(target, event);
      if (!line || !this.isEditorNode(target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handler(line);
    };

    window.addEventListener("message", bridgeListener);
    window.addEventListener("resize", this.scheduleOverlayRefresh);
    document.addEventListener("scroll", this.scheduleOverlayRefresh, true);
    document.addEventListener("click", listener, true);
    const unsubscribe = () => {
      this.breakpointHandler = undefined;
      window.removeEventListener("message", bridgeListener);
      window.removeEventListener("resize", this.scheduleOverlayRefresh);
      document.removeEventListener("scroll", this.scheduleOverlayRefresh, true);
      document.removeEventListener("click", listener, true);
    };
    this.breakpointUnsubscribe = unsubscribe;
    this.renderBreakpointOverlay();
    return unsubscribe;
  }

  getManualSyncHint(): string {
    return "Optional: paste source here only if you want to override automatic editor sync.";
  }

  getCapabilities(): PageCapabilities {
    return {
      breakpointClicks: Boolean(this.findLineNumberNode()),
      bridge: this.cachedBridge || Boolean(window.__USACO_EDITOR_BRIDGE__?.getCode),
      lineDecorations: this.findCodeLines().length > 0,
      monacoModelCount: this.readDirectModelSummaries()?.length ?? this.cachedModelSummaries.length,
      pageInput: Boolean(this.findVisibleInputTextarea() || this.cachedBridge),
      pageOutput: Boolean(this.cachedBridge || window.__USACO_EDITOR_BRIDGE__?.setOutputs || this.findOutputTab(["stdout"])),
    };
  }

  private async getBridgeModelSummaries(): Promise<BridgeModelSummary[]> {
    const summaries = (await this.callBridge<BridgeModelSummary[]>("getModelSummaries").catch(() => [])) ?? [];
    this.cachedModelSummaries = summaries;
    return summaries;
  }

  private async getBridgeCodeWithRetry(): Promise<string | undefined> {
    for (let attempt = 0; attempt <= CODE_BRIDGE_RETRY_COUNT; attempt += 1) {
      const code = await this.callBridge<string | undefined>("getCode").catch(() => undefined);
      if (code?.trim()) {
        return code;
      }

      if (attempt < CODE_BRIDGE_RETRY_COUNT) {
        await delay(CODE_BRIDGE_RETRY_DELAY_MS);
      }
    }

    return undefined;
  }

  private async callBridge<T>(action: BridgeAction, payload?: unknown): Promise<T | undefined> {
    const direct = this.callDirectBridge<T>(action, payload);
    if (direct !== undefined) {
      this.cachedBridge = true;
      if (action === "getModelSummaries" && Array.isArray(direct)) {
        this.cachedModelSummaries = direct as BridgeModelSummary[];
      }
      return direct;
    }

    return this.callWindowBridge<T>(action, payload);
  }

  private callDirectBridge<T>(action: BridgeAction, payload?: unknown): T | undefined {
    const bridge = window.__USACO_EDITOR_BRIDGE__;
    if (!bridge) {
      return undefined;
    }

    switch (action) {
      case "getCode":
        return bridge.getCode?.() as T | undefined;
      case "getInput":
        return bridge.getInput?.() as T | undefined;
      case "getModelSummaries":
        return bridge.getModelSummaries?.() as T | undefined;
      case "setBreakpointDecorations":
        return bridge.setBreakpointDecorations?.(isBreakpointDecorationPayload(payload) ? payload : { breakpointLines: [] }) as T | undefined;
      case "setInput":
        return bridge.setInput?.(typeof payload === "string" ? payload : "") as T | undefined;
      case "setOutputs":
        return bridge.setOutputs?.(isOutputPayload(payload) ? payload : {}) as T | undefined;
      default:
        return undefined;
    }
  }

  private callWindowBridge<T>(action: BridgeAction, payload?: unknown): Promise<T | undefined> {
    const id = `usaco-helper-${Date.now()}-${this.bridgeRequestCounter++}`;
    const message: BridgeRequestMessage = {
      action,
      id,
      payload,
      type: BRIDGE_REQUEST_TYPE
    };

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("Timed out waiting for the USACO editor bridge."));
      }, BRIDGE_TIMEOUT_MS);

      const handleMessage = (event: MessageEvent) => {
        if (!isSameWindowMessage(event) || !isBridgeResponse(event.data) || event.data.id !== id) {
          return;
        }

        window.clearTimeout(timer);
        window.removeEventListener("message", handleMessage);

        if (!event.data.ok) {
          reject(new Error(event.data.error ?? "USACO editor bridge request failed."));
          return;
        }

        this.cachedBridge = true;
        if (action === "getModelSummaries" && Array.isArray(event.data.value)) {
          this.cachedModelSummaries = event.data.value as BridgeModelSummary[];
        }
        resolve(event.data.value as T);
      };

      window.addEventListener("message", handleMessage);
      window.postMessage(message, window.location.origin);
    });
  }

  private readDirectModelSummaries(): BridgeModelSummary[] | undefined {
    try {
      return window.__USACO_EDITOR_BRIDGE__?.getModelSummaries?.();
    } catch {
      return undefined;
    }
  }

  private ensureObserver(): void {
    if (this.observer) {
      return;
    }

    const root = this.findCodeSurfaceRoot();
    if (!root) {
      return;
    }

    this.observer = new MutationObserver(() => {
      this.applyDecorations();
      this.scheduleOverlayRefresh();
    });

    this.observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  private applyDecorations(): void {
    const lines = this.findCodeLines();
    for (const [index, node] of lines.entries()) {
      const lineNumber = index + 1;
      node.classList.toggle("usaco-helper-breakpoint-line", this.breakpointLines.has(lineNumber));
      node.classList.toggle("usaco-helper-active-line", this.activeLine === lineNumber);
      node.setAttribute("data-usaco-helper-line", String(lineNumber));
    }

    const gutterNodes = this.findGutterLineNodes();
    for (const [index, node] of gutterNodes.entries()) {
      const parsed = Number.parseInt(normalizeText(node.textContent), 10);
      const lineNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1;
      node.classList.add("usaco-helper-gutter-line");
      node.classList.toggle("usaco-helper-breakpoint-gutter", this.breakpointLines.has(lineNumber));
      node.classList.toggle("usaco-helper-active-gutter", this.activeLine === lineNumber);
      node.setAttribute("data-usaco-helper-line", String(lineNumber));
      syncBreakpointDot(node, this.breakpointLines.has(lineNumber));
    }
  }

  private renderBreakpointOverlay(): void {
    const rows = this.findBreakpointRows();
    if (rows.length === 0) {
      this.overlay?.remove();
      this.overlay = undefined;
      return;
    }

    const overlay = this.ensureBreakpointOverlay();
    overlay.textContent = "";

    for (const row of rows) {
      const hitTarget = document.createElement("button");
      hitTarget.type = "button";
      hitTarget.className = "usaco-helper-breakpoint-hit";
      hitTarget.classList.toggle("active", this.breakpointLines.has(row.line));
      hitTarget.style.left = `${row.left}px`;
      hitTarget.style.top = `${row.top}px`;
      hitTarget.style.width = `${row.width}px`;
      hitTarget.style.height = `${row.height}px`;
      hitTarget.title = `Toggle local breakpoint on line ${row.line}`;
      hitTarget.setAttribute("aria-label", `Toggle local breakpoint on line ${row.line}`);
      hitTarget.dataset.line = String(row.line);
      hitTarget.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.breakpointHandler?.(row.line);
      });
      overlay.appendChild(hitTarget);
    }
  }

  private ensureBreakpointOverlay(): HTMLDivElement {
    if (this.overlay?.isConnected) {
      return this.overlay;
    }

    const overlay = document.createElement("div");
    overlay.className = "usaco-helper-breakpoint-overlay";
    overlay.setAttribute("aria-hidden", "false");
    document.body.appendChild(overlay);
    this.overlay = overlay;
    return overlay;
  }

  private findBreakpointRows(): Array<{ height: number; left: number; line: number; top: number; width: number }> {
    const gutterRows = this.findGutterLineNodes()
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        const line = parsePositiveInteger(node.getAttribute("data-usaco-helper-line"))
          ?? parsePositiveInteger(node.textContent)
          ?? index + 1;
        return rect.height > 0 && rect.width > 0
          ? {
            height: Math.max(16, rect.height),
            left: Math.max(0, rect.left - 2),
            line,
            top: rect.top,
            width: Math.max(18, rect.width + 4)
          }
          : undefined;
      })
      .filter((row): row is { height: number; left: number; line: number; top: number; width: number } => Boolean(row));

    if (gutterRows.length > 0) {
      return gutterRows;
    }

    return this.findCodeLines()
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return rect.height > 0
          ? {
            height: Math.max(16, rect.height),
            left: Math.max(0, rect.left - 24),
            line: index + 1,
            top: rect.top,
            width: 22
          }
          : undefined;
      })
      .filter((row): row is { height: number; left: number; line: number; top: number; width: number } => Boolean(row));
  }

  private findVisibleCodeTextarea(): HTMLTextAreaElement | undefined {
    return this.findVisibleTextareas()
      .filter((node) => looksLikeCompleteCppSource(node.value))
      .sort((left, right) => right.value.length - left.value.length)[0];
  }

  private findVisibleInputTextarea(): HTMLTextAreaElement | undefined {
    const labeled = this.findInputSurface();
    if (labeled instanceof HTMLTextAreaElement) {
      return labeled;
    }

    return this.findVisibleTextareas()
      .filter((node) => !looksLikeCompleteCppSource(node.value))
      .sort((left, right) => left.value.length - right.value.length)[0];
  }

  private findVisibleTextareas(): HTMLTextAreaElement[] {
    return [...document.querySelectorAll("textarea")]
      .filter((node): node is HTMLTextAreaElement => isPageNode(node) && isVisible(node));
  }

  private findCodeLines(): Element[] {
    return [
      ...document.querySelectorAll(
        ".view-lines .view-line, .view-line, .cm-content .cm-line, .cm-line"
      )
    ].filter((node) => isPageNode(node) && isVisible(node));
  }

  private findCodeSurfaceRoot(): Element | undefined {
    return [
      ...document.querySelectorAll(".monaco-editor, .cm-editor, .view-lines, .cm-content")
    ].find((node) => isPageNode(node) && isVisible(node));
  }

  private findLineNumberNode(): Element | undefined {
    return this.findGutterLineNodes()[0];
  }

  private findGutterLineNodes(): Element[] {
    return [
      ...document.querySelectorAll(".margin-view-overlays .line-numbers, .line-numbers, .cm-gutterElement")
    ].filter((node) => {
      if (!isPageNode(node) || !isVisible(node)) {
        return false;
      }

      const parsed = Number.parseInt(normalizeText(node.textContent), 10);
      return Number.isFinite(parsed) && parsed > 0;
    });
  }

  private isEditorNode(node: Element): boolean {
    return Boolean(
      node.closest(
        ".monaco-editor, .cm-editor, .view-lines, .cm-content, .line-numbers, .cm-gutterElement, .margin-view-overlays, .glyph-margin, .margin"
      )
    );
  }

  private extractClickedLine(target: Element, event: MouseEvent): number | undefined {
    return extractLineNumber(target)
      ?? this.lineFromExistingDecoration(target)
      ?? this.lineFromGutterCoordinates(target, event.clientY);
  }

  private lineFromExistingDecoration(target: Element): number | undefined {
    const lineNode = target.closest("[data-usaco-helper-line]");
    if (!lineNode) {
      return undefined;
    }

    return parsePositiveInteger(lineNode.getAttribute("data-usaco-helper-line"));
  }

  private lineFromGutterCoordinates(target: Element, clientY: number): number | undefined {
    const gutterRoot = target.closest(".margin-view-overlays, .cm-gutters, .glyph-margin, .margin");
    if (!gutterRoot) {
      return undefined;
    }

    const gutterNodes = this.findGutterLineNodes();
    for (const [index, node] of gutterNodes.entries()) {
      const rect = node.getBoundingClientRect();
      if (rect.height <= 0) {
        continue;
      }

      if (clientY >= rect.top - 2 && clientY <= rect.bottom + 2) {
        return parsePositiveInteger(node.getAttribute("data-usaco-helper-line"))
          ?? parsePositiveInteger(node.textContent)
          ?? index + 1;
      }
    }

    const lineNodes = this.findCodeLines();
    for (const [index, node] of lineNodes.entries()) {
      const rect = node.getBoundingClientRect();
      if (rect.height > 0 && clientY >= rect.top - 2 && clientY <= rect.bottom + 2) {
        return index + 1;
      }
    }

    return undefined;
  }

  private findInputSurface(): Element | undefined {
    return this.findLabeledSurface(["input", "stdin"]);
  }

  private findOutputTab(labels: string[]): HTMLElement | undefined {
    return [...document.querySelectorAll("button, [role='tab'], div, span")]
      .find((node): node is HTMLElement =>
        isPageNode(node) && isVisible(node) && labels.some((label) => normalizeText(node.textContent).includes(label))
      );
  }

  private findLabeledSurface(labels: string[]): Element | undefined {
    const label = [...document.querySelectorAll("button, [role='tab'], h1, h2, h3, h4, h5, div, span")]
      .find((node) => isPageNode(node) && isVisible(node) && labels.some((value) => normalizeText(node.textContent).includes(value)));

    if (!label) {
      return undefined;
    }

    const directSibling = label.nextElementSibling;
    if (directSibling?.matches("textarea, pre, code, .monaco-editor, .cm-editor")) {
      return directSibling;
    }

    const container = label.closest("section, article, div") ?? label.parentElement;
    if (container) {
      const nestedSurface = [...container.querySelectorAll("textarea, pre, code, .monaco-editor, .cm-editor")]
        .find((node) => isPageNode(node));
      if (nestedSurface) {
        return nestedSurface;
      }
    }

    const parentSibling = label.parentElement?.nextElementSibling;
    if (parentSibling?.matches("textarea, pre, code, .monaco-editor, .cm-editor")) {
      return parentSibling;
    }

    return undefined;
  }

  private writeOutputTextarea(labels: string[], value: string): boolean {
    const tab = this.findOutputTab(labels);
    if (tab) {
      tab.click();
    }

    const surface = this.findLabeledSurface(labels);
    if (surface instanceof HTMLTextAreaElement) {
      surface.value = value;
      surface.dispatchEvent(new Event("input", { bubbles: true }));
      surface.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return false;
  }
}

function isVisible(node: Element): boolean {
  const style = window.getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden";
}

function isPageNode(node: Element): boolean {
  return !node.closest(PANEL_ROOT_SELECTOR);
}

function looksLikeCompleteCppSource(value: string): boolean {
  const sample = value.trim();
  if (!sample) {
    return false;
  }

  const meaningfulLineCount = sample
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
  const hasInclude = /^\s*#\s*include\b/m.test(sample);
  const hasMain = /\b(?:int|int32_t|signed|auto)\s+main\s*\(/.test(sample);
  const hasUsingNamespace = /\busing\s+namespace\s+std\s*;/.test(sample);
  const hasTemplateBody = /\b(?:cin|cout|vector|map|set|ios_base|freopen)\b/.test(sample);

  return hasMain || (hasInclude && meaningfulLineCount >= 2 && (hasUsingNamespace || hasTemplateBody));
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function extractLineNumber(target: Element): number | undefined {
  const directLineNode = target.closest(".line-numbers, .cm-gutterElement");
  const directText = parsePositiveInteger(directLineNode?.textContent ?? target.textContent);
  if (directText !== undefined && (Boolean(directLineNode) || isLineNumberLike(target))) {
    return directText;
  }

  return undefined;
}

function isLineNumberLike(node: Element): boolean {
  const className = typeof node.className === "string" ? node.className : "";
  return /line-number|line-numbers|gutter/i.test(className);
}

function parsePositiveInteger(value: string | null | undefined): number | undefined {
  const parsed = Number.parseInt(normalizeText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function syncBreakpointDot(node: Element, active: boolean): void {
  const existing = node.querySelector(":scope > .usaco-helper-breakpoint-dot");
  if (!active) {
    existing?.remove();
    return;
  }

  if (existing) {
    return;
  }

  const dot = document.createElement("span");
  dot.className = "usaco-helper-breakpoint-dot";
  dot.setAttribute("aria-hidden", "true");
  node.prepend(dot);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isBridgeResponse(value: unknown): value is BridgeResponseMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<BridgeResponseMessage>;
  return data.type === BRIDGE_RESPONSE_TYPE && typeof data.id === "string" && typeof data.ok === "boolean";
}

function isBridgeBreakpointToggle(value: unknown): value is { line: number; type: typeof BRIDGE_BREAKPOINT_TOGGLE_TYPE } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<{ line: unknown; type: unknown }>;
  return data.type === BRIDGE_BREAKPOINT_TOGGLE_TYPE
    && typeof data.line === "number"
    && Number.isInteger(data.line)
    && data.line > 0;
}

function isSameWindowMessage(event: MessageEvent): boolean {
  const sameSource = event.source === window || event.source === null;
  const sameOrigin = !event.origin || event.origin === window.location.origin;
  return sameSource && sameOrigin;
}

function isOutputPayload(value: unknown): value is OutputMirrorPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as OutputMirrorPayload;
  return (candidate.compileOutput === undefined || typeof candidate.compileOutput === "string")
    && (candidate.stderr === undefined || typeof candidate.stderr === "string")
    && (candidate.stdout === undefined || typeof candidate.stdout === "string");
}

function isBreakpointDecorationPayload(
  value: unknown
): value is { activeLine?: number; breakpointLines: number[] } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<{ activeLine: unknown; breakpointLines: unknown }>;
  return (candidate.activeLine === undefined || typeof candidate.activeLine === "number")
    && Array.isArray(candidate.breakpointLines)
    && candidate.breakpointLines.every((line) => Number.isInteger(line) && line > 0);
}

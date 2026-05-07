(function installBridge() {
  type MonacoLikeModel = {
    getLanguageId?: () => string;
    getValue: () => string;
    isAttachedToEditor?: () => boolean;
    isDisposed?: () => boolean;
    setValue: (value: string) => void;
    uri?: {
      path?: string;
      toString: () => string;
    };
  };

  type MonacoLikeEditor = {
    deltaDecorations?: (
      oldDecorations: string[],
      newDecorations: Array<{
        range: {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        };
        options: Record<string, unknown>;
      }>
    ) => string[];
    getDomNode?: () => HTMLElement | null;
    getModel?: () => MonacoLikeModel | null;
    onMouseDown?: (handler: (event: MonacoMouseDownEvent) => void) => { dispose: () => void };
  };

  type MonacoMouseDownEvent = {
    event?: {
      preventDefault?: () => void;
      stopPropagation?: () => void;
    };
    target?: {
      element?: Element | null;
      position?: {
        lineNumber?: number;
      } | null;
      type?: number;
    };
  };

  type BridgeModelSummary = {
    index: number;
    languageId: string;
    uri: string;
    valueLength: number;
    lineCount: number;
    attached: boolean;
  };

  type OutputChannels = {
    compileOutput?: string;
    stderr?: string;
    stdout?: string;
  };

  type OutputWriteResult = {
    compileOutput: boolean;
    stderr: boolean;
    stdout: boolean;
  };

  type EditorBridge = {
    getCode: () => string | undefined;
    getInput: () => string | undefined;
    getModelSummaries: () => BridgeModelSummary[];
    setBreakpointDecorations: (state: BreakpointDecorationState) => boolean;
    setInput: (value: string) => boolean;
    setOutputs: (channels: OutputChannels) => OutputWriteResult;
  };

  type BreakpointDecorationState = {
    activeLine?: number;
    breakpointLines: number[];
  };

  const scope = window as typeof window & {
    __USACO_EDITOR_BRIDGE__?: EditorBridge;
    __USACO_EDITOR_BRIDGE_MESSAGE_READY__?: boolean;
    monaco?: {
      editor?: {
        getEditors?: () => MonacoLikeEditor[];
        getModels?: () => MonacoLikeModel[];
      };
    };
  };
  const requestType = "USACO_HELPER_BRIDGE_REQUEST";
  const responseType = "USACO_HELPER_BRIDGE_RESPONSE";
  const breakpointToggleType = "USACO_HELPER_BREAKPOINT_TOGGLE";
  let breakpointDecorationIds: string[] = [];
  let breakpointMouseDisposable: { dispose: () => void } | undefined;
  let breakpointMouseEditor: MonacoLikeEditor | undefined;
  let domBreakpointListenerReady = false;

  if (!scope.__USACO_EDITOR_BRIDGE__) {
    scope.__USACO_EDITOR_BRIDGE__ = {
      getCode() {
        const roles = inferRoles(getModels());
        const model = roles.codeIndex !== undefined ? getModels()[roles.codeIndex] : undefined;
        return model?.getValue();
      },
      getInput() {
        const models = getModels();
        const roles = inferRoles(models);
        const model = roles.inputIndex !== undefined ? models[roles.inputIndex] : undefined;
        return model?.getValue();
      },
      getModelSummaries() {
        return summarizeModels(getModels());
      },
      setBreakpointDecorations(state) {
        installBreakpointForwarding();
        return setBreakpointDecorations(state);
      },
      setInput(value) {
        const models = getModels();
        const roles = inferRoles(models);
        const model = roles.inputIndex !== undefined ? models[roles.inputIndex] : undefined;
        if (!model) {
          return false;
        }

        model.setValue(value);
        return true;
      },
      setOutputs(channels) {
        let models = getModels();
        const roles = inferRoles(models);
        const result: OutputWriteResult = {
          compileOutput: false,
          stderr: false,
          stdout: false
        };

        result.stdout = writeOutputChannel(models, "stdout", channels.stdout, roles.stdoutIndex);
        models = getModels();
        result.stderr = writeOutputChannel(models, "stderr", channels.stderr, roles.stderrIndex);
        models = getModels();
        result.compileOutput = writeOutputChannel(models, "compile output", channels.compileOutput, roles.compileIndex);

        return result;
      }
    };
  }

  if (!scope.__USACO_EDITOR_BRIDGE_MESSAGE_READY__) {
    scope.__USACO_EDITOR_BRIDGE_MESSAGE_READY__ = true;
    window.addEventListener("message", (event) => {
      if (event.source !== window || !isBridgeRequest(event.data)) {
        return;
      }

      const bridge = scope.__USACO_EDITOR_BRIDGE__;
      if (!bridge) {
        return;
      }

      try {
        const value = handleBridgeRequest(bridge, event.data);
        window.postMessage({
          id: event.data.id,
          ok: true,
          type: responseType,
          value
        }, window.location.origin);
      } catch (error) {
        window.postMessage({
          error: error instanceof Error ? error.message : "Bridge request failed",
          id: event.data.id,
          ok: false,
          type: responseType
        }, window.location.origin);
      }
    });
  }

  installBreakpointForwarding();

  function getModels(): MonacoLikeModel[] {
    try {
      const models = scope.monaco?.editor?.getModels?.() ?? [];
      return models.filter((model) => !model.isDisposed?.());
    } catch {
      return [];
    }
  }

  function summarizeModels(models: MonacoLikeModel[]): BridgeModelSummary[] {
    return models.map((model, index) => {
      const value = safeGetValue(model);
      return {
        index,
        languageId: normalizeLanguage(model.getLanguageId?.()),
        uri: safeUri(model),
        valueLength: value.length,
        lineCount: value.length === 0 ? 0 : value.split(/\r?\n/).length,
        attached: Boolean(model.isAttachedToEditor?.() ?? true)
      };
    });
  }

  function inferRoles(models: MonacoLikeModel[]) {
    const summaries = summarizeModels(models);
    const attached = summaries.filter((summary) => summary.attached);
    const pool = attached.length > 0 ? attached : summaries;

    const codeByName = pool.find((summary) => /main|source|solution|code/i.test(summary.uri));
    const codeByLanguage = pool
      .filter((summary) => isCodeLanguage(summary.languageId))
      .sort((left, right) => right.valueLength - left.valueLength)[0];
    const codeByContent = pool
      .filter((summary) => looksLikeSource(models[summary.index]))
      .sort((left, right) => right.valueLength - left.valueLength)[0];
    const codeBySize = [...pool].sort((left, right) => right.valueLength - left.valueLength)[0];
    const codeIndex = codeByName?.index ?? codeByContent?.index ?? codeByLanguage?.index ?? codeBySize?.index;

    const remaining = pool.filter((summary) => summary.index !== codeIndex);
    const namedInput = remaining.find((summary) => /stdin|input/i.test(summary.uri));
    const namedStdout = remaining.find((summary) => /stdout/i.test(summary.uri));
    const namedStderr = remaining.find((summary) => /stderr/i.test(summary.uri));
    const namedCompile = remaining.find((summary) => /compile|build/i.test(summary.uri));

    const plainRemaining = remaining.filter((summary) => isPlainLanguage(summary.languageId));
    const orderedPlain = [...plainRemaining].sort((left, right) => left.index - right.index);

    const inputIndex = namedInput?.index ?? orderedPlain[0]?.index;

    const outputCandidates = orderedPlain.filter((summary) => summary.index !== inputIndex);
    const stdoutIndex = namedStdout?.index ?? outputCandidates[0]?.index;
    const stderrIndex = namedStderr?.index ?? outputCandidates[1]?.index;
    const compileIndex = namedCompile?.index ?? outputCandidates[2]?.index;

    return {
      codeIndex,
      compileIndex,
      inputIndex,
      stderrIndex,
      stdoutIndex
    };
  }

  function findCodeEditor(): MonacoLikeEditor | undefined {
    const models = getModels();
    const roles = inferRoles(models);
    const codeModel = roles.codeIndex !== undefined ? models[roles.codeIndex] : undefined;
    if (!codeModel) {
      return undefined;
    }

    return getEditors().find((editor) => editor.getModel?.() === codeModel);
  }

  function setBreakpointDecorations(state: BreakpointDecorationState): boolean {
    const editor = findCodeEditor();
    if (!editor?.deltaDecorations) {
      return false;
    }

    const decorations = [
      ...state.breakpointLines.map((line) => ({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1
        },
        options: {
          isWholeLine: true,
          glyphMarginClassName: "usaco-helper-monaco-breakpoint-glyph",
          linesDecorationsClassName: "usaco-helper-monaco-breakpoint-line",
          className: "usaco-helper-monaco-breakpoint-row"
        }
      })),
      ...(state.activeLine ? [{
        range: {
          startLineNumber: state.activeLine,
          startColumn: 1,
          endLineNumber: state.activeLine,
          endColumn: 1
        },
        options: {
          isWholeLine: true,
          linesDecorationsClassName: "usaco-helper-monaco-active-line"
        }
      }] : [])
    ];

    breakpointDecorationIds = editor.deltaDecorations(breakpointDecorationIds, decorations);
    return true;
  }

  function installBreakpointForwarding(): void {
    const editor = findCodeEditor();
    if (editor && editor !== breakpointMouseEditor && editor.onMouseDown) {
      breakpointMouseDisposable?.dispose();
      breakpointMouseEditor = editor;
      breakpointMouseDisposable = editor.onMouseDown((event) => {
        const line = event.target?.position?.lineNumber;
        if (!line || !isGutterMouseTarget(event)) {
          return;
        }

        event.event?.preventDefault?.();
        event.event?.stopPropagation?.();
        postBreakpointToggle(line);
      });
    }

    if (!domBreakpointListenerReady) {
      domBreakpointListenerReady = true;
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element) || target.closest("#usaco-local-debug-helper-root")) {
          return;
        }
        const line = extractDomBreakpointLine(target, event.clientY);
        if (!line) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        postBreakpointToggle(line);
      }, true);
    }
  }

  function isGutterMouseTarget(event: MonacoMouseDownEvent): boolean {
    const targetType = event.target?.type;
    if (targetType !== undefined && [2, 3, 4, 5].includes(targetType)) {
      return true;
    }

    const element = event.target?.element;
    return Boolean(element?.closest(".line-numbers, .glyph-margin, .margin-view-overlays, .margin"));
  }

  function extractDomBreakpointLine(target: Element, clientY: number): number | undefined {
    const direct = target.closest(".line-numbers, .cm-gutterElement");
    const directLine = parsePositiveInteger(direct?.textContent ?? target.textContent);
    if (directLine && (direct || isLineNumberLike(target))) {
      return directLine;
    }

    const gutterRoot = target.closest(".margin-view-overlays, .cm-gutters, .glyph-margin, .margin");
    if (!gutterRoot) {
      return undefined;
    }

    const gutterLines = [...document.querySelectorAll(".margin-view-overlays .line-numbers, .line-numbers, .cm-gutterElement")]
      .filter((node) => !node.closest("#usaco-local-debug-helper-root"));
    for (const [index, node] of gutterLines.entries()) {
      const rect = node.getBoundingClientRect();
      if (rect.height > 0 && clientY >= rect.top - 2 && clientY <= rect.bottom + 2) {
        return parsePositiveInteger(node.textContent) ?? index + 1;
      }
    }

    return undefined;
  }

  function postBreakpointToggle(line: number): void {
    window.postMessage({
      line,
      type: breakpointToggleType
    }, window.location.origin);
  }

  function writeOutputChannel(
    models: MonacoLikeModel[],
    tabLabel: "stdout" | "stderr" | "compile output",
    value: string | undefined,
    preferredIndex: number | undefined
  ): boolean {
    if (value === undefined) {
      return false;
    }

    if (writeRole(models, preferredIndex, value)) {
      clickTab(tabLabel);
      return true;
    }

    clickTab(tabLabel);
    const refreshedModels = getModels();
    const refreshedRoles = inferRoles(refreshedModels);
    const refreshedIndex =
      tabLabel === "stdout"
        ? refreshedRoles.stdoutIndex
        : tabLabel === "stderr"
          ? refreshedRoles.stderrIndex
          : refreshedRoles.compileIndex;

    if (writeRole(refreshedModels, refreshedIndex, value)) {
      return true;
    }

    return writeActiveOutputEditor(refreshedModels, value);
  }

  function writeActiveOutputEditor(models: MonacoLikeModel[], value: string): boolean {
    const editors = getEditors();
    const outputEditors = editors
      .map((editor) => ({
        editor,
        rect: editor.getDomNode?.()?.getBoundingClientRect(),
        model: editor.getModel?.()
      }))
      .filter((entry) => entry.model && entry.rect && entry.rect.width > 0 && entry.rect.height > 0)
      .sort((left, right) => (right.rect?.top ?? 0) - (left.rect?.top ?? 0));

    for (const entry of outputEditors) {
      const index = models.indexOf(entry.model as MonacoLikeModel);
      if (index === -1) {
        continue;
      }
      const roles = inferRoles(models);
      if (index === roles.codeIndex || index === roles.inputIndex) {
        continue;
      }
      entry.model?.setValue(value);
      return true;
    }

    return false;
  }

  function writeRole(models: MonacoLikeModel[], index: number | undefined, value: string | undefined): boolean {
    if (index === undefined || value === undefined) {
      return false;
    }

    const model = models[index];
    if (!model) {
      return false;
    }

    model.setValue(value);
    return true;
  }

  function safeGetValue(model: MonacoLikeModel): string {
    try {
      return model.getValue();
    } catch {
      return "";
    }
  }

  function safeUri(model: MonacoLikeModel): string {
    try {
      return model.uri?.path ?? model.uri?.toString() ?? "";
    } catch {
      return "";
    }
  }

  function getEditors(): MonacoLikeEditor[] {
    try {
      return scope.monaco?.editor?.getEditors?.() ?? [];
    } catch {
      return [];
    }
  }

  function normalizeLanguage(languageId: string | undefined): string {
    return (languageId ?? "").trim().toLowerCase();
  }

  function isCodeLanguage(languageId: string): boolean {
    return /(c|cpp|c\+\+|python|java|javascript|typescript|rust|go)/i.test(languageId);
  }

  function isPlainLanguage(languageId: string): boolean {
    return languageId.length === 0 || /(plain|text|txt|log)/i.test(languageId);
  }

  function looksLikeSource(model: MonacoLikeModel | undefined): boolean {
    if (!model) {
      return false;
    }
    const value = safeGetValue(model);
    return /#\s*include|#\s*define\s+\w+|using\s+namespace|(?:int|int32_t|signed|auto)\s+main\s*\(|cout\s*<<|cin\s*>>|std::/i.test(value);
  }

  function clickTab(label: string): void {
    const normalizedLabel = normalizeLabel(label);
    const candidates = [...document.querySelectorAll("button, [role='tab'], div, span")]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .filter((node) => !node.closest("#usaco-local-debug-helper-root"))
      .filter((node) => {
        const text = normalizeLabel(node.textContent ?? "");
        return text === normalizedLabel || text.includes(normalizedLabel);
      });
    candidates[0]?.click();
  }

  function normalizeLabel(value: string): string {
    return value.replace(/\s+/g, " ").trim().toLowerCase();
  }

  function parsePositiveInteger(value: string | null | undefined): number | undefined {
    const parsed = Number.parseInt(normalizeLabel(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  function isLineNumberLike(node: Element): boolean {
    const className = typeof node.className === "string" ? node.className : "";
    return /line-number|line-numbers|gutter/i.test(className);
  }

  function isBridgeRequest(value: unknown): value is {
    action: string;
    id: string;
    payload?: unknown;
    type: string;
  } {
    if (!value || typeof value !== "object") {
      return false;
    }

    const data = value as Partial<{ action: unknown; id: unknown; type: unknown }>;
    return data.type === requestType && typeof data.id === "string" && typeof data.action === "string";
  }

  function handleBridgeRequest(bridge: EditorBridge, request: { action: string; payload?: unknown }): unknown {
    switch (request.action) {
      case "getCode":
        return bridge.getCode();
      case "getInput":
        return bridge.getInput();
      case "getModelSummaries":
        return bridge.getModelSummaries();
      case "setBreakpointDecorations":
        return bridge.setBreakpointDecorations(readBreakpointDecorationPayload(request.payload));
      case "setInput":
        return bridge.setInput(readStringPayload(request.payload));
      case "setOutputs":
        return bridge.setOutputs(readOutputPayload(request.payload));
      default:
        throw new Error(`Unknown bridge action: ${request.action}`);
    }
  }

  function readStringPayload(payload: unknown): string {
    return typeof payload === "string" ? payload : "";
  }

  function readOutputPayload(payload: unknown): OutputChannels {
    if (!payload || typeof payload !== "object") {
      return {};
    }

    const candidate = payload as OutputChannels;
    return {
      compileOutput: typeof candidate.compileOutput === "string" ? candidate.compileOutput : undefined,
      stderr: typeof candidate.stderr === "string" ? candidate.stderr : undefined,
      stdout: typeof candidate.stdout === "string" ? candidate.stdout : undefined
    };
  }

  function readBreakpointDecorationPayload(payload: unknown): BreakpointDecorationState {
    if (!payload || typeof payload !== "object") {
      return { breakpointLines: [] };
    }

    const candidate = payload as Partial<BreakpointDecorationState>;
    return {
      activeLine: typeof candidate.activeLine === "number" && candidate.activeLine > 0 ? candidate.activeLine : undefined,
      breakpointLines: Array.isArray(candidate.breakpointLines)
        ? candidate.breakpointLines.filter((line) => Number.isInteger(line) && line > 0)
        : []
    };
  }
})();

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsacoPageAdapter } from "./pageAdapter";

declare global {
  interface Window {
    __USACO_EDITOR_BRIDGE__?: {
      getCode?: () => string | undefined;
      getInput?: () => string | undefined;
      getModelSummaries?: () => Array<{
        attached: boolean;
        index: number;
        languageId: string;
        lineCount: number;
        uri: string;
        valueLength: number;
      }>;
      setBreakpointDecorations?: (state: { activeLine?: number; breakpointLines: number[] }) => boolean;
      setInput?: (value: string) => boolean;
      setOutputs?: (payload: { compileOutput?: string; stderr?: string; stdout?: string }) => {
        compileOutput: boolean;
        stderr: boolean;
        stdout: boolean;
      };
    };
  }
}

describe("UsacoPageAdapter", () => {
  let cleanupBridgeMock: (() => void) | undefined;

  beforeEach(() => {
    mockIdeLocation();
    document.body.innerHTML = "";
    delete window.__USACO_EDITOR_BRIDGE__;
    cleanupBridgeMock = undefined;
  });

  afterEach(() => {
    cleanupBridgeMock?.();
  });

  it("recognizes ide.usaco.guide pages", () => {
    const adapter = new UsacoPageAdapter();
    expect(adapter.isSupportedPage()).toBe(true);
    expect(adapter.getIdeUrl()).toContain("ide.usaco.guide");
  });

  it("falls back to a visible code textarea", async () => {
    document.body.innerHTML = `<textarea>#include <bits/stdc++.h>\nint main(){return 0;}</textarea>`;
    const adapter = new UsacoPageAdapter();
    await expect(adapter.getCode()).resolves.toContain("int main");
  });

  it("does not sync visible Monaco DOM fragments as full source", async () => {
    document.body.innerHTML = `
      <div class="view-lines">
        <div class="view-line">ll sm=0;</div>
        <div class="view-line">for (ll i=0; i&lt;n; i++) cin &gt;&gt; a[i];</div>
      </div>
    `;

    const adapter = new UsacoPageAdapter();
    await expect(adapter.getCode()).rejects.toThrow(/could not read source/i);
  });

  it("rejects partial Monaco textarea fragments that look like template code", async () => {
    document.body.innerHTML = `
      <textarea>
using vi = vector<int>;
const ld eps = 1e-9;
void fady(){
    ll n;cin>>n;
    vll a(n);
}
      </textarea>
    `;

    const adapter = new UsacoPageAdapter();
    await expect(adapter.getCode()).rejects.toThrow(/could not read source/i);
  });

  it("reads and writes the visible IDE input textarea", async () => {
    document.body.innerHTML = `
      <div>Input</div>
      <textarea>1 2 3</textarea>
      <div>stdout</div>
      <textarea></textarea>
    `;

    const adapter = new UsacoPageAdapter();
    await expect(adapter.getInput()).resolves.toBe("1 2 3");
    await expect(adapter.setInput("7 8 9")).resolves.toBe(true);
    expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("7 8 9");
  });

  it("uses the injected bridge when Monaco access is available", async () => {
    const setOutputs = vi.fn(() => ({
      compileOutput: true,
      stderr: true,
      stdout: true
    }));

    window.__USACO_EDITOR_BRIDGE__ = {
      getCode: () => "int main() { return 0; }",
      getInput: () => "5 6",
      getModelSummaries: () => [
        {
          attached: true,
          index: 0,
          languageId: "cpp",
          lineCount: 1,
          uri: "file:///main.cpp",
          valueLength: 24
        }
      ],
      setInput: () => true,
      setOutputs
    };

    const adapter = new UsacoPageAdapter();
    await expect(adapter.getCode()).resolves.toContain("return 0");
    await expect(adapter.getInput()).resolves.toBe("5 6");
    await adapter.writeOutputs({ stdout: "42\n" });
    expect(setOutputs).toHaveBeenCalledWith({ stdout: "42\n" });
    expect(adapter.getCapabilities().bridge).toBe(true);
  });

  it("uses postMessage bridge requests when the page bridge is isolated", async () => {
    const setOutputs = vi.fn(() => ({
      compileOutput: false,
      stderr: false,
      stdout: true
    }));
    cleanupBridgeMock = installWindowBridgeMock({
      getCode: () => "#include <bits/stdc++.h>\nint main(){return 0;}",
      getInput: () => "10 20",
      getModelSummaries: () => [
        {
          attached: true,
          index: 0,
          languageId: "cpp",
          lineCount: 2,
          uri: "file:///main.cpp",
          valueLength: 46
        }
      ],
      setInput: () => true,
      setOutputs
    });

    const adapter = new UsacoPageAdapter();
    await expect(adapter.getCode()).resolves.toContain("int main");
    await expect(adapter.getInput()).resolves.toBe("10 20");
    await expect(adapter.getLanguage()).resolves.toBe("cpp");
    await expect(adapter.setInput("1 2")).resolves.toBe(true);
    await expect(adapter.writeOutputs({ stdout: "30\n" })).resolves.toMatchObject({ stdout: true });
    expect(setOutputs).toHaveBeenCalledWith({ stdout: "30\n" });
    expect(adapter.getCapabilities()).toMatchObject({ bridge: true, monacoModelCount: 1 });
  });

  it("detects breakpoint clicks from Monaco gutter coordinates", async () => {
    document.body.innerHTML = `
      <div class="monaco-editor">
        <div class="margin-view-overlays" id="gutter">
          <div class="line-numbers">1</div>
          <div class="line-numbers">2</div>
        </div>
        <div class="view-lines">
          <div class="view-line">int main() {</div>
          <div class="view-line">  return 0;</div>
        </div>
      </div>
    `;

    const gutter = document.getElementById("gutter") as HTMLElement;
    const gutterLines = [...document.querySelectorAll(".line-numbers")] as HTMLElement[];
    gutterLines.forEach((node, index) => {
      vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
        bottom: (index + 1) * 20,
        height: 20,
        left: 0,
        right: 32,
        top: index * 20,
        width: 32,
        x: 0,
        y: index * 20,
        toJSON: () => ({})
      });
    });

    const adapter = new UsacoPageAdapter();
    await adapter.syncDecorations({ breakpointLines: [], activeLine: undefined });

    const seen: number[] = [];
    const unsubscribe = adapter.subscribeBreakpointToggle((line) => seen.push(line));
    gutter.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientY: 25 }));
    unsubscribe();

    expect(seen).toEqual([2]);
  });

  it("accepts page-bridge breakpoint toggle messages", async () => {
    const adapter = new UsacoPageAdapter();
    const seen = new Promise<number>((resolve) => {
      const unsubscribe = adapter.subscribeBreakpointToggle((line) => {
        unsubscribe();
        resolve(line);
      });
    });

    window.postMessage({ type: "USACO_HELPER_BREAKPOINT_TOGGLE", line: 7 }, window.location.origin);

    await expect(seen).resolves.toBe(7);
  });

  it("sends breakpoint decorations through the page bridge", async () => {
    const setBreakpointDecorations = vi.fn(() => true);
    window.__USACO_EDITOR_BRIDGE__ = {
      setBreakpointDecorations
    };

    const adapter = new UsacoPageAdapter();
    await adapter.syncDecorations({ activeLine: 3, breakpointLines: [2, 5] });

    expect(setBreakpointDecorations).toHaveBeenCalledWith({ activeLine: 3, breakpointLines: [2, 5] });
  });

  it("renders extension-owned breakpoint hit zones and active red-dot state", async () => {
    document.body.innerHTML = `
      <div class="monaco-editor">
        <div class="margin-view-overlays">
          <div class="line-numbers">1</div>
          <div class="line-numbers">2</div>
        </div>
      </div>
    `;

    const gutterLines = [...document.querySelectorAll(".line-numbers")] as HTMLElement[];
    gutterLines.forEach((node, index) => {
      vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
        bottom: (index + 1) * 20,
        height: 20,
        left: 10,
        right: 40,
        top: index * 20,
        width: 30,
        x: 10,
        y: index * 20,
        toJSON: () => ({})
      });
    });

    const adapter = new UsacoPageAdapter();
    const seen: number[] = [];
    const unsubscribe = adapter.subscribeBreakpointToggle((line) => seen.push(line));

    await adapter.syncDecorations({ activeLine: undefined, breakpointLines: [2] });

    const hits = [...document.querySelectorAll(".usaco-helper-breakpoint-hit")] as HTMLButtonElement[];
    expect(hits).toHaveLength(2);
    expect(hits[1].classList.contains("active")).toBe(true);

    hits[0].click();
    expect(seen).toEqual([1]);

    unsubscribe();
    adapter.destroy();
  });

  it("mirrors stdout to a labeled output textarea when the bridge cannot write", async () => {
    document.body.innerHTML = `
      <div>
        <button>stdout</button>
        <textarea id="stdout"></textarea>
      </div>
    `;

    window.__USACO_EDITOR_BRIDGE__ = {
      setOutputs: () => ({
        compileOutput: false,
        stderr: false,
        stdout: false
      })
    };

    const adapter = new UsacoPageAdapter();
    await expect(adapter.writeOutputs({ stdout: "42\n" })).resolves.toMatchObject({ stdout: true });
    expect((document.getElementById("stdout") as HTMLTextAreaElement).value).toBe("42\n");
  });

  it("does not confuse helper panel controls with USACO page input/output", async () => {
    document.body.innerHTML = `
      <div id="usaco-local-debug-helper-root">
        <button>stdout</button>
        <textarea id="helper-input">helper text</textarea>
      </div>
      <section>
        <div>Input</div>
        <textarea id="page-input">1 2 3</textarea>
      </section>
      <section>
        <button id="page-stdout-tab">stdout</button>
        <textarea id="page-stdout"></textarea>
      </section>
    `;

    const adapter = new UsacoPageAdapter();
    await expect(adapter.getInput()).resolves.toBe("1 2 3");
    await expect(adapter.writeOutputs({ stdout: "6\n" })).resolves.toMatchObject({ stdout: true });
    expect((document.getElementById("helper-input") as HTMLTextAreaElement).value).toBe("helper text");
    expect((document.getElementById("page-stdout") as HTMLTextAreaElement).value).toBe("6\n");
  });
});

function mockIdeLocation() {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...window.location,
      href: "https://ide.usaco.guide/Opm8t-euy25ASUlgb6_",
      hostname: "ide.usaco.guide"
    }
  });
}

function installWindowBridgeMock(bridge: NonNullable<Window["__USACO_EDITOR_BRIDGE__"]>) {
  const listener = (event: MessageEvent) => {
    const data = event.data as { action?: string; id?: string; payload?: unknown; type?: string };
    if (data?.type !== "USACO_HELPER_BRIDGE_REQUEST" || !data.id || !data.action) {
      return;
    }

    let value: unknown;
    switch (data.action) {
      case "getCode":
        value = bridge.getCode?.();
        break;
      case "getInput":
        value = bridge.getInput?.();
        break;
      case "getModelSummaries":
        value = bridge.getModelSummaries?.();
        break;
      case "setInput":
        value = bridge.setInput?.(typeof data.payload === "string" ? data.payload : "");
        break;
      case "setOutputs":
        value = bridge.setOutputs?.(data.payload as { compileOutput?: string; stderr?: string; stdout?: string });
        break;
      default:
        value = undefined;
        break;
    }

    window.postMessage({
      id: data.id,
      ok: true,
      type: "USACO_HELPER_BRIDGE_RESPONSE",
      value
    }, window.location.origin);
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

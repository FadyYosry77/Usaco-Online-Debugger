import { writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Breakpoint,
  DebugFrame,
  DebugSessionView,
  DebugThread,
  DebugVariable,
  HelperSettings,
  MemoryRead,
  RegisterValue,
  WatchExpression
} from "@usaco-helper/shared-types";
import { asList, asString, asTuple, getResultValue, type MiValue } from "@usaco-helper/debug-core";
import { GdbMiClient } from "../gdb/GdbMiClient.js";
import { EventBus } from "../server/EventBus.js";

export class DebugService {
  private readonly gdb = new GdbMiClient();
  private state: DebugSessionView = {
    state: "disconnected",
    breakpoints: [],
    watches: []
  };
  private stack: DebugFrame[] = [];
  private variables: DebugVariable[] = [];
  private threads: DebugThread[] = [];
  private registers: RegisterValue[] = [];

  constructor(
    private readonly cwd: string,
    private readonly eventBus: EventBus
  ) {
    this.gdb.on("stream", (record) => {
      this.eventBus.emit("debugger_output", {
        channel: record.streamType === "~" ? "console" : record.streamType === "@" ? "target" : "log",
        message: record.text
      });
    });

    this.gdb.on("async", async (record) => {
      if (record.class === "running") {
        this.state = { ...this.state, state: "running" };
        this.eventBus.emit("debug_resumed", { state: this.state });
        return;
      }

      if (record.class === "stopped") {
        const frame = asTuple(getResultValue(record, "frame"));
        const reason = asString(getResultValue(record, "reason")) ?? "stopped";
        this.state = {
          ...this.state,
          state: "paused",
          currentFile: asString(frame?.fullname) ?? asString(frame?.file),
          currentLine: toNumber(asString(frame?.line))
        };
        this.eventBus.emit("debug_paused", { reason, state: this.state });

        const bkpt = asString(getResultValue(record, "bkptno"));
        if (bkpt) {
          this.eventBus.emit("breakpoint_hit", {
            breakpointId: bkpt,
            state: this.state
          });
        }
        await this.refreshViews(this.state.watches);
      }
    });

    this.gdb.on("error", (error) => {
      this.state = { ...this.state, state: "error", lastError: error.message };
      this.eventBus.emit("debugger_error", { message: error.message });
    });

    this.gdb.on("exit", () => {
      this.state = {
        ...this.state,
        state: "idle",
        currentFile: undefined,
        currentLine: undefined
      };
    });
  }

  getState(): DebugSessionView {
    return this.state;
  }

  getStack(): DebugFrame[] {
    return this.stack;
  }

  getVariables(): DebugVariable[] {
    return this.variables;
  }

  getThreads(): DebugThread[] {
    return this.threads;
  }

  getRegisters(): RegisterValue[] {
    return this.registers;
  }

  applyPersistedState(breakpoints: Breakpoint[], watches: WatchExpression[]): void {
    this.state = {
      ...this.state,
      breakpoints,
      watches
    };
  }

  async start(executablePath: string, settings: HelperSettings, stdin?: string): Promise<DebugSessionView> {
    this.stop();
    this.gdb.start(settings.gdbPath, this.cwd);
    this.state = {
      ...this.state,
      state: "ready",
      executablePath
    };

    await this.gdb.send(`-file-exec-and-symbols "${escapeMi(executablePath)}"`);

    for (const breakpoint of this.state.breakpoints.filter((item) => item.enabled)) {
      await this.insertBreakpoint(breakpoint);
    }

    this.eventBus.emit("debug_started", {
      startedAt: new Date().toISOString(),
      state: this.state
    });

    if (stdin && stdin.length > 0) {
      const stdinPath = path.join(this.cwd, "debug.stdin.txt");
      await writeFile(stdinPath, stdin, "utf8");
      await this.gdb.send(
        `-interpreter-exec console "run < ${escapeConsole(stdinPath)}"`
      );
    } else {
      await this.gdb.send("-exec-run");
    }

    return this.state;
  }

  stop(): DebugSessionView {
    if (this.gdb.isRunning()) {
      this.state = { ...this.state, state: "stopping" };
      this.gdb.stop();
    }
    this.state = {
      ...this.state,
      state: "idle",
      executablePath: undefined,
      currentFile: undefined,
      currentLine: undefined,
      lastError: undefined
    };
    return this.state;
  }

  async continue(): Promise<DebugSessionView> {
    this.ensureRunning();
    await this.gdb.send("-exec-continue");
    this.state = { ...this.state, state: "running" };
    return this.state;
  }

  async pause(): Promise<DebugSessionView> {
    this.ensureRunning();
    await this.gdb.send("-exec-interrupt");
    this.state = { ...this.state, state: "paused" };
    await this.refreshViews(this.state.watches);
    return this.state;
  }

  async stepOver(): Promise<DebugSessionView> {
    this.ensureRunning();
    await this.gdb.send("-exec-next");
    this.state = { ...this.state, state: "running" };
    return this.state;
  }

  async stepInto(): Promise<DebugSessionView> {
    this.ensureRunning();
    await this.gdb.send("-exec-step");
    this.state = { ...this.state, state: "running" };
    return this.state;
  }

  async stepOut(): Promise<DebugSessionView> {
    this.ensureRunning();
    await this.gdb.send("-exec-finish");
    this.state = { ...this.state, state: "running" };
    return this.state;
  }

  async runToLine(line: number): Promise<DebugSessionView> {
    this.ensureRunning();
    await this.gdb.send(`-exec-until ${line}`);
    this.state = { ...this.state, state: "running" };
    return this.state;
  }

  async toggleBreakpoint(breakpoint: Breakpoint): Promise<Breakpoint[]> {
    const existing = this.state.breakpoints.find(
      (item) => item.file === breakpoint.file && item.line === breakpoint.line
    );

    if (existing) {
      if (existing.gdbId) {
        await this.gdb.send(`-break-delete ${existing.gdbId}`).catch(() => undefined);
      }
      this.state = {
        ...this.state,
        breakpoints: this.state.breakpoints.filter((item) => item.id !== existing.id)
      };
      return this.state.breakpoints;
    }

    let gdbId: string | undefined;
    if (this.gdb.isRunning() && this.state.executablePath) {
      gdbId = await this.insertBreakpoint(breakpoint);
    }

    this.state = {
      ...this.state,
      breakpoints: [...this.state.breakpoints, { ...breakpoint, gdbId }]
    };
    return this.state.breakpoints;
  }

  async evaluate(expression: string): Promise<string> {
    this.ensureRunning();
    const result = await this.gdb.send(`-data-evaluate-expression "${escapeMi(expression)}"`);
    return asString(getResultValue(result, "value")) ?? "";
  }

  async refreshViews(watches: WatchExpression[]): Promise<void> {
    this.ensureRunning();
    this.state = { ...this.state, watches };

    const [stack, variables, threads, registers] = await Promise.allSettled([
      this.fetchStack(),
      this.fetchVariables(),
      this.fetchThreads(),
      this.fetchRegisters()
    ]);

    if (stack.status === "fulfilled") {
      this.stack = stack.value;
      this.eventBus.emit("stack_updated", { stack: this.stack });
    }
    if (variables.status === "fulfilled") {
      this.variables = variables.value;
      this.eventBus.emit("variables_updated", { variables: this.variables });
    }
    if (threads.status === "fulfilled") {
      this.threads = threads.value;
      this.eventBus.emit("threads_updated", { threads: this.threads });
    }
    if (registers.status === "fulfilled") {
      this.registers = registers.value;
      this.eventBus.emit("registers_updated", { registers: this.registers });
    }
  }

  async fetchStack(): Promise<DebugFrame[]> {
    this.ensureRunning();
    const result = await this.gdb.send("-stack-list-frames");
    const stack = asList(getResultValue(result, "stack")) ?? [];
    return stack.map(normalizeFrame);
  }

  async fetchVariables(): Promise<DebugVariable[]> {
    this.ensureRunning();
    const result = await this.gdb.send("-stack-list-variables --simple-values");
    const variables = asList(getResultValue(result, "variables")) ?? [];
    return variables.map((entry) => {
      const value = asTuple(entry) ?? {};
      return {
        name: asString(value.name) ?? "unknown",
        value: asString(value.value) ?? "",
        type: asString(value.type),
        hasChildren: false
      };
    });
  }

  async fetchThreads(): Promise<DebugThread[]> {
    this.ensureRunning();
    const result = await this.gdb.send("-thread-info");
    const threads = asList(getResultValue(result, "threads")) ?? [];
    return threads.map((entry) => {
      const tuple = asTuple(entry) ?? {};
      const frameTuple = asTuple(tuple.frame);
      return {
        id: toNumber(asString(tuple.id)) ?? 0,
        targetId: asString(tuple["target-id"]),
        state: asString(tuple.state),
        details: asString(tuple.details),
        frame: frameTuple ? normalizeFrame({ kind: "tuple", value: frameTuple }) : undefined
      };
    });
  }

  async fetchRegisters(): Promise<RegisterValue[]> {
    this.ensureRunning();
    const result = await this.gdb.send("-data-list-register-values x");
    const values = asList(getResultValue(result, "register-values")) ?? [];
    return values.map((entry) => {
      const tuple = asTuple(entry) ?? {};
      return {
        number: toNumber(asString(tuple.number)) ?? 0,
        value: asString(tuple.value) ?? ""
      };
    });
  }

  async readMemory(address: string, count: number): Promise<MemoryRead> {
    this.ensureRunning();
    const result = await this.gdb.send(`-data-read-memory-bytes "${escapeMi(address)}" ${count}`);
    const bytes = extractMemoryBytes(getResultValue(result, "memory"));
    return {
      address,
      bytes,
      ascii: hexToAscii(bytes)
    };
  }

  private async insertBreakpoint(breakpoint: Breakpoint): Promise<string | undefined> {
    const location = `${breakpoint.file}:${breakpoint.line}`;
    const command = breakpoint.condition
      ? `-break-insert -c "${escapeMi(breakpoint.condition)}" "${escapeMi(location)}"`
      : `-break-insert "${escapeMi(location)}"`;
    const result = await this.gdb.send(command);
    const bkpt = asTuple(getResultValue(result, "bkpt"));
    return asString(bkpt?.number);
  }

  private ensureRunning(): void {
    if (!this.gdb.isRunning()) {
      throw new Error("No active local debug session. Start Debug first.");
    }
  }
}

function normalizeFrame(value: MiValue): DebugFrame {
  const tuple = asTuple(value) ?? {};
  const frame = asTuple(tuple.frame) ?? tuple;
  return {
    level: toNumber(asString(frame.level)) ?? 0,
    func: asString(frame.func),
    file: asString(frame.file),
    fullname: asString(frame.fullname),
    line: toNumber(asString(frame.line)),
    address: asString(frame.addr)
  };
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeMi(value: string): string {
  return value.replace(/\\/g, "/").replace(/"/g, '\\"');
}

function escapeConsole(value: string): string {
  return value.replace(/\\/g, "/");
}

function hexToAscii(bytes: string): string {
  const normalized = bytes.replace(/\s+/g, "");
  let output = "";
  for (let index = 0; index + 1 < normalized.length; index += 2) {
    const value = Number.parseInt(normalized.slice(index, index + 2), 16);
    output += value >= 32 && value <= 126 ? String.fromCharCode(value) : ".";
  }
  return output;
}

function extractMemoryBytes(value: MiValue | undefined): string {
  const direct = asString(value);
  if (direct !== undefined) {
    return direct;
  }

  const memoryBlocks = asList(value) ?? [];
  return memoryBlocks
    .map((entry) => {
      const block = asTuple(entry) ?? {};
      return asString(block.contents) ?? "";
    })
    .join("");
}

import type { DebugSessionView, HelperSettings } from "./models.js";

export const helperShape: {
  settings: HelperSettings;
  debugState: DebugSessionView["state"];
} = {
  settings: {
    compilerPath: "g++",
    gdbPath: "gdb",
    cxxStandard: "c++17",
    extraCompileFlags: [],
    autoSyncOnCodeChange: false,
    debounceMs: 700,
    localhostPort: 3777,
    localhostHost: "127.0.0.1",
    prettyPrinters: true,
    maxVariablePreviewLength: 240,
    safePracticeBanner: true,
    theme: "system",
    executionTimeoutMs: 5000
  },
  debugState: "idle"
};

export const DEFAULT_SETTINGS = {
    compilerPath: "g++",
    gdbPath: "gdb",
    cxxStandard: "c++17",
    extraCompileFlags: [],
    autoSyncOnCodeChange: false,
    debounceMs: 700,
    localhostPort: readPositiveIntegerEnv("USACO_HELPER_PORT", 3777),
    localhostHost: readStringEnv("USACO_HELPER_HOST", "127.0.0.1"),
    prettyPrinters: true,
    maxVariablePreviewLength: 240,
    safePracticeBanner: true,
    theme: "system",
    executionTimeoutMs: 5000
};
export const EMPTY_SESSION = {
    sourceFileName: "main.cpp",
    sourceCode: "",
    sourceHash: "",
    updatedAt: new Date(0).toISOString(),
    breakpoints: [],
    watches: []
};
function readPositiveIntegerEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}
function readStringEnv(name, fallback) {
    return process.env[name]?.trim() || fallback;
}
//# sourceMappingURL=defaults.js.map
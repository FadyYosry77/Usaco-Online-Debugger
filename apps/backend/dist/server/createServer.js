import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { z } from "zod";
export async function createServer(context) {
    const app = Fastify({ logger: true });
    await app.register(cors, { origin: true });
    await app.register(websocket);
    app.get("/", async () => ({
        ok: true,
        service: "usaco-local-debug-helper-backend",
        message: "Backend is running. Load the Chrome extension from apps/extension/dist, open https://ide.usaco.guide/<share-id>, then use the injected Debugger panel.",
        health: "/health",
        websocket: "/ws",
        mode: "practice-only"
    }));
    app.get("/health", async () => ({
        ok: true,
        service: "usaco-local-debug-helper-backend",
        version: "0.1.0",
        mode: "practice-only"
    }));
    app.get("/settings", async () => context.settingsService.getSettings());
    app.post("/settings", async (request, reply) => {
        try {
            const body = settingsSchema.parse(request.body);
            return context.settingsService.updateSettings(body);
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Could not update settings"));
        }
    });
    app.post("/session/sync-code", async (request, reply) => {
        try {
            const body = syncCodeSchema.parse(request.body);
            const snapshot = await context.sessionService.syncCode(body.sourceCode, body.sourceFileName, body.pageUrl);
            return { snapshot };
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Could not sync source code"));
        }
    });
    app.post("/build", async (request, reply) => {
        try {
            const body = buildSchema.parse(request.body ?? {});
            const session = await context.sessionService.getSnapshot();
            const settings = await context.settingsService.getSettings();
            const sourceCode = body.sourceCode ?? session.sourceCode;
            if (!sourceCode.trim()) {
                return reply.code(400).send(noSyncedSourceBuildResult());
            }
            const startedAt = new Date().toISOString();
            context.eventBus.emit("build_started", { startedAt });
            const result = await context.buildService.build(body.sourceFileName ?? session.sourceFileName, sourceCode, settings, body.profile ?? "usaco");
            context.eventBus.emit("build_finished", {
                startedAt,
                finishedAt: new Date().toISOString(),
                result
            });
            return result;
        }
        catch (error) {
            return reply.code(500).send({
                success: false,
                command: [],
                stdout: "",
                stderr: errorMessage(error, "Build failed unexpectedly"),
                diagnostics: []
            });
        }
    });
    app.post("/run", async (request, reply) => {
        try {
            const body = runSchema.parse(request.body);
            const session = await context.sessionService.getSnapshot();
            if (!session.sourceCode.trim()) {
                return reply.code(400).send(noSyncedSourceBuildResult());
            }
            const settings = await context.settingsService.getSettings();
            const buildResult = await context.buildService.build(session.sourceFileName, session.sourceCode, settings, "usaco");
            if (!buildResult.success || !buildResult.executablePath) {
                return reply.code(400).send(buildResult);
            }
            return context.runService.run(buildResult.executablePath, body.stdin, settings.executionTimeoutMs);
        }
        catch (error) {
            return reply.code(500).send(errorPayload(error, "Run failed unexpectedly"));
        }
    });
    app.post("/debug/start", async (request, reply) => {
        try {
            const body = debugStartSchema.parse(request.body ?? {});
            const session = await context.sessionService.getSnapshot();
            if (!session.sourceCode.trim()) {
                return reply.code(400).send(noSyncedSourceBuildResult());
            }
            const settings = await context.settingsService.getSettings();
            const buildResult = await context.buildService.build(session.sourceFileName, session.sourceCode, settings, "debug");
            if (!buildResult.success || !buildResult.executablePath) {
                return reply.code(400).send(buildResult);
            }
            context.debugService.applyPersistedState(session.breakpoints, session.watches);
            const state = await context.debugService.start(buildResult.executablePath, settings, body.stdin);
            return state;
        }
        catch (error) {
            return reply.code(500).send(errorPayload(error, "Debug session could not start"));
        }
    });
    app.post("/debug/stop", async () => context.debugService.stop());
    app.post("/debug/continue", async () => context.debugService.continue());
    app.post("/debug/pause", async () => context.debugService.pause());
    app.post("/debug/step-over", async () => context.debugService.stepOver());
    app.post("/debug/step-into", async () => context.debugService.stepInto());
    app.post("/debug/step-out", async () => context.debugService.stepOut());
    app.post("/debug/run-to-line", async (request, reply) => {
        try {
            const body = runToLineSchema.parse(request.body);
            return context.debugService.runToLine(body.line);
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Invalid run-to-line request"));
        }
    });
    app.post("/debug/toggle-breakpoint", async (request, reply) => {
        try {
            const body = breakpointSchema.parse(request.body);
            const breakpoints = await context.debugService.toggleBreakpoint(body.breakpoint);
            await context.sessionService.saveBreakpoints(breakpoints);
            return { breakpoints };
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Could not toggle breakpoint"));
        }
    });
    app.post("/debug/evaluate", async (request, reply) => {
        try {
            const body = evaluateSchema.parse(request.body);
            const value = await context.debugService.evaluate(body.expression);
            return { expression: body.expression, value };
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Could not evaluate expression"));
        }
    });
    app.post("/debug/watches", async (request, reply) => {
        try {
            const body = watchesSchema.parse(request.body);
            await context.sessionService.saveWatches(body.watches);
            await context.debugService.refreshViews(body.watches).catch(() => undefined);
            return { watches: body.watches };
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Could not save watches"));
        }
    });
    app.get("/debug/state", async () => context.debugService.getState());
    app.get("/debug/stack", async () => context.debugService.getStack());
    app.get("/debug/variables", async () => context.debugService.getVariables());
    app.get("/debug/threads", async () => context.debugService.getThreads());
    app.get("/debug/registers", async () => context.debugService.getRegisters());
    app.post("/debug/memory", async (request, reply) => {
        try {
            const body = memorySchema.parse(request.body);
            return context.debugService.readMemory(body.address, body.count);
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Could not read memory"));
        }
    });
    app.get("/testcases", async () => context.testCaseService.list());
    app.post("/testcases", async (request, reply) => {
        try {
            const body = testcaseCreateSchema.parse(request.body);
            return context.testCaseService.create(body);
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Could not create test case"));
        }
    });
    app.put("/testcases/:id", async (request, reply) => {
        try {
            const body = testcaseUpdateSchema.parse(request.body);
            const testcase = await context.testCaseService.update(request.params.id, body);
            if (!testcase) {
                return reply.code(404).send({ message: "Test case not found" });
            }
            return testcase;
        }
        catch (error) {
            return reply.code(400).send(errorPayload(error, "Could not update test case"));
        }
    });
    app.delete("/testcases/:id", async (request) => {
        const removed = await context.testCaseService.remove(request.params.id);
        return { removed };
    });
    app.get("/ws", { websocket: true }, (socket) => {
        socket.send(JSON.stringify({
            type: "backend_status",
            payload: { connected: true, message: "Connected to local backend" }
        }));
        const unsubscribe = context.eventBus.subscribe((event) => {
            socket.send(JSON.stringify(event));
        });
        socket.on("close", unsubscribe);
    });
    app.setErrorHandler((error, _request, reply) => {
        app.log.error(error);
        reply.code(500).send(errorPayload(error, "Unexpected backend error"));
    });
    return app;
}
const settingsSchema = z.object({
    compilerPath: z.string().optional(),
    gdbPath: z.string().optional(),
    cxxStandard: z.string().optional(),
    extraCompileFlags: z.array(z.string()).optional(),
    autoSyncOnCodeChange: z.boolean().optional(),
    debounceMs: z.number().int().positive().optional(),
    localhostPort: z.number().int().positive().optional(),
    localhostHost: z.string().optional(),
    prettyPrinters: z.boolean().optional(),
    maxVariablePreviewLength: z.number().int().positive().optional(),
    safePracticeBanner: z.boolean().optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
    executionTimeoutMs: z.number().int().positive().optional()
});
const syncCodeSchema = z.object({
    sourceCode: z.string(),
    sourceFileName: z.string().optional(),
    pageUrl: z.string().optional()
});
const buildSchema = z.object({
    profile: z.enum(["usaco", "debug"]).optional(),
    sourceCode: z.string().optional(),
    sourceFileName: z.string().optional()
});
const runSchema = z.object({
    stdin: z.string(),
    testcaseId: z.string().optional()
});
const debugStartSchema = z.object({
    stdin: z.string().optional()
});
const runToLineSchema = z.object({
    line: z.number().int().positive()
});
const breakpointSchema = z.object({
    breakpoint: z.object({
        id: z.string(),
        file: z.string(),
        line: z.number().int().positive(),
        enabled: z.boolean(),
        condition: z.string().optional(),
        gdbId: z.string().optional()
    })
});
const evaluateSchema = z.object({
    expression: z.string().min(1)
});
const watchesSchema = z.object({
    watches: z.array(z.object({
        id: z.string(),
        expression: z.string()
    }))
});
const memorySchema = z.object({
    address: z.string().min(1),
    count: z.number().int().positive().max(4096)
});
const testcaseCreateSchema = z.object({
    name: z.string().min(1),
    input: z.string(),
    expectedOutput: z.string().optional()
});
const testcaseUpdateSchema = testcaseCreateSchema.partial();
function errorPayload(error, fallback) {
    return { message: errorMessage(error, fallback) };
}
function errorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}
function noSyncedSourceBuildResult() {
    return {
        success: false,
        command: [],
        stdout: "",
        stderr: "No synced source code available. Use Sync Code first.",
        diagnostics: []
    };
}
//# sourceMappingURL=createServer.js.map
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BuildService } from "../services/BuildService.js";
import { DebugService } from "../services/DebugService.js";
import { RunService } from "../services/RunService.js";
import { SessionService } from "../services/SessionService.js";
import { SettingsService } from "../services/SettingsService.js";
import { TestCaseService } from "../services/TestCaseService.js";
import { EventBus } from "./EventBus.js";
export async function createAppContext() {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const rootDir = findWorkspaceRoot(moduleDir);
    const dataDir = path.join(rootDir, "apps", "backend", ".usaco-helper");
    const workspaceDir = path.join(dataDir, "workspace");
    await mkdir(workspaceDir, { recursive: true });
    const eventBus = new EventBus();
    const settingsService = new SettingsService(dataDir);
    const sessionService = new SessionService(dataDir);
    const testCaseService = new TestCaseService(dataDir);
    const buildService = new BuildService(workspaceDir);
    const runService = new RunService(eventBus);
    const debugService = new DebugService(workspaceDir, eventBus);
    return {
        dataDir,
        workspaceDir,
        eventBus,
        settingsService,
        sessionService,
        testCaseService,
        buildService,
        runService,
        debugService
    };
}
function findWorkspaceRoot(startDir) {
    let current = startDir;
    while (true) {
        if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return path.resolve(startDir, "../../../..");
        }
        current = parent;
    }
}
//# sourceMappingURL=appContext.js.map
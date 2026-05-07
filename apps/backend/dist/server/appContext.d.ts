import { BuildService } from "../services/BuildService.js";
import { DebugService } from "../services/DebugService.js";
import { RunService } from "../services/RunService.js";
import { SessionService } from "../services/SessionService.js";
import { SettingsService } from "../services/SettingsService.js";
import { TestCaseService } from "../services/TestCaseService.js";
import { EventBus } from "./EventBus.js";
export declare function createAppContext(): Promise<{
    dataDir: string;
    workspaceDir: string;
    eventBus: EventBus;
    settingsService: SettingsService;
    sessionService: SessionService;
    testCaseService: TestCaseService;
    buildService: BuildService;
    runService: RunService;
    debugService: DebugService;
}>;
export type AppContext = Awaited<ReturnType<typeof createAppContext>>;

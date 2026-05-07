import type { HelperSettings } from "@usaco-helper/shared-types";
export interface ToolValidationResult {
    path: string;
    exists: boolean;
    message?: string;
}
export interface SettingsValidationResult {
    compiler: ToolValidationResult;
    gdb: ToolValidationResult;
}
export declare class SettingsService {
    private readonly store;
    constructor(baseDir: string);
    getSettings(): Promise<HelperSettings>;
    updateSettings(partial: Partial<HelperSettings>): Promise<HelperSettings>;
    validateToolPaths(settings?: HelperSettings): Promise<SettingsValidationResult>;
}

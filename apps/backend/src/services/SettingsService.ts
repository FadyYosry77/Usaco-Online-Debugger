import { access } from "node:fs/promises";
import path from "node:path";
import type { HelperSettings } from "@usaco-helper/shared-types";
import { JsonFileStore } from "../storage/JsonFileStore.js";
import { DEFAULT_SETTINGS } from "../storage/defaults.js";

export interface ToolValidationResult {
  path: string;
  exists: boolean;
  message?: string;
}

export interface SettingsValidationResult {
  compiler: ToolValidationResult;
  gdb: ToolValidationResult;
}

export class SettingsService {
  private readonly store: JsonFileStore<HelperSettings>;

  constructor(baseDir: string) {
    this.store = new JsonFileStore(path.join(baseDir, "settings.json"), DEFAULT_SETTINGS);
  }

  async getSettings(): Promise<HelperSettings> {
    const settings = await this.store.read();
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    return {
      ...merged,
      cxxStandard: normalizeCxxStandard(merged.cxxStandard)
    };
  }

  async updateSettings(partial: Partial<HelperSettings>): Promise<HelperSettings> {
    const current = await this.getSettings();
    const next: HelperSettings = {
      ...current,
      ...partial,
      compilerPath: normalizePathValue(partial.compilerPath ?? current.compilerPath),
      gdbPath: normalizePathValue(partial.gdbPath ?? current.gdbPath),
      cxxStandard: normalizeCxxStandard(partial.cxxStandard ?? current.cxxStandard)
    };
    await this.store.write(next);
    return next;
  }

  async validateToolPaths(settings?: HelperSettings): Promise<SettingsValidationResult> {
    const resolved = settings ?? (await this.getSettings());
    const [compiler, gdb] = await Promise.all([
      validateExecutablePath(resolved.compilerPath),
      validateExecutablePath(resolved.gdbPath)
    ]);
    return { compiler, gdb };
  }
}

async function validateExecutablePath(executablePath: string): Promise<ToolValidationResult> {
  try {
    await access(executablePath);
    return { path: executablePath, exists: true };
  } catch {
    if (isBareCommand(executablePath)) {
      return {
        path: executablePath,
        exists: true,
        message: "Command will be resolved from PATH at runtime."
      };
    }
    return {
      path: executablePath,
      exists: false,
      message: "Path is not accessible on the local machine."
    };
  }
}

function normalizePathValue(value: string): string {
  return value.trim();
}

function normalizeCxxStandard(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "latest") {
    return DEFAULT_SETTINGS.cxxStandard;
  }
  if (normalized === "c++1z") {
    return "c++17";
  }
  if (normalized === "gnu++1z") {
    return "gnu++17";
  }

  const allowed = new Set([
    "c++11",
    "gnu++11",
    "c++17",
    "gnu++17"
  ]);

  return allowed.has(normalized) ? normalized : DEFAULT_SETTINGS.cxxStandard;
}

function isBareCommand(value: string): boolean {
  return !value.includes(path.sep) && !value.includes("/");
}

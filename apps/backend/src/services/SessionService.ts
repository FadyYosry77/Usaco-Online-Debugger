import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Breakpoint, SessionSnapshot, WatchExpression } from "@usaco-helper/shared-types";
import { JsonFileStore } from "../storage/JsonFileStore.js";
import { EMPTY_SESSION } from "../storage/defaults.js";
import { sha256 } from "../utils/hash.js";

export class SessionService {
  private readonly store: JsonFileStore<SessionSnapshot>;
  readonly workspaceDir: string;

  constructor(baseDir: string) {
    this.workspaceDir = path.join(baseDir, "workspace");
    this.store = new JsonFileStore(path.join(baseDir, "session.json"), EMPTY_SESSION);
  }

  async getSnapshot(): Promise<SessionSnapshot> {
    return this.store.read();
  }

  async ensureWorkspace(): Promise<void> {
    await mkdir(this.workspaceDir, { recursive: true });
  }

  async syncCode(sourceCode: string, sourceFileName = "main.cpp", pageUrl?: string) {
    await this.ensureWorkspace();
    const safeFileName = sanitizeFileName(sourceFileName);
    await writeFile(path.join(this.workspaceDir, safeFileName), sourceCode, "utf8");

    return this.store.update((current) => ({
      ...current,
      sourceCode,
      sourceFileName: safeFileName,
      sourceHash: sha256(sourceCode),
      updatedAt: new Date().toISOString(),
      pageUrl
    }));
  }

  async saveBreakpoints(breakpoints: Breakpoint[]): Promise<SessionSnapshot> {
    return this.store.update((current) => ({ ...current, breakpoints }));
  }

  async saveWatches(watches: WatchExpression[]): Promise<SessionSnapshot> {
    return this.store.update((current) => ({ ...current, watches }));
  }

  getSourcePath(snapshot: SessionSnapshot): string {
    return path.join(this.workspaceDir, sanitizeFileName(snapshot.sourceFileName));
  }

  getExecutablePath(): string {
    return path.join(this.workspaceDir, process.platform === "win32" ? "main.exe" : "main");
  }
}

function sanitizeFileName(fileName: string): string {
  return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_") || "main.cpp";
}

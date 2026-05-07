import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { JsonFileStore } from "../storage/JsonFileStore.js";
import { EMPTY_SESSION } from "../storage/defaults.js";
import { sha256 } from "../utils/hash.js";
export class SessionService {
    store;
    workspaceDir;
    constructor(baseDir) {
        this.workspaceDir = path.join(baseDir, "workspace");
        this.store = new JsonFileStore(path.join(baseDir, "session.json"), EMPTY_SESSION);
    }
    async getSnapshot() {
        return this.store.read();
    }
    async ensureWorkspace() {
        await mkdir(this.workspaceDir, { recursive: true });
    }
    async syncCode(sourceCode, sourceFileName = "main.cpp", pageUrl) {
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
    async saveBreakpoints(breakpoints) {
        return this.store.update((current) => ({ ...current, breakpoints }));
    }
    async saveWatches(watches) {
        return this.store.update((current) => ({ ...current, watches }));
    }
    getSourcePath(snapshot) {
        return path.join(this.workspaceDir, sanitizeFileName(snapshot.sourceFileName));
    }
    getExecutablePath() {
        return path.join(this.workspaceDir, process.platform === "win32" ? "main.exe" : "main");
    }
}
function sanitizeFileName(fileName) {
    return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_") || "main.cpp";
}
//# sourceMappingURL=SessionService.js.map
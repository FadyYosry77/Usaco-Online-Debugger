import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export class JsonFileStore {
    filePath;
    defaultValue;
    constructor(filePath, defaultValue) {
        this.filePath = filePath;
        this.defaultValue = defaultValue;
    }
    async read() {
        try {
            const raw = await readFile(this.filePath, "utf8");
            return JSON.parse(raw);
        }
        catch {
            const initial = structuredClone(this.defaultValue);
            await this.write(initial);
            return initial;
        }
    }
    async write(value) {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
    }
    async update(updater) {
        const current = await this.read();
        const next = await updater(current);
        await this.write(next);
        return next;
    }
}
//# sourceMappingURL=JsonFileStore.js.map
import path from "node:path";
import { nanoid } from "nanoid";
import { JsonFileStore } from "../storage/JsonFileStore.js";
export class TestCaseService {
    store;
    constructor(baseDir) {
        this.store = new JsonFileStore(path.join(baseDir, "testcases.json"), []);
    }
    async list() {
        const testcases = await this.store.read();
        return [...testcases].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }
    async create(input) {
        const now = new Date().toISOString();
        const testcase = {
            id: nanoid(),
            createdAt: now,
            updatedAt: now,
            ...input
        };
        await this.store.update((current) => [...current, testcase]);
        return testcase;
    }
    async update(id, patch) {
        let updated = null;
        await this.store.update((current) => current.map((item) => {
            if (item.id !== id) {
                return item;
            }
            updated = {
                ...item,
                ...patch,
                updatedAt: new Date().toISOString()
            };
            return updated;
        }));
        return updated;
    }
    async remove(id) {
        let removed = false;
        await this.store.update((current) => {
            const next = current.filter((item) => item.id !== id);
            removed = next.length !== current.length;
            return next;
        });
        return removed;
    }
}
//# sourceMappingURL=TestCaseService.js.map
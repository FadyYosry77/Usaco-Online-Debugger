import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class JsonFileStore<T> {
  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T
  ) {}

  async read(): Promise<T> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      const initial = structuredClone(this.defaultValue);
      await this.write(initial);
      return initial;
    }
  }

  async write(value: T): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async update(updater: (current: T) => T | Promise<T>): Promise<T> {
    const current = await this.read();
    const next = await updater(current);
    await this.write(next);
    return next;
  }
}

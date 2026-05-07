import path from "node:path";
import type { TestCase } from "@usaco-helper/shared-types";
import { nanoid } from "nanoid";
import { JsonFileStore } from "../storage/JsonFileStore.js";

export class TestCaseService {
  private readonly store: JsonFileStore<TestCase[]>;

  constructor(baseDir: string) {
    this.store = new JsonFileStore(path.join(baseDir, "testcases.json"), []);
  }

  async list(): Promise<TestCase[]> {
    const testcases = await this.store.read();
    return [...testcases].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async create(input: Omit<TestCase, "id" | "createdAt" | "updatedAt">): Promise<TestCase> {
    const now = new Date().toISOString();
    const testcase: TestCase = {
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
      ...input
    };
    await this.store.update((current) => [...current, testcase]);
    return testcase;
  }

  async update(id: string, patch: Partial<TestCase>): Promise<TestCase | null> {
    let updated: TestCase | null = null;
    await this.store.update((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }
        updated = {
          ...item,
          ...patch,
          updatedAt: new Date().toISOString()
        };
        return updated;
      })
    );
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    let removed = false;
    await this.store.update((current) => {
      const next = current.filter((item) => item.id !== id);
      removed = next.length !== current.length;
      return next;
    });
    return removed;
  }
}

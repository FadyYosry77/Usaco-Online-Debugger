import type { TestCase } from "@usaco-helper/shared-types";
export declare class TestCaseService {
    private readonly store;
    constructor(baseDir: string);
    list(): Promise<TestCase[]>;
    create(input: Omit<TestCase, "id" | "createdAt" | "updatedAt">): Promise<TestCase>;
    update(id: string, patch: Partial<TestCase>): Promise<TestCase | null>;
    remove(id: string): Promise<boolean>;
}

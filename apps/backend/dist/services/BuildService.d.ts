import type { BuildProfile, BuildResult, HelperSettings } from "@usaco-helper/shared-types";
export declare class BuildService {
    private readonly workspaceDir;
    constructor(workspaceDir: string);
    build(sourceFileName: string, sourceCode: string, settings: HelperSettings, profile?: BuildProfile): Promise<BuildResult>;
}

export interface SourceValidationResult {
    ok: boolean;
    message?: string;
}
export declare function validateCppSourceSnapshot(sourceCode: string): SourceValidationResult;
export declare function analyzeCppSourceSnapshot(sourceCode: string): string[];

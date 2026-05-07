export function validateCppSourceSnapshot(sourceCode) {
    const source = sourceCode.trim();
    if (!source) {
        return {
            ok: false,
            message: "No synced source code available. Use Sync Code first."
        };
    }
    return { ok: true };
}
export function analyzeCppSourceSnapshot(sourceCode) {
    const source = sourceCode.trim();
    const code = stripComments(source);
    const warnings = [];
    if (!source) {
        return ["No source code was synced."];
    }
    const hasMain = /\b(?:int|int32_t|signed|auto)\s+main\s*\(/.test(code);
    if (!hasMain) {
        warnings.push("Synced source does not contain a visible main function.");
    }
    const hasIncludeOrImport = /^\s*#\s*include\b/m.test(code) || /^\s*import\s+[\w:.<>]+/m.test(code);
    const usesStandardLibraryNames = /\b(?:vector|map|set|string|cin|cout|cerr|ios_base|acos|int32_t)\b/.test(code);
    if (usesStandardLibraryNames && !hasIncludeOrImport) {
        warnings.push("Synced source uses standard-library names but no #include/import lines were detected.");
    }
    const missingAliases = findMissingTemplateAliases(code);
    if (missingAliases.length > 0) {
        warnings.push(`Synced source uses aliases/macros that were not detected in the synced file: ${missingAliases.join(", ")}.`);
    }
    return warnings;
}
function findMissingTemplateAliases(source) {
    const missing = [];
    if (usesToken(source, "ll") && !/(?:#\s*define\s+ll\b|using\s+ll\s*=|typedef\s+.+\s+ll\s*;)/.test(source)) {
        missing.push("ll");
    }
    if (usesToken(source, "ld") && !/(?:#\s*define\s+ld\b|using\s+ld\s*=|typedef\s+.+\s+ld\s*;)/.test(source)) {
        missing.push("ld");
    }
    if (usesToken(source, "vll") && !/(?:#\s*define\s+vll\b|using\s+vll\s*=|typedef\s+.+\s+vll\s*;)/.test(source)) {
        missing.push("vll");
    }
    if (usesToken(source, "nl") && !/(?:#\s*define\s+nl\b|const\s+(?:char|auto)\s+nl\b|constexpr\s+(?:char|auto)\s+nl\b)/.test(source)) {
        missing.push("nl");
    }
    return missing;
}
function usesToken(source, token) {
    return new RegExp(`\\b${token}\\b`).test(source);
}
function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
//# sourceMappingURL=sourceValidation.js.map
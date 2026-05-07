const GCC_DIAGNOSTIC_RE = /^(?<file>.*?):(?<line>\d+):(?<column>\d+): (?<severity>error|warning|note): (?<message>.*)$/;
export function parseCompilerDiagnostics(stderr) {
    const diagnostics = [];
    for (const rawLine of stderr.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        const match = line.match(GCC_DIAGNOSTIC_RE);
        if (!match?.groups) {
            continue;
        }
        diagnostics.push({
            file: match.groups.file,
            line: Number(match.groups.line),
            column: Number(match.groups.column),
            severity: normalizeSeverity(match.groups.severity),
            message: match.groups.message,
            raw: line
        });
    }
    return diagnostics;
}
function normalizeSeverity(value) {
    if (value === "warning" || value === "note") {
        return value;
    }
    return "error";
}
//# sourceMappingURL=diagnostics.js.map
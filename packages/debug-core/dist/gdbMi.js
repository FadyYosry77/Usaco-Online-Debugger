class Parser {
    input;
    index = 0;
    constructor(input) {
        this.input = input;
    }
    parseLine() {
        this.skipWhitespace();
        if (this.input.slice(this.index).startsWith("(gdb)")) {
            return { kind: "prompt" };
        }
        const token = this.parseOptionalToken();
        const marker = this.peek();
        if (marker === "^") {
            this.index += 1;
            const recordClass = this.parseIdentifier();
            return {
                kind: "result",
                token,
                class: recordClass,
                results: this.parseOptionalResults()
            };
        }
        if (marker === "*" || marker === "+" || marker === "=") {
            this.index += 1;
            const recordClass = this.parseIdentifier();
            return {
                kind: "async",
                token,
                asyncType: marker,
                class: recordClass,
                results: this.parseOptionalResults()
            };
        }
        if (marker === "~" || marker === "@" || marker === "&") {
            this.index += 1;
            return {
                kind: "stream",
                token,
                streamType: marker,
                text: this.parseCString()
            };
        }
        return {
            kind: "unknown",
            raw: this.input
        };
    }
    parseOptionalToken() {
        const start = this.index;
        while (isDigit(this.peek())) {
            this.index += 1;
        }
        if (start === this.index) {
            return undefined;
        }
        const value = Number(this.input.slice(start, this.index));
        return Number.isFinite(value) ? value : undefined;
    }
    parseOptionalResults() {
        this.skipWhitespace();
        if (this.peek() !== ",") {
            return [];
        }
        const results = [];
        while (this.peek() === ",") {
            this.index += 1;
            this.skipWhitespace();
            results.push(this.parseResult());
            this.skipWhitespace();
        }
        return results;
    }
    parseResult() {
        const variable = this.parseIdentifier();
        this.expect("=");
        return {
            variable,
            value: this.parseValue()
        };
    }
    parseValue() {
        const char = this.peek();
        if (char === '"') {
            return this.parseCString();
        }
        if (char === "{") {
            return this.parseTuple();
        }
        if (char === "[") {
            return this.parseList();
        }
        return this.parseBareWord();
    }
    parseTuple() {
        this.expect("{");
        const value = {};
        this.skipWhitespace();
        while (!this.isAtEnd() && this.peek() !== "}") {
            const result = this.parseResult();
            value[result.variable] = result.value;
            this.skipWhitespace();
            if (this.peek() === ",") {
                this.index += 1;
                this.skipWhitespace();
            }
        }
        this.expect("}");
        return { kind: "tuple", value };
    }
    parseList() {
        this.expect("[");
        const value = [];
        this.skipWhitespace();
        while (!this.isAtEnd() && this.peek() !== "]") {
            const checkpoint = this.index;
            const maybeIdentifier = this.parseIdentifierMaybe();
            if (maybeIdentifier && this.peek() === "=") {
                this.index = checkpoint;
                const result = this.parseResult();
                value.push({
                    kind: "tuple",
                    value: {
                        [result.variable]: result.value
                    }
                });
            }
            else {
                this.index = checkpoint;
                value.push(this.parseValue());
            }
            this.skipWhitespace();
            if (this.peek() === ",") {
                this.index += 1;
                this.skipWhitespace();
            }
        }
        this.expect("]");
        return { kind: "list", value };
    }
    parseCString() {
        this.expect('"');
        let output = "";
        while (!this.isAtEnd()) {
            const current = this.input[this.index];
            this.index += 1;
            if (current === '"') {
                break;
            }
            if (current === "\\") {
                const escaped = this.input[this.index] ?? "";
                this.index += 1;
                output += decodeEscape(escaped);
                continue;
            }
            output += current;
        }
        return output;
    }
    parseIdentifier() {
        const value = this.parseIdentifierMaybe();
        if (!value) {
            throw new Error(`Expected identifier at ${this.index}`);
        }
        return value;
    }
    parseIdentifierMaybe() {
        const start = this.index;
        while (isIdentifierChar(this.peek())) {
            this.index += 1;
        }
        return this.input.slice(start, this.index);
    }
    parseBareWord() {
        const start = this.index;
        while (!this.isAtEnd()) {
            const current = this.peek();
            if (current === "," || current === "]" || current === "}" || /\s/.test(current)) {
                break;
            }
            this.index += 1;
        }
        return this.input.slice(start, this.index);
    }
    expect(expected) {
        if (this.peek() !== expected) {
            throw new Error(`Expected "${expected}" at ${this.index}`);
        }
        this.index += 1;
    }
    skipWhitespace() {
        while (!this.isAtEnd() && /\s/.test(this.peek())) {
            this.index += 1;
        }
    }
    peek() {
        return this.input[this.index] ?? "";
    }
    isAtEnd() {
        return this.index >= this.input.length;
    }
}
function isDigit(char) {
    return char >= "0" && char <= "9";
}
function isIdentifierChar(char) {
    return /[A-Za-z0-9_.-]/.test(char);
}
function decodeEscape(char) {
    switch (char) {
        case "n":
            return "\n";
        case "r":
            return "\r";
        case "t":
            return "\t";
        case '"':
            return '"';
        case "\\":
            return "\\";
        default:
            return char;
    }
}
export function parseMiLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
        return { kind: "unknown", raw: line };
    }
    try {
        return new Parser(trimmed).parseLine();
    }
    catch {
        return { kind: "unknown", raw: line };
    }
}
export function parseMiOutput(output) {
    return output
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .map(parseMiLine);
}
export function getResultValue(record, variable) {
    return record.results.find((item) => item.variable === variable)?.value;
}
export function asString(value) {
    return typeof value === "string" ? value : undefined;
}
export function asTuple(value) {
    return value && typeof value !== "string" && value.kind === "tuple" ? value.value : undefined;
}
export function asList(value) {
    return value && typeof value !== "string" && value.kind === "list" ? value.value : undefined;
}
//# sourceMappingURL=gdbMi.js.map
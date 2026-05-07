export type MiValue = string | MiTuple | MiList;

export interface MiTuple {
  kind: "tuple";
  value: Record<string, MiValue>;
}

export interface MiList {
  kind: "list";
  value: MiValue[];
}

export interface MiResult {
  variable: string;
  value: MiValue;
}

export interface MiResultRecord {
  kind: "result";
  token?: number;
  class: string;
  results: MiResult[];
}

export interface MiAsyncRecord {
  kind: "async";
  token?: number;
  asyncType: "*" | "+" | "=";
  class: string;
  results: MiResult[];
}

export interface MiStreamRecord {
  kind: "stream";
  token?: number;
  streamType: "~" | "@" | "&";
  text: string;
}

export interface MiPromptRecord {
  kind: "prompt";
}

export interface MiUnknownRecord {
  kind: "unknown";
  raw: string;
}

export type MiRecord =
  | MiResultRecord
  | MiAsyncRecord
  | MiStreamRecord
  | MiPromptRecord
  | MiUnknownRecord;

class Parser {
  private index = 0;

  constructor(private readonly input: string) {}

  parseLine(): MiRecord {
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

  private parseOptionalToken(): number | undefined {
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

  private parseOptionalResults(): MiResult[] {
    this.skipWhitespace();
    if (this.peek() !== ",") {
      return [];
    }

    const results: MiResult[] = [];
    while (this.peek() === ",") {
      this.index += 1;
      this.skipWhitespace();
      results.push(this.parseResult());
      this.skipWhitespace();
    }
    return results;
  }

  private parseResult(): MiResult {
    const variable = this.parseIdentifier();
    this.expect("=");
    return {
      variable,
      value: this.parseValue()
    };
  }

  private parseValue(): MiValue {
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

  private parseTuple(): MiTuple {
    this.expect("{");
    const value: Record<string, MiValue> = {};

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

  private parseList(): MiList {
    this.expect("[");
    const value: MiValue[] = [];

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
      } else {
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

  private parseCString(): string {
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

  private parseIdentifier(): string {
    const value = this.parseIdentifierMaybe();
    if (!value) {
      throw new Error(`Expected identifier at ${this.index}`);
    }
    return value;
  }

  private parseIdentifierMaybe(): string {
    const start = this.index;
    while (isIdentifierChar(this.peek())) {
      this.index += 1;
    }
    return this.input.slice(start, this.index);
  }

  private parseBareWord(): string {
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

  private expect(expected: string): void {
    if (this.peek() !== expected) {
      throw new Error(`Expected "${expected}" at ${this.index}`);
    }
    this.index += 1;
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && /\s/.test(this.peek())) {
      this.index += 1;
    }
  }

  private peek(): string {
    return this.input[this.index] ?? "";
  }

  private isAtEnd(): boolean {
    return this.index >= this.input.length;
  }
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isIdentifierChar(char: string): boolean {
  return /[A-Za-z0-9_.-]/.test(char);
}

function decodeEscape(char: string): string {
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

export function parseMiLine(line: string): MiRecord {
  const trimmed = line.trim();
  if (!trimmed) {
    return { kind: "unknown", raw: line };
  }

  try {
    return new Parser(trimmed).parseLine();
  } catch {
    return { kind: "unknown", raw: line };
  }
}

export function parseMiOutput(output: string): MiRecord[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(parseMiLine);
}

export function getResultValue(
  record: MiResultRecord | MiAsyncRecord,
  variable: string
): MiValue | undefined {
  return record.results.find((item) => item.variable === variable)?.value;
}

export function asString(value: MiValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asTuple(value: MiValue | undefined): Record<string, MiValue> | undefined {
  return value && typeof value !== "string" && value.kind === "tuple" ? value.value : undefined;
}

export function asList(value: MiValue | undefined): MiValue[] | undefined {
  return value && typeof value !== "string" && value.kind === "list" ? value.value : undefined;
}

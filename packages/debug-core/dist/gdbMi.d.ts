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
export type MiRecord = MiResultRecord | MiAsyncRecord | MiStreamRecord | MiPromptRecord | MiUnknownRecord;
export declare function parseMiLine(line: string): MiRecord;
export declare function parseMiOutput(output: string): MiRecord[];
export declare function getResultValue(record: MiResultRecord | MiAsyncRecord, variable: string): MiValue | undefined;
export declare function asString(value: MiValue | undefined): string | undefined;
export declare function asTuple(value: MiValue | undefined): Record<string, MiValue> | undefined;
export declare function asList(value: MiValue | undefined): MiValue[] | undefined;

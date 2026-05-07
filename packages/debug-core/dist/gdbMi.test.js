import { describe, expect, it } from "vitest";
import { asList, asString, asTuple, getResultValue, parseMiLine, parseMiOutput } from "./gdbMi.js";
describe("GDB MI parser", () => {
    it("parses ^done records", () => {
        const record = parseMiLine('12^done,bkpt={number="1",file="main.cpp",line="7"}');
        expect(record.kind).toBe("result");
        if (record.kind !== "result") {
            return;
        }
        expect(record.token).toBe(12);
        expect(record.class).toBe("done");
        const bkpt = asTuple(getResultValue(record, "bkpt"));
        expect(asString(bkpt?.number)).toBe("1");
        expect(asString(bkpt?.file)).toBe("main.cpp");
    });
    it("parses ^error records", () => {
        const record = parseMiLine('4^error,msg="No symbol table is loaded."');
        expect(record.kind).toBe("result");
        if (record.kind !== "result") {
            return;
        }
        expect(record.class).toBe("error");
        expect(asString(getResultValue(record, "msg"))).toContain("No symbol table");
    });
    it("parses async records", () => {
        const record = parseMiLine('*stopped,reason="breakpoint-hit",thread-id="1"');
        expect(record.kind).toBe("async");
        if (record.kind !== "async") {
            return;
        }
        expect(record.asyncType).toBe("*");
        expect(record.class).toBe("stopped");
        expect(asString(getResultValue(record, "reason"))).toBe("breakpoint-hit");
    });
    it("parses thread-created notifications", () => {
        const record = parseMiLine('=thread-created,id="2",group-id="i1"');
        expect(record.kind).toBe("async");
        if (record.kind !== "async") {
            return;
        }
        expect(record.class).toBe("thread-created");
        expect(asString(getResultValue(record, "id"))).toBe("2");
    });
    it("parses stream output", () => {
        const consoleRecord = parseMiLine('~"Breakpoint 1\\n"');
        const logRecord = parseMiLine('&"warning\\n"');
        const targetRecord = parseMiLine('@"program output\\n"');
        expect(consoleRecord.kind).toBe("stream");
        expect(logRecord.kind).toBe("stream");
        expect(targetRecord.kind).toBe("stream");
    });
    it("parses list payloads", () => {
        const record = parseMiLine('21^done,stack=[frame={level="0",func="solve",file="main.cpp",line="12"},frame={level="1",func="main",file="main.cpp",line="30"}]');
        expect(record.kind).toBe("result");
        if (record.kind !== "result") {
            return;
        }
        const stack = asList(getResultValue(record, "stack"));
        expect(stack).toHaveLength(2);
    });
    it("returns unknown for malformed input", () => {
        expect(parseMiLine('^done,broken={oops').kind).toBe("unknown");
    });
    it("parses multiline output", () => {
        const records = parseMiOutput(['~"GNU gdb\\n"', '=thread-created,id="1"', "3^done"].join("\n"));
        expect(records).toHaveLength(3);
    });
});
//# sourceMappingURL=gdbMi.test.js.map
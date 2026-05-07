import { describe, expect, it } from "vitest";
import { helperShape } from "./testSupport.js";

describe("shared-types export sanity", () => {
  it("exposes the expected helper shape constants", () => {
    expect(helperShape.debugState).toBe("idle");
    expect(helperShape.settings.localhostHost).toBe("127.0.0.1");
  });
});

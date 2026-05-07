import { describe, expect, it } from "vitest";
import { helperTabs } from "./index";

describe("ui-components", () => {
  it("exposes helper panel tabs", () => {
    expect(helperTabs).toContain("Run");
    expect(helperTabs).toContain("Debug");
  });
});

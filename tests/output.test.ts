import { describe, expect, it } from "vitest";
import { canUseOutput } from "@/lib/output";

describe("canUseOutput", () => {
  it("allows a settled, successful, non-empty result", () => {
    expect(canUseOutput({ output: "x", error: null, pending: false })).toBe(true);
  });
  it("blocks after a failure, while pending, and for empty output", () => {
    expect(canUseOutput({ output: "", error: { message: "bad" }, pending: false })).toBe(false);
    expect(canUseOutput({ output: "stale", error: "bad" })).toBe(false);
    expect(canUseOutput({ output: "x", pending: true })).toBe(false);
    expect(canUseOutput({ output: "" })).toBe(false);
  });
});

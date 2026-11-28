import { describe, expect, it } from "vitest";
import { resultStatus } from "@/lib/status";

describe("result status", () => {
  it("stays silent when an error is shown, so role=\"alert\" is not doubled", () => {
    expect(resultStatus({ output: "", error: "Width must be at least 1." })).toBe("");
  });

  it("says so when there is nothing to announce yet", () => {
    expect(resultStatus({ output: "" })).toBe("No output yet.");
    expect(resultStatus({ output: "", error: null })).toBe("No output yet.");
  });

  it("describes the result by size instead of reading it out", () => {
    const output = "The quick brown fox\njumps over the lazy dog";
    const status = resultStatus({ output });
    expect(status).toBe("Result ready: 43 characters in 2 lines.");
    expect(status).not.toContain("quick brown");
  });

  it("counts characters as code points, not UTF-16 units", () => {
    expect(resultStatus({ output: "🌍🌍" })).toBe("Result ready: 2 characters in 1 line.");
    expect(resultStatus({ output: "Қазақ" })).toBe("Result ready: 5 characters in 1 line.");
  });

  it("uses singular nouns and thousands separators", () => {
    expect(resultStatus({ output: "a" })).toBe("Result ready: 1 character in 1 line.");
    expect(resultStatus({ output: "x".repeat(1234) })).toBe("Result ready: 1,234 characters in 1 line.");
  });
});

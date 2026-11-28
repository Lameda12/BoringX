import fs from "node:fs";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { installWorkerShim } from "./helpers/node-worker";
import { runRegexJob, type RegexJob } from "@/engine/regex-worker";
import { runPipeline } from "@/engine/run";
import { blockById } from "@/engine/registry";

beforeAll(installWorkerShim);

const evil = "a".repeat(45) + "b"; // (a+)+$ backtracks exponentially on this
type RegexOp = Extract<RegexJob, { kind: "regex" }>;
const regexJob = (input: string, pattern: string, mode = "matches", flags = "g"): RegexOp => ({ kind: "regex", input, pattern, flags, mode, replacement: "$&" });

describe("regex worker core", () => {
  const mod = { exports: {} as { runRegexJob: (j: RegexJob) => string } };
  vm.runInNewContext(fs.readFileSync("public/workers/regex.js", "utf8"), { module: mod, self: undefined });
  it("matches, replaces and filters lines", () => {
    expect(mod.exports.runRegexJob(regexJob("a1 b22", "\\d+"))).toMatch(/^2 matches/);
    expect(mod.exports.runRegexJob({ ...regexJob("a1", "\\d"), mode: "replace", replacement: "#" })).toBe("a#");
    expect(mod.exports.runRegexJob({ kind: "replace", input: "AA", find: "a", with: "b", all: true, ignoreCase: true })).toBe("bb");
  });
  it("reports invalid patterns", () => {
    expect(() => mod.exports.runRegexJob(regexJob("x", "("))).toThrow(/Invalid regex/);
  });
});

describe("regex in a terminable worker", () => {
  it("returns normal results", async () => {
    expect(await runRegexJob(regexJob("a1 b22", "\\d+"), "Regex block")).toMatch(/^2 matches/);
  });
  it("stops a pathological pattern at the timeout and names the operation", async () => {
    const t = performance.now();
    await expect(runRegexJob(regexJob(evil, "(a+)+$"), "Regex block", 300)).rejects.toThrow(/Regex block ran longer than 0\.3s and was stopped/);
    expect(performance.now() - t).toBeLessThan(2000);
  });
  it("a valid pattern succeeds right after a timeout", async () => {
    await expect(runRegexJob(regexJob(evil, "(a+)+$"), "Regex block", 200)).rejects.toThrow(/stopped/);
    expect(await runRegexJob(regexJob("x1", "\\d"), "Regex block")).toMatch(/^1 match/);
  });
  it("the event loop stays responsive while the worker is stuck", async () => {
    let ticks = 0;
    const iv = setInterval(() => ticks++, 10);
    await expect(runRegexJob(regexJob(evil, "(a+)+$"), "Regex block", 400)).rejects.toThrow();
    clearInterval(iv);
    expect(ticks).toBeGreaterThan(10);
  });
  it("a new job terminates a superseded in-flight one", async () => {
    const old = runRegexJob(regexJob(evil, "(a+)+$"), "Regex block", 5000);
    const oldResult = old.then(() => "ok", (e: Error) => e.message);
    const t = performance.now();
    const next = await runRegexJob(regexJob("x1", "\\d"), "Regex block");
    expect(await oldResult).toMatch(/Superseded/);
    expect(next).toMatch(/^1 match/);
    expect(performance.now() - t).toBeLessThan(2000);
  });
  it("rejects when Workers are unavailable", async () => {
    await expect(runRegexJob(regexJob("x", "x"), "Regex block", 100, () => { throw new Error("Workers are not available in this browser."); })).rejects.toThrow(/not available/);
  });
});

describe("blocks use the worker", () => {
  it("regex block times out on a pathological pattern, then recovers", async () => {
    const r = await runPipeline(evil, [{ b: "regex", p: { pattern: "(a+)+$", flags: "", mode: "test" } }], blockById);
    expect(r.error?.message).toMatch(/Regex block ran longer than 2s and was stopped/);
    const ok = await runPipeline("a1", [{ b: "regex", p: { pattern: "\\d", flags: "", mode: "matches" } }], blockById);
    expect(ok.error).toBeUndefined();
  }, 10000);
  it("Sandbox Find and replace with regex gets the same protection and names itself", async () => {
    const r = await runPipeline(evil, [{ b: "replace", p: { find: "(a+)+$", with: "x", regex: true } }], blockById);
    expect(r.error?.message).toMatch(/Find and replace block ran longer than 2s and was stopped/);
  }, 10000);
  it("literal Find and replace still works without a worker", async () => {
    expect((await runPipeline("a.b", [{ b: "replace", p: { find: ".", with: "-" } }], blockById)).output).toBe("a-b");
  });
});

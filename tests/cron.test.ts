import { describe, expect, it } from "vitest";
import { blockById } from "@/engine/registry";
import { defaultParams, type Params } from "@/engine/types";
import { runPipeline } from "@/engine/run";
import { decodeRecipe, encodeRecipe } from "@/engine/recipe";
import type { Recipe } from "@/engine/types";

async function run(input: string, params: Params = {}) {
  const b = blockById("cron");
  if (!b) throw new Error("no block cron");
  return b.run(input, { ...defaultParams(b), ...params });
}
const runs = (out: string) => [...out.matchAll(/^ {2}(\w{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC[+-]\d{2}:\d{2})$/gm)].map((m) => m[1]);
const next = async (expr: string, tz: string, after: string) => runs(await run(expr, { tz, after }));
const fails = (expr: string, re: RegExp, params: Params = {}) => expect(run(expr, params), expr).rejects.toThrow(re);

describe("cron: dialect and field meanings", () => {
  it("states the five fields, their values and the dialect", async () => {
    const o = await run("*/15 9-17 * jan,MAR mon-fri", { tz: "UTC", after: "2026-01-01T00:00:00Z" });
    expect(o).toMatch(/Dialect: five fields/);
    expect(o).toMatch(/minute\s+\*\/15\s+0, 15, 30, 45/);
    expect(o).toMatch(/hour\s+9-17\s+9 to 17/);
    expect(o).toMatch(/day of month\s+\*\s+every day of month/);
    expect(o).toMatch(/month\s+jan,MAR\s+January, March/);
    expect(o).toMatch(/day of week\s+mon-fri\s+Monday to Friday/);
  });
  it("supports ranges with steps, lists and 7 as Sunday", async () => {
    expect(await run("1-10/3,59 0 * * 7")).toMatch(/minute\s+\S+\s+1, 4, 7, 10, 59/);
    expect(await next("0 0 * * 7", "UTC", "2026-11-26T00:00:00Z")).toEqual(await next("0 0 * * SUN", "UTC", "2026-11-26T00:00:00Z"));
    expect(await next("0 0 * * 5-7", "UTC", "2026-11-26T00:00:00Z")).toEqual([
      "Fri 2026-11-27 00:00 UTC+00:00", "Sat 2026-11-28 00:00 UTC+00:00", "Sun 2026-11-29 00:00 UTC+00:00",
      "Fri 2026-12-04 00:00 UTC+00:00", "Sat 2026-12-05 00:00 UTC+00:00",
    ]);
  });
  it("matches either day field when both are restricted", async () => {
    const o = await run("0 0 1 * 1", { tz: "UTC", after: "2026-11-26T00:00:00Z" });
    expect(o).toMatch(/either/i);
    expect(runs(o).map((r) => r.slice(0, 14))).toEqual(["Mon 2026-11-30", "Tue 2026-12-01", "Mon 2026-12-07", "Mon 2026-12-14", "Mon 2026-12-21"]);
  });
  it("requires both when a day field starts with *", async () => {
    const r = await next("0 0 */31 * 1", "UTC", "2026-11-26T00:00:00Z");
    expect(r.slice(0, 3).map((x) => x.slice(0, 14))).toEqual(["Mon 2027-02-01", "Mon 2027-03-01", "Mon 2027-11-01"]);
  });
});

describe("cron: invalid expressions", () => {
  it("explains what is wrong", async () => {
    await fails("", /Enter a cron expression/);
    await fails("* * * *", /5 fields.*got 4/);
    await fails("0 0 * * * *", /5 fields.*got 6.*seconds/i);
    await fails("60 * * * *", /minute.*0-59/);
    await fails("* 24 * * *", /hour.*0-23/);
    await fails("* * 0 * *", /day of month.*1-31/);
    await fails("* * * 13 *", /month.*1-12/);
    await fails("* * * * 8", /day of week.*0-7/);
    await fails("MON * * * *", /minute.*"MON"/);
    await fails("10-5 * * * *", /minute.*backwards/);
    await fails("0 0 * * FRI-SUN", /backwards.*7/);
    await fails("*/0 * * * *", /step/);
    await fails("5/10 * * * *", /step.*range/);
    await fails("1,,2 * * * *", /minute/);
    await fails("@daily", /0 0 \* \* \*/);
    await fails("0 0 L * *", /not supported/);
    await fails("0 0 * * 1#2", /not supported/);
    await fails("0 0 30 2 *", /never/i);
    await fails("* * * * *\n0 0 * * *", /one expression/i);
  });
  it("rejects a bad zone or start time", async () => {
    await fails("* * * * *", /not a time zone/, { tz: "Mars/Base" });
    await fails("* * * * *", /Start after/, { after: "2026-02-30T00:00:00Z" });
    await fails("* * * * *", /Start after/, { after: "2026-01-01 10:00" });
    await fails("* * * * *", /Start after/, { after: "tomorrow" });
  });
});

describe("cron: upcoming runs", () => {
  it("shows five dates with offsets in the selected zone", async () => {
    const o = await run("0 9 * * 1-5", { tz: "America/Halifax", after: "2026-11-26T12:00:00Z" });
    expect(o).toContain("Next 5 runs in America/Halifax");
    expect(runs(o)).toEqual([
      "Thu 2026-11-26 09:00 UTC-04:00", "Fri 2026-11-27 09:00 UTC-04:00", "Mon 2026-11-30 09:00 UTC-04:00",
      "Tue 2026-12-01 09:00 UTC-04:00", "Wed 2026-12-02 09:00 UTC-04:00",
    ]);
  });
  it("is strictly after the start time", async () => {
    expect((await next("0 9 * * *", "UTC", "2026-11-26T09:00:00Z"))[0]).toBe("Fri 2026-11-27 09:00 UTC+00:00");
    expect((await next("0 9 * * *", "UTC", "2026-11-26T08:59:59Z"))[0]).toBe("Thu 2026-11-26 09:00 UTC+00:00");
  });
  it("starts from now when no start time is given", async () => {
    expect(runs(await run("* * * * *"))).toHaveLength(5);
  });
  it("handles half-hour offsets and rare dates", async () => {
    expect((await next("0 12 * * *", "Asia/Kolkata", "2026-11-26T00:00:00Z"))[0]).toBe("Thu 2026-11-26 12:00 UTC+05:30");
    expect((await next("0 0 29 2 *", "UTC", "2026-11-26T00:00:00Z")).map((r) => r.slice(4, 14))).toEqual(["2028-02-29", "2032-02-29", "2036-02-29", "2040-02-29", "2044-02-29"]);
  });
});

describe("cron: daylight saving", () => {
  const tz = "America/Halifax";
  it("skips a fixed time that does not exist and says so", async () => {
    const o = await run("30 2 * * *", { tz, after: "2027-03-13T00:00:00-04:00" });
    expect(runs(o).slice(0, 3)).toEqual(["Sat 2027-03-13 02:30 UTC-04:00", "Mon 2027-03-15 02:30 UTC-03:00", "Tue 2027-03-16 02:30 UTC-03:00"]);
    expect(o).toMatch(/Skipped: 2027-03-14 02:30 does not exist/);
  });
  it("runs a fixed time once, at the earlier offset, when the clock repeats it", async () => {
    const o = await run("30 1 * * *", { tz, after: "2027-11-06T00:00:00-03:00" });
    expect(runs(o).slice(0, 3)).toEqual(["Sat 2027-11-06 01:30 UTC-03:00", "Sun 2027-11-07 01:30 UTC-03:00", "Mon 2027-11-08 01:30 UTC-04:00"]);
    expect(o).toMatch(/Repeated: 2027-11-07 01:30 happens twice/);
  });
  it("does not run a fixed time again in the second pass of a repeated hour", async () => {
    expect((await next("30 1 * * *", tz, "2027-11-07T01:45:00-03:00"))[0]).toBe("Mon 2027-11-08 01:30 UTC-04:00");
  });
  it("runs a wildcard schedule through both passes of a repeated hour", async () => {
    expect(await next("*/30 * * * *", tz, "2027-11-07T00:45:00-03:00")).toEqual([
      "Sun 2027-11-07 01:00 UTC-03:00", "Sun 2027-11-07 01:30 UTC-03:00",
      "Sun 2027-11-07 01:00 UTC-04:00", "Sun 2027-11-07 01:30 UTC-04:00", "Sun 2027-11-07 02:00 UTC-04:00",
    ]);
  });
  it("jumps over the gap for a wildcard schedule", async () => {
    expect((await next("*/30 * * * *", tz, "2027-03-14T01:15:00-04:00")).slice(0, 3)).toEqual([
      "Sun 2027-03-14 01:30 UTC-04:00", "Sun 2027-03-14 03:00 UTC-03:00", "Sun 2027-03-14 03:30 UTC-03:00",
    ]);
  });
  it("handles a half-hour clock change", async () => {
    expect((await next("45 1 * * *", "Australia/Lord_Howe", "2027-04-04T00:00:00+11:00")).slice(0, 2)).toEqual([
      "Sun 2027-04-04 01:45 UTC+11:00", "Mon 2027-04-05 01:45 UTC+10:30",
    ]);
  });
  it("documents the clock-change rule in the result", async () => {
    expect(await run("0 0 * * *")).toMatch(/Clock changes:/);
  });
});

describe("cron: clock-change edge cases", () => {
  const tz = "America/Halifax";
  it("treats a star in either the minute or the hour field as running both times", async () => {
    expect((await next("30 * * * *", tz, "2027-11-07T00:45:00-03:00")).slice(0, 3)).toEqual([
      "Sun 2027-11-07 01:30 UTC-03:00", "Sun 2027-11-07 01:30 UTC-04:00", "Sun 2027-11-07 02:30 UTC-04:00",
    ]);
    expect(await next("*/15 1 * * *", tz, "2027-11-07T00:45:00-03:00")).toEqual([
      "Sun 2027-11-07 01:00 UTC-03:00", "Sun 2027-11-07 01:15 UTC-03:00", "Sun 2027-11-07 01:30 UTC-03:00",
      "Sun 2027-11-07 01:45 UTC-03:00", "Sun 2027-11-07 01:00 UTC-04:00",
    ]);
  });
  it("notes every listed repeated time, including those late in the first pass", async () => {
    const o = await run("* * * * *", { tz, after: "2027-11-07T04:57:00Z" });
    expect(o).toContain("Repeated: 5 listed times from 2027-11-07 01:00 to 01:59 happen twice; runs both times.");
  });
  it("collapses many skipped times into one line", async () => {
    const o = await run("* * * * *", { tz, after: "2027-03-14T05:57:00Z" });
    expect(o.match(/^Skipped:/gm)).toHaveLength(1);
    expect(o).toContain("Skipped: 60 times from 2027-03-14 02:00 to 02:59 do not exist (clocks jump forward).");
  });
  it("does not mention a gap that is already behind the start time", async () => {
    expect(await run("30 2,3 * * *", { tz, after: "2027-03-14T03:10:00-03:00" })).not.toMatch(/Skipped/);
  });
  it("says a time is always skipped instead of calling the date impossible, quickly", async () => {
    const t = performance.now();
    await fails("* 2 8-14 3 */7", /clock change.*America\/Halifax/, { tz, after: "2026-01-01T00:00:00Z" });
    expect(performance.now() - t).toBeLessThan(5000);
  });
  it("reuses formatters instead of building one per candidate time", async () => {
    const Real = Intl.DateTimeFormat;
    let built = 0;
    Intl.DateTimeFormat = new Proxy(Real, { construct: (t, a) => { built++; return Reflect.construct(t, a); } });
    try { await run("* * * * *", { tz, after: "2027-03-14T05:57:00Z" }); }
    finally { Intl.DateTimeFormat = Real; }
    expect(built).toBeLessThan(5);
  });
  it("lists runs in time order when the clock goes back across midnight", async () => {
    const r = await next("*/30 * * * *", "America/Moncton", "2006-10-29T02:00:00Z");
    const at = r.map((x) => Date.parse(`${x.slice(4, 14)}T${x.slice(15, 20)}:00${x.slice(24)}`));
    expect(at).toHaveLength(5);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});

describe("cron: input edge cases", () => {
  it("accepts the ISO format printed by Unix Timestamp", async () => {
    expect(runs(await run("0 9 * * *", { after: "2026-11-26T00:00:00.000Z" }))).toHaveLength(5);
  });
  it("rejects start years it cannot format", async () => {
    await fails("* * * * *", /Start after/, { after: "0000-01-01T00:00:00Z" });
    await fails("* * * * *", /Start after/, { after: "9999-06-01T00:00:00Z" });
  });
  it("names the missing part of a range or step", async () => {
    await fails("/5 * * * *", /before the \//);
    await fails("-5 * * * *", /both sides/);
    await fails("1- * * * *", /both sides/);
  });
});

describe("cron: reusable block", () => {
  it("keeps zone and start time through a recipe link and chains", async () => {
    const r: Recipe = { name: "t", input: "0 9 * * *", steps: [{ b: "cron", p: { tz: "Asia/Tokyo", after: "2026-11-26T00:00:00Z" } }, { b: "case-convert", p: { mode: "upper" } }] };
    const back = await decodeRecipe(await encodeRecipe(r));
    const o = await runPipeline(back.input, back.steps, blockById);
    expect(o.error).toBeUndefined();
    expect(o.output).toContain("NEXT 5 RUNS IN ASIA/TOKYO");
  });
});

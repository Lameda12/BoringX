import type { BlockDef, ToolMeta } from "@/engine/types";
import { text } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";
import { offsetAt } from "./time-zone";

export const meta: ToolMeta = {
  slug: "cron", name: "Cron Explainer", category: "Convert",
  blurb: "Explains a five-field cron expression and lists its next five runs.",
  description: "Explain a five-field cron expression and see its next five runs in any IANA time zone, with UTC offsets and daylight saving changes called out.",
  keywords: ["cron", "crontab", "schedule", "expression", "next run", "dst"],
  recipe: { name: "Cron Explainer", input: "0 9 * * 1-5", steps: [{ b: "cron", p: { tz: "America/Halifax" } }] },
};

type Field = { name: string; min: number; max: number; names?: string[]; labels?: string[] };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const abbr = (s: string) => s.slice(0, 3).toUpperCase();
const FIELDS: Field[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTHS.map(abbr), labels: MONTHS },
  { name: "day of week", min: 0, max: 7, names: WEEKDAYS.map(abbr), labels: WEEKDAYS },
];
const ORDER = "minute hour day-of-month month day-of-week";
const MACROS: Record<string, string> = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };

function parseField(raw: string, f: Field): number[] {
  const bad = (why: string): never => { throw new Error(`Bad ${f.name} field "${raw}": ${why}`); };
  const value = (s: string): number => {
    const named = f.names?.indexOf(s.toUpperCase()) ?? -1;
    if (named >= 0) return named + f.min;
    if (!/^\d+$/.test(s)) {
      if (/^(\?|L|W|LW|L-\d+|\d+[LW]|\w+#\d+)$/i.test(s)) bad(`"${s}" (L, W, # and ?) is not supported.`);
      bad(`"${s}" is not a value. ${f.name} must be ${f.min}-${f.max}${f.names ? ` or ${f.names[0]}-${f.names.at(-1)}` : ""}.`);
    }
    const n = Number(s);
    if (n < f.min || n > f.max) bad(`${f.name} must be ${f.min}-${f.max}, got ${s}.`);
    return n;
  };
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const [range, step, ...rest] = part.split("/");
    if (!part) bad("there is an empty list item.");
    if (!range) bad("put * or a range before the /, as in */5.");
    if (rest.length || (step !== undefined && !/^[1-9]\d*$/.test(step))) bad("a step must be one whole number of 1 or more, as in */5.");
    const ends = range === "*" ? [] : range.split("-");
    if (ends.length > 2 || ends.includes("")) bad("a range needs one number on both sides of the -, as in 1-5.");
    if (step !== undefined && ends.length === 1) bad(`a step needs a range or *, as in ${ends[0]}-${f.max}/${step}.`);
    const lo = ends.length ? value(ends[0]) : f.min;
    const hi = ends.length ? value(ends[ends.length - 1]) : f.max;
    if (lo > hi) bad(`the range ${range} runs backwards.${f.name === "day of week" ? " To end on Sunday, use 7 (FRI-SUN is 5-7)." : ""}`);
    for (let v = lo; v <= hi; v += Number(step ?? 1)) out.add(f.name === "day of week" ? v % 7 : v);
  }
  return [...out].sort((a, b) => a - b);
}

function describe(values: number[], f: Field): string {
  const size = f.name === "day of week" ? 7 : f.max - f.min + 1;
  if (values.length === size) return `every ${f.name}`;
  const label = (v: number) => f.labels?.[v - f.min] ?? String(v);
  const parts: string[] = [];
  for (let i = 0, j = 0; i < values.length; i = j) {
    for (j = i + 1; values[j] === values[j - 1] + 1; j++);
    if (j - i >= 3) parts.push(`${label(values[i])} to ${label(values[j - 1])}`);
    else parts.push(...values.slice(i, j).map(label));
  }
  return parts.join(", ");
}

function parseCron(input: string) {
  const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error(`Enter a cron expression: ${ORDER}, like 0 9 * * 1-5.`);
  if (lines.length > 1) throw new Error("Enter one expression at a time, on a single line.");
  if (lines[0].startsWith("@")) {
    const same = MACROS[lines[0].toLowerCase()];
    throw new Error(`@ shortcuts are not supported.${same ? ` Write ${same} instead.` : " Write the five fields instead."}`);
  }
  const raw = lines[0].split(/\s+/);
  if (raw.length !== 5) throw new Error(`Expected 5 fields (${ORDER}), got ${raw.length}.${raw.length > 5 ? " Seconds and year fields are not supported, and leave out the command." : ""}`);
  const values = raw.map((r, i) => parseField(r, FIELDS[i]));
  const [minutes, hours, days, months, weekdays] = values;
  // As in Vixie cron: a day field that starts with * does not count as restricted.
  const either = !raw[2].startsWith("*") && !raw[4].startsWith("*");
  const wildcardTime = raw[0].startsWith("*") || raw[1].startsWith("*");
  const matchesDay = (d: Date) => {
    if (!months.includes(d.getUTCMonth() + 1)) return false;
    const dom = days.includes(d.getUTCDate()), dow = weekdays.includes(d.getUTCDay());
    return either ? dom || dow : dom && dow;
  };
  return { line: lines[0], raw, values, minutes, hours, either, wildcardTime, matchesDay };
}

const DAY = 86_400_000;
const COUNT = 5;
const pad = (n: number) => String(n).padStart(2, "0");
/** `wall` is a local clock reading stored as if it were UTC. */
const fmtWall = (wall: number) => new Date(wall).toISOString().slice(0, 16).replace("T", " ");
function fmtOffset(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60_000);
  return `UTC${ms < 0 ? "-" : "+"}${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
const fmtRun = (t: number, tz: string) => {
  const off = offsetAt(t, tz);
  return `${WEEKDAYS[new Date(t + off).getUTCDay()].slice(0, 3)} ${fmtWall(t + off)} ${fmtOffset(off)}`;
};

/** A wall time affected by a clock change. `at` is the instant used to decide whether to mention it. */
type Change = { wall: number; at: number };

/** One line per calendar day, so an every-minute schedule cannot flood the result. */
function summarise(changes: Change[], line: (what: string, one: boolean, first: Change) => string, listed = ""): string[] {
  const byDay = new Map<number, Change[]>();
  for (const c of changes) {
    const day = Math.floor(c.wall / DAY);
    byDay.set(day, [...(byDay.get(day) ?? []), c]);
  }
  return [...byDay.values()].map((group) => {
    const walls = group.map((c) => c.wall).sort((a, b) => a - b);
    const first = fmtWall(walls[0]);
    const one = walls.length === 1;
    return line(one ? first : `${walls.length} ${listed}times from ${first} to ${fmtWall(walls[walls.length - 1]).slice(11)}`, one, group[0]);
  });
}

function nextRuns(cron: ReturnType<typeof parseCron>, after: number, tz: string) {
  const found: number[] = [];
  const skipped: Change[] = [];
  const repeated: (Change & { offset: number })[] = [];
  const startWall = after + offsetAt(after, tz);
  let day = Math.floor(startWall / DAY) * DAY - DAY;
  // The Gregorian calendar repeats every 400 years: no match in that span means no match ever.
  // When matches exist but all fall in clock changes, 40 years is enough to say so.
  for (let idle = 0; idle <= (skipped.length ? 14_610 : 146_097); day += DAY, idle++) {
    // Search one day past the fifth run: a clock set back at midnight interleaves two dates.
    const last = found.length >= COUNT;
    if (cron.matchesDay(new Date(day))) {
      const before = offsetAt(day - 1.5 * DAY, tz);
      const later = offsetAt(day + 2.5 * DAY, tz);
      for (const h of cron.hours) for (const m of cron.minutes) {
        const wall = day + h * 3_600_000 + m * 60_000;
        // Usually one offset applies. Near a clock change, a wall time can map to zero or two instants.
        const instants = before === later
          ? [wall - before]
          : [wall - before, wall - later].filter((t) => offsetAt(t, tz) === wall - t).sort((a, b) => a - b);
        if (!instants.length) {
          if (wall > startWall) skipped.push({ wall, at: wall - before });
          continue;
        }
        for (const at of cron.wildcardTime ? instants : instants.slice(0, 1)) {
          if (at <= after) continue;
          found.push(at);
          idle = 0;
          if (instants.length > 1) repeated.push({ wall, at, offset: wall - instants[0] });
        }
      }
    }
    if (last) break;
  }
  if (!found.length) {
    throw new Error(skipped.length
      ? `Every matching time in the 40 years searched falls in a clock change in ${tz}, so it never runs there. Change the hour or the zone.`
      : "This expression never matches a real date (for example, 30 February). Check the day and month fields.");
  }
  const runs = found.sort((a, b) => a - b).slice(0, COUNT);
  const end = runs.length < COUNT ? Infinity : runs[runs.length - 1];
  const listed = new Set(runs);
  // A wall time listed in both passes is one repeated time, not two.
  const twice = [...new Map(repeated.filter((c) => listed.has(c.at)).map((c) => [c.wall, c])).values()];
  const gapStart = new Map<number, number>();
  for (const c of skipped) {
    const key = Math.floor(c.wall / DAY);
    gapStart.set(key, Math.min(c.at, gapStart.get(key) ?? c.at));
  }
  const notes = [
    // Mention a gap, in full, once the listed runs reach where it starts.
    ...summarise(skipped.filter((c) => gapStart.get(Math.floor(c.wall / DAY))! <= end), (what, one) => `Skipped: ${what} ${one ? "does" : "do"} not exist (clocks jump forward).`),
    ...summarise(twice, (what, one, first) => `Repeated: ${what} ${one ? "happens" : "happen"} twice; ${cron.wildcardTime ? "runs both times" : `runs once, at the earlier offset (${fmtOffset((first as Change & { offset: number }).offset)})`}.`, "listed "),
  ];
  return { runs, notes };
}

function parseAfter(s: string): number {
  if (!s) return Date.now();
  const m = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/);
  // Round-trip the clock reading so 30 February is rejected instead of rolling into March.
  const wall = m ? Date.parse(`${m[1]}Z`) : NaN;
  if (!m || Number.isNaN(wall) || !new Date(wall).toISOString().startsWith(m[1]) || m[1] < "1970" || m[1] >= "9000") {
    throw new Error(`Start after "${s}" is not a valid time between 1970 and 8999. Use a form like 2026-01-31T09:30:00Z or 2026-01-31T09:30-04:00, or leave it blank for now.`);
  }
  return Date.parse(s);
}

export const blocks: BlockDef[] = [{
  id: "cron", name: "Cron explainer", category: "Convert", description: `Input: one cron expression (${ORDER}). Output: field meanings and the next five runs.`,
  params: [
    text("tz", "Time zone", "UTC", "IANA name, e.g. America/Halifax"),
    text("after", "Start after", "", "Blank means now. Or e.g. 2026-01-31T09:30:00Z"),
  ],
  run: (input, p) => {
    const cron = parseCron(input);
    const tz = String(p.tz).trim() || "UTC";
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { throw new Error(`"${tz}" is not a time zone. Use an IANA name like Europe/Paris or UTC.`); }
    const after = parseAfter(String(p.after ?? "").trim());
    const { runs, notes } = nextRuns(cron, after, tz);
    return [
      cron.line,
      "",
      "Fields",
      ...FIELDS.map((f, i) => `  ${f.name.padEnd(13)} ${cron.raw[i].padEnd(10)} ${describe(cron.values[i], f)}`),
      cron.either
        ? "Day rule: both day fields are set, so a date matching either one runs (within the listed months)."
        : "Day rule: a date must match day of month, month and day of week.",
      "",
      `Next ${runs.length} runs in ${tz} (after ${fmtRun(after, tz)})`,
      ...runs.map((t) => `  ${fmtRun(t, tz)}`),
      ...(notes.length ? ["", ...notes] : []),
      "",
      `Dialect: five fields (${ORDER}). Supports * , - / and JAN-DEC, SUN-SAT names; 0 and 7 are Sunday. No seconds, @ shortcuts, L, W, # or ?.`,
      "Clock changes: a time that does not exist is skipped. A repeated time runs once, at the earlier offset, unless the minute or hour field starts with *, which runs both times. Schedulers differ here (some run skipped jobs right after the jump), so check yours.",
    ].join("\n");
  },
}];

export default toolFromRecipe(meta.recipe!, blocks, { inputLabel: `Cron expression: ${ORDER}`, outputName: "cron.txt", inputRows: 2 });

import type { BlockDef, ToolMeta } from "@/engine/types";
import { text } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";
import { fmtInZone } from "./unix-timestamp";

export const meta: ToolMeta = {
  slug: "time-zone", name: "Time Zone", category: "Convert",
  blurb: "Converts a clock time from one zone to several others.",
  description: "Convert a date and time between time zones, including daylight saving. Pick a source zone and list the zones you need.",
  keywords: ["time zone", "timezone", "convert", "utc", "dst", "meeting"],
  recipe: { name: "Time Zone", input: "2026-03-08 09:00", steps: [{ b: "timezone", p: { from: "America/Halifax", to: "UTC, America/Los_Angeles, Europe/London, Asia/Tokyo" } }] },
};

// Building a formatter is far slower than using one, and callers ask thousands of times.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function offsetAt(ms: number, tz: string): number {
  let f = formatters.get(tz);
  if (!f) formatters.set(tz, (f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })));
  const g: Record<string, number> = {};
  for (const x of f.formatToParts(ms)) if (x.type !== "literal") g[x.type] = Number(x.value);
  return Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute, g.second) - Math.floor(ms / 1000) * 1000;
}
export function zonedToInstant(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - offsetAt(guess, tz);
  t = guess - offsetAt(t, tz);
  return t;
}
const valid = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };

export const blocks: BlockDef[] = [{
  id: "timezone", name: "Time zone", category: "Convert", description: "Input: date and time in the source zone, one per line.",
  params: [text("from", "From zone", "UTC", "IANA name"), text("to", "To zones", "UTC, America/New_York", "Comma separated")],
  run: (input, p) => {
    const from = String(p.from).trim();
    const to = String(p.to).split(",").map((s) => s.trim()).filter(Boolean);
    for (const z of [from, ...to]) if (!valid(z)) throw new Error(`"${z}" is not a time zone. Use an IANA name like Europe/Paris or UTC.`);
    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Enter a date and time like 2026-03-08 09:00.");
    return lines.map((l) => {
      const m = l.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (!m) return `${l}\n  Could not read this. Use YYYY-MM-DD HH:MM.`;
      const ms = zonedToInstant(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), from);
      return [`${l} (${from})`, ...to.map((z) => `  ${z.padEnd(24)} ${fmtInZone(ms, z)}`)].join("\n");
    }).join("\n\n");
  },
}];

export default toolFromRecipe(meta.recipe!, blocks, { inputLabel: "Date and time in the source zone", outputName: "time-zones.txt", inputRows: 3 });

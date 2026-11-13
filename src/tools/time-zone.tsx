import type { BlockDef, ToolMeta } from "@/engine/types";
import { sel, text } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";
import { fmtInZone } from "./unix-timestamp";

export const meta: ToolMeta = {
  slug: "time-zone", name: "Time Zone", category: "Convert",
  blurb: "Converts a clock time from one zone to several others.",
  description: "Convert a date and time between time zones, including daylight saving. Pick a source zone and list the zones you need.",
  keywords: ["time zone", "timezone", "convert", "utc", "dst", "meeting"],
  recipe: { name: "Time Zone", input: "2026-03-08 09:00", steps: [{ b: "timezone", p: { from: "America/Halifax", to: "UTC, America/Los_Angeles, Europe/London, Asia/Tokyo" } }] },
};

function offsetAt(ms: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  const g: Record<string, number> = {};
  for (const x of f.formatToParts(ms)) if (x.type !== "literal") g[x.type] = Number(x.value);
  return Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute, g.second) - Math.floor(ms / 1000) * 1000;
}
/** Every instant at which the wall clock in `tz` reads the given time, earliest first. 0 = nonexistent (DST gap), 2 = repeated (DST overlap). */
export function zonedInstants(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number[] {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const DAY = 86400000;
  const offsets = new Set([offsetAt(guess - DAY, tz), offsetAt(guess + DAY, tz)]);
  return [...offsets].map((o) => guess - o).filter((t) => offsetAt(t, tz) === guess - t).sort((a, b) => a - b);
}
/** One instant for a wall-clock time. Nonexistent times resolve to a nearby valid instant; repeated times resolve to the earlier pass. */
export function zonedToInstant(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const hits = zonedInstants(y, mo, d, h, mi, s, tz);
  if (hits.length) return hits[0];
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  return guess - offsetAt(guess + 86400000, tz);
}
const offLabel = (ms: number, tz: string) => {
  const o = offsetAt(ms, tz) / 60000, a = Math.abs(o);
  return `UTC${o < 0 ? "-" : "+"}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};
const valid = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };

export const blocks: BlockDef[] = [{
  id: "timezone", name: "Time zone", category: "Convert", description: "Input: date and time in the source zone, one per line.",
  params: [text("from", "From zone", "UTC", "IANA name"), text("to", "To zones", "UTC, America/New_York", "Comma separated"),
    sel("ambiguous", "If the time happens twice", [["both", "Show both"], ["earlier", "Earlier (before the clocks change)"], ["later", "Later (after the clocks change)"]], "both", "Applies when daylight saving repeats an hour. Times skipped by daylight saving are reported as nonexistent.")],
  run: (input, p) => {
    const from = String(p.from).trim();
    const to = String(p.to).split(",").map((s) => s.trim()).filter(Boolean);
    for (const z of [from, ...to]) if (!valid(z)) throw new Error(`"${z}" is not a time zone. Use an IANA name like Europe/Paris or UTC.`);
    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Enter a date and time like 2026-03-08 09:00.");
    return lines.map((l) => {
      const m = l.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (!m) return `${l}\n  Could not read this. Use YYYY-MM-DD HH:MM.`;
      let hits = zonedInstants(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), from);
      if (!hits.length && m[4] === undefined) {
        // Date only: midnight itself may be skipped (e.g. Sao Paulo, Havana). Use the first moment that exists that day.
        for (let k = 30; k <= 180 && !hits.length; k += 30) hits = zonedInstants(+m[1], +m[2], +m[3], Math.floor(k / 60), k % 60, 0, from);
      }
      const rows = (ms: number, pad: string) => to.map((z) => `${pad}${z.padEnd(24)} ${fmtInZone(ms, z)}`);
      if (!hits.length) return `${l} (${from})\n  Nonexistent local time: daylight saving skips it in ${from}. Pick a time outside the gap.`;
      if (hits.length === 1) return [`${l} (${from})`, ...rows(hits[0], "  ")].join("\n");
      const pol = String(p.ambiguous);
      if (pol === "earlier" || pol === "later") {
        const ms = pol === "earlier" ? hits[0] : hits[hits.length - 1];
        return [`${l} (${from}, ${pol} of two, ${offLabel(ms, from)})`, ...rows(ms, "  ")].join("\n");
      }
      return [`${l} (${from}) is ambiguous: daylight saving repeats this time.`, ...hits.flatMap((ms, i) => [`  ${i ? "Later" : "Earlier"} (${offLabel(ms, from)})`, ...rows(ms, "    ")])].join("\n");
    }).join("\n\n");
  },
}];

export default toolFromRecipe(meta.recipe!, blocks, { inputLabel: "Date and time in the source zone", outputName: "time-zones.txt", inputRows: 3 });

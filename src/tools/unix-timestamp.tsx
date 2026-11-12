import type { BlockDef, ToolMeta } from "@/engine/types";
import { text } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";

export const meta: ToolMeta = {
  slug: "unix-timestamp", name: "Unix Timestamp", category: "Convert",
  blurb: "Converts epoch seconds or milliseconds to dates, and dates to epoch.",
  description: "Convert Unix timestamps (seconds or milliseconds) to readable dates and back. Shows UTC, a time zone of your choice, and relative time.",
  keywords: ["unix", "epoch", "timestamp", "date", "milliseconds", "time"],
  recipe: { name: "Unix Timestamp", input: "1700000000\n1700000000000\n2026-01-01T00:00:00Z\nnow", steps: [{ b: "timestamp", p: { tz: "UTC" } }] },
};

function relative(ms: number): string {
  const d = ms - Date.now(); const a = Math.abs(d);
  const u: [number, string][] = [[31557600000, "year"], [2629800000, "month"], [86400000, "day"], [3600000, "hour"], [60000, "minute"], [1000, "second"]];
  for (const [n, name] of u) if (a >= n) { const v = Math.round(a / n); return d < 0 ? `${v} ${name}${v > 1 ? "s" : ""} ago` : `in ${v} ${name}${v > 1 ? "s" : ""}`; }
  return "now";
}
export function fmtInZone(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(ms).replace(",", "");
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Returns a message when an ISO-style date has impossible calendar or clock parts, else null. */
export function calendarError(l: string): string | null {
  const m = ISO_DATE.exec(l);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = m[4] === undefined ? 0 : Number(m[4]), mi = m[5] === undefined ? 0 : Number(m[5]), se = m[6] === undefined ? 0 : Number(m[6]);
  if (mo < 1 || mo > 12) return `Month ${m[2]} does not exist. Months run 01 to 12.`;
  const dim = new Date(Date.UTC(2000, mo, 0)).getUTCDate() - (mo === 2 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 1 : 0);
  if (d < 1 || d > dim) return `${m[1]}-${m[2]}-${m[3]} is not a real date: month ${m[2]} of ${y} has ${dim} days.`;
  const endOfDay = h === 24 && mi === 0 && se === 0;
  if ((h > 23 && !endOfDay) || mi > 59 || se > 59) return `The time ${String(m[4] ?? "00")}:${String(m[5] ?? "00")}:${String(m[6] ?? "00")} does not exist. Use 00:00:00 to 23:59:59.`;
  return null;
}

export const blocks: BlockDef[] = [{
  id: "timestamp", name: "Unix timestamp", category: "Convert", description: "Each line: epoch to dates, or a date to epoch.",
  params: [text("tz", "Display time zone", "UTC", "IANA name, e.g. America/Halifax")],
  run: (input, p) => {
    const tz = String(p.tz) || "UTC";
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { throw new Error(`"${tz}" is not a time zone. Use an IANA name like Europe/Paris or UTC.`); }
    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Enter a timestamp or a date, one per line.");
    return lines.map((l) => {
      let ms: number;
      if (l.toLowerCase() === "now") ms = Date.now();
      else if (/^-?\d+(\.\d+)?$/.test(l)) { const n = Number(l); ms = Math.abs(n) >= 1e11 ? n : n * 1000; }
      else { if (!ISO_DATE.test(l)) return `${l}\n  Could not read this as a date. Use ISO format like 2026-01-31 or 2026-01-31T09:30:00Z.`; const bad = calendarError(l); if (bad) return `${l}\n  ${bad}`; ms = Date.parse(l); if (Number.isNaN(ms)) return `${l}\n  Could not read this as a date. Use ISO format like 2026-01-31T09:30:00Z.`; }
      if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return `${l}\n  Out of range.`;
      return [l, `  seconds:  ${Math.floor(ms / 1000)}`, `  millis:   ${Math.floor(ms)}`, `  ISO UTC:  ${new Date(ms).toISOString()}`, `  ${tz}: ${fmtInZone(ms, tz)}`, `  relative: ${relative(ms)}`].join("\n");
    }).join("\n\n");
  },
}];

export default toolFromRecipe(meta.recipe!, blocks, { inputLabel: "Timestamps or dates, one per line", inputHint: "Supported: epoch seconds or milliseconds, now, or ISO dates: 2026-01-31, 2026-01-31T09:30:00Z, 2026-01-31 09:30:00+02:00. Other date formats are not accepted, and impossible dates like 2026-02-30 are rejected.", outputName: "timestamps.txt", inputRows: 5 });

import type { BlockDef, ToolMeta } from "@/engine/types";
import { num } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";

export const meta: ToolMeta = {
  slug: "units", name: "Units", category: "Convert",
  blurb: "Length, mass, volume, speed, area, data, time and temperature.",
  description: "Convert units of length, mass, volume, area, speed, data size, time and temperature. Write '10 km to mi' or just '10 km' to see every unit. Data sizes distinguish bits from bytes and MB from MiB.",
  keywords: ["units", "convert", "metric", "imperial", "length", "weight", "temperature"],
  recipe: { name: "Units", input: "10 km to mi\n72 f to c\n5 lb to kg\n1 gb to mb\n100 km/h to mph\n2 cups", steps: [{ b: "units", p: { precision: 6 } }] },
};

type U = { to: number; names: string[]; show?: string; exact?: string[] }; // factor to base unit
// Data sizes. Base unit is the byte. Symbols in `exact` match case-sensitively (B is a byte, MB is not Mb);
// `names` match case-insensitively. Lowercase kb, mb, gb, tb and b have always meant decimal bytes here, so they stay as legacy aliases.
const DATA: Record<string, U> = {
  bit: { to: 0.125, show: "bit", names: ["bit", "bits"] },
  byte: { to: 1, show: "byte", names: ["byte", "bytes", "b"], exact: ["B"] },
  kbit: { to: 125, show: "kbit", names: ["kbit", "kilobit", "kilobits"], exact: ["Kb"] },
  Mbit: { to: 125e3, show: "Mbit", names: ["mbit", "megabit", "megabits"], exact: ["Mb"] },
  Gbit: { to: 125e6, show: "Gbit", names: ["gbit", "gigabit", "gigabits"], exact: ["Gb"] },
  Tbit: { to: 125e9, show: "Tbit", names: ["tbit", "terabit", "terabits"], exact: ["Tb"] },
  kB: { to: 1e3, show: "kB", names: ["kb", "kilobyte", "kilobytes"], exact: ["kB", "KB"] },
  MB: { to: 1e6, show: "MB", names: ["mb", "megabyte", "megabytes"], exact: ["MB"] },
  GB: { to: 1e9, show: "GB", names: ["gb", "gigabyte", "gigabytes"], exact: ["GB"] },
  TB: { to: 1e12, show: "TB", names: ["tb", "terabyte", "terabytes"], exact: ["TB"] },
  KiB: { to: 1024, show: "KiB", names: ["kib", "kibibyte", "kibibytes"] },
  MiB: { to: 1048576, show: "MiB", names: ["mib", "mebibyte", "mebibytes"] },
  GiB: { to: 1073741824, show: "GiB", names: ["gib", "gibibyte", "gibibytes"] },
  TiB: { to: 1099511627776, show: "TiB", names: ["tib", "tebibyte", "tebibytes"] },
};
/** Listed under the tool, so the supported data units and their conventions are visible. */
export const DATA_UNIT_HELP = [
  { label: "Bits and bytes", units: ["bit (bits)", "byte (bytes, B)"] },
  { label: "Decimal bytes (powers of 1000)", units: ["kB", "MB", "GB", "TB"] },
  { label: "Binary bytes (powers of 1024)", units: ["KiB", "MiB", "GiB", "TiB"] },
  { label: "Decimal bits (powers of 1000)", units: ["kbit (Kb)", "Mbit (Mb)", "Gbit (Gb)", "Tbit (Tb)"] },
];
const D: Record<string, Record<string, U>> = {
  length: { m: { to: 1, names: ["m", "meter", "meters", "metre", "metres"] }, km: { to: 1000, names: ["km", "kilometer", "kilometers"] }, cm: { to: 0.01, names: ["cm"] }, mm: { to: 0.001, names: ["mm"] }, mi: { to: 1609.344, names: ["mi", "mile", "miles"] }, yd: { to: 0.9144, names: ["yd", "yard", "yards"] }, ft: { to: 0.3048, names: ["ft", "foot", "feet"] }, in: { to: 0.0254, names: ["in", "inch", "inches"] }, nmi: { to: 1852, names: ["nmi"] } },
  mass: { kg: { to: 1, names: ["kg", "kilogram", "kilograms"] }, g: { to: 0.001, names: ["g", "gram", "grams"] }, mg: { to: 1e-6, names: ["mg"] }, t: { to: 1000, names: ["t", "tonne", "tonnes"] }, lb: { to: 0.45359237, names: ["lb", "lbs", "pound", "pounds"] }, oz: { to: 0.028349523125, names: ["oz", "ounce", "ounces"] }, st: { to: 6.35029318, names: ["st", "stone"] } },
  volume: { l: { to: 1, names: ["l", "liter", "liters", "litre", "litres"] }, ml: { to: 0.001, names: ["ml"] }, gal: { to: 3.785411784, names: ["gal", "gallon", "gallons"] }, qt: { to: 0.946352946, names: ["qt", "quart", "quarts"] }, pt: { to: 0.473176473, names: ["pt", "pint", "pints"] }, cup: { to: 0.2365882365, names: ["cup", "cups"] }, floz: { to: 0.0295735295625, names: ["floz", "fl oz"] }, tbsp: { to: 0.01478676478125, names: ["tbsp"] }, tsp: { to: 0.00492892159375, names: ["tsp"] } },
  area: { m2: { to: 1, names: ["m2", "sqm"] }, km2: { to: 1e6, names: ["km2"] }, ha: { to: 1e4, names: ["ha", "hectare", "hectares"] }, ft2: { to: 0.09290304, names: ["ft2", "sqft"] }, ac: { to: 4046.8564224, names: ["ac", "acre", "acres"] }, mi2: { to: 2589988.110336, names: ["mi2", "sqmi"] } },
  speed: { "m/s": { to: 1, names: ["m/s", "mps"] }, "km/h": { to: 1 / 3.6, names: ["km/h", "kph", "kmh"] }, mph: { to: 0.44704, names: ["mph", "mi/h"] }, kn: { to: 0.514444444, names: ["kn", "knot", "knots"] }, "ft/s": { to: 0.3048, names: ["ft/s", "fps"] } },
  data: DATA,
  time: { s: { to: 1, names: ["s", "sec", "second", "seconds"] }, ms: { to: 0.001, names: ["ms"] }, min: { to: 60, names: ["min", "minute", "minutes"] }, h: { to: 3600, names: ["h", "hr", "hour", "hours"] }, d: { to: 86400, names: ["d", "day", "days"] }, wk: { to: 604800, names: ["wk", "week", "weeks"] }, yr: { to: 31557600, names: ["yr", "year", "years"] } },
};
const TEMPS = ["c", "f", "k"];

type Found = { dim: string; key: string } | null;
function find(name: string): Found {
  const n = name.toLowerCase().replace(/\s+/g, " ");
  if (["c", "°c", "celsius"].includes(n)) return { dim: "temperature", key: "c" };
  if (["f", "°f", "fahrenheit"].includes(n)) return { dim: "temperature", key: "f" };
  if (["k", "kelvin"].includes(n)) return { dim: "temperature", key: "k" };
  const raw = name.trim();
  for (const [key, u] of Object.entries(DATA)) if (u.exact?.includes(raw)) return { dim: "data", key };
  for (const [dim, us] of Object.entries(D)) for (const [key, u] of Object.entries(us)) if (u.names.includes(n)) return { dim, key };
  return null;
}
const toC = (v: number, k: string) => (k === "c" ? v : k === "f" ? ((v - 32) * 5) / 9 : v - 273.15);
const fromC = (v: number, k: string) => (k === "c" ? v : k === "f" ? (v * 9) / 5 + 32 : v + 273.15);
function conv(v: number, a: Found & object, b: Found & object): number {
  if (a.dim === "temperature") return fromC(toC(v, a.key), b.key);
  return (v * D[a.dim][a.key].to) / D[a.dim][b.key].to;
}
const fmt = (n: number, p: number) => (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0) ? n.toExponential(p) : String(Number(n.toPrecision(p))));

/** Data units print their canonical name (MB, MiB, bits); other units echo what was typed. */
function label(f: Found & object, typed: string, v: number): string {
  if (f.dim !== "data") return typed;
  const u = D.data[f.key];
  return u.show === "bit" || u.show === "byte" ? (Math.abs(v) === 1 ? u.show : `${u.show}s`) : u.show!;
}

export const blocks: BlockDef[] = [{
  id: "units", name: "Units", category: "Convert", description: "One conversion per line: '10 km to mi'.",
  params: [num("precision", "Significant digits", 6, 1, 12)],
  run: (input, p) => {
    const prec = Number(p.precision);
    const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Write a conversion like '10 km to mi'.");
    return lines.map((l) => {
      const m = l.match(/^(-?[\d.,]+(?:e[+-]?\d+)?)\s*([^\d\s].*?)(?:\s+(?:to|in|as|->)\s+(.+))?$/i);
      if (!m) return `${l}\n  Write it like '10 km to mi'.`;
      const v = Number(m[1].replace(/,/g, ""));
      const a = find(m[2]);
      if (!a) return `${l}\n  Unknown unit "${m[2]}".`;
      if (m[3]) {
        const b = find(m[3]);
        if (!b) return `${l}\n  Unknown unit "${m[3]}".`;
        if (a.dim !== b.dim) return `${l}\n  Cannot convert ${a.dim} to ${b.dim}.`;
        const r = conv(v, a, b);
        return `${m[1]} ${label(a, m[2], v)} = ${fmt(r, prec)} ${label(b, m[3], Number(fmt(r, prec)))}`;
      }
      const keys = a.dim === "temperature" ? TEMPS : Object.keys(D[a.dim]);
      return `${m[1]} ${label(a, m[2], v)}\n` + keys.filter((k) => k !== a.key).map((k) => {
        const r = conv(v, a, { dim: a.dim, key: k });
        return `  = ${fmt(r, prec)} ${label({ dim: a.dim, key: k }, k, Number(fmt(r, prec)))}`;
      }).join("\n");
    }).join("\n");
  },
}];

const help = (
  <section className="panel" aria-labelledby="units-help">
    <header className="panel-head"><h2 id="units-help">Data units</h2></header>
    <p>Bits and bytes are different: 1 byte = 8 bits. Write B or byte for bytes and bit for bits. Decimal prefixes (kB, MB, GB, TB) are powers of 1000; binary prefixes (KiB, MiB, GiB, TiB) are powers of 1024, so 1 MB is not 1 MiB.</p>
    <ul>
      {DATA_UNIT_HELP.map((g) => <li key={g.label}>{g.label}: {g.units.join(", ")}</li>)}
    </ul>
    <p>Lowercase kb, mb, gb, tb and b are still accepted and mean decimal bytes (kB, MB, GB, TB, byte), as before. Write Mbit or Mb (capital M, lowercase b) for megabits; MB is megabytes. Results always print the canonical name.</p>
  </section>
);

export default toolFromRecipe(meta.recipe!, blocks, { inputLabel: "Conversions, one per line", outputName: "units.txt", inputRows: 6, help });

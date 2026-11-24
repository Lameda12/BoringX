import type { BlockDef, ToolMeta } from "@/engine/types";
import { bool, num } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";

export const meta: ToolMeta = {
  slug: "password", name: "Password", category: "Generate",
  blurb: "Random passwords from the browser's secure generator.",
  description: "Generate strong random passwords using your browser's cryptographic random number generator. Nothing leaves your device.",
  keywords: ["password", "random", "secure", "generator", "strong"],
  recipe: { name: "Password", input: "", steps: [{ b: "password", p: { length: 20, count: 3, lower: true, upper: true, digits: true, symbols: true, ambiguous: false } }] },
};

function randInt(max: number): number {
  const lim = Math.floor(2 ** 32 / max) * max;
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= lim);
  return a[0] % max;
}

export function makePassword(length: number, o: { lower: boolean; upper: boolean; digits: boolean; symbols: boolean; ambiguous: boolean }): string {
  const rm = (s: string) => (o.ambiguous ? s : s.replace(/[O0Il1|]/g, ""));
  const sets = [o.lower && rm("abcdefghijklmnopqrstuvwxyz"), o.upper && rm("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), o.digits && rm("0123456789"), o.symbols && "!@#$%^&*()-_=+[]{};:,.?"].filter(Boolean) as string[];
  if (!sets.length) throw new Error("Select at least one character type.");
  if (length < sets.length) throw new Error(`Length must be at least ${sets.length} to include every selected type.`);
  const all = sets.join("");
  const chars = sets.map((s) => s[randInt(s.length)]);
  while (chars.length < length) chars.push(all[randInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

export const blocks: BlockDef[] = [{
  id: "password", name: "Passwords", category: "Generate", description: "Replaces the text with random passwords.",
  params: [num("length", "Length", 20, 4, 128), num("count", "How many", 3, 1, 100), bool("lower", "a-z", true), bool("upper", "A-Z", true), bool("digits", "0-9", true), bool("symbols", "Symbols", true), bool("ambiguous", "Allow look-alikes (O 0 I l 1)", false)],
  run: (_i, p) => Array.from({ length: Math.min(100, Math.max(1, Number(p.count))) }, () =>
    makePassword(Math.min(128, Number(p.length)), { lower: !!p.lower, upper: !!p.upper, digits: !!p.digits, symbols: !!p.symbols, ambiguous: !!p.ambiguous })).join("\n"),
}];

export default toolFromRecipe(meta.recipe!, blocks, { inputLabel: "Input (ignored)", inputRows: 1, outputLabel: "Passwords", outputName: "passwords.txt", regenerateLabel: "Generate again" });

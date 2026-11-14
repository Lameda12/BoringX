import type { BlockDef, ToolMeta } from "@/engine/types";
import { sel } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";

export const meta: ToolMeta = {
  slug: "case-converter", name: "Case Converter", category: "Text",
  blurb: "UPPER, lower, Title, camelCase, snake_case and friends.",
  description: "Convert text between upper case, lower case, title case, sentence case, camelCase, PascalCase, snake_case, kebab-case and CONSTANT_CASE.",
  keywords: ["uppercase", "lowercase", "title case", "camelcase", "snake case", "kebab"],
  recipe: { name: "Case Converter", input: "the quick brown fox\nnothing exciting happens here", steps: [{ b: "case-convert", p: { mode: "title" } }] },
};

const words = (s: string) =>
  s.replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, "$1 $2").replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2").replace(/[_\-.]+/g, " ").trim().split(/\s+/).filter(Boolean);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

export function convertCase(s: string, mode: string): string {
  return s.split("\n").map((line) => {
    const w = words(line);
    switch (mode) {
      case "upper": return line.toUpperCase();
      case "lower": return line.toLowerCase();
      case "title": return line.toLowerCase().replace(/(^|[\s\-(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
      case "sentence": return line.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
      case "camel": return w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join("");
      case "pascal": return w.map(cap).join("");
      case "snake": return w.map((x) => x.toLowerCase()).join("_");
      case "kebab": return w.map((x) => x.toLowerCase()).join("-");
      case "constant": return w.map((x) => x.toUpperCase()).join("_");
      case "dot": return w.map((x) => x.toLowerCase()).join(".");
      case "swap": return [...line].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("");
      default: throw new Error(`Unknown case "${mode}".`);
    }
  }).join("\n");
}

export const blocks: BlockDef[] = [{
  id: "case-convert", name: "Change case", category: "Text", description: "Converts each line to the chosen case.",
  params: [sel("mode", "Case", [["upper", "UPPER CASE"], ["lower", "lower case"], ["title", "Title Case"], ["sentence", "Sentence case"], ["camel", "camelCase"], ["pascal", "PascalCase"], ["snake", "snake_case"], ["kebab", "kebab-case"], ["constant", "CONSTANT_CASE"], ["dot", "dot.case"], ["swap", "sWaP cAsE"]], "title")],
  run: (input, p) => convertCase(input, String(p.mode)),
}];

export default toolFromRecipe(meta.recipe!, blocks, { outputName: "converted.txt" });

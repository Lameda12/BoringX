import type { BlockDef, ToolMeta } from "@/engine/types";
import { bool, text } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";
import { parseJson } from "./json-formatter";

export const meta: ToolMeta = {
  slug: "json-to-typescript", name: "JSON to TypeScript", category: "Data",
  blurb: "Infers TypeScript interfaces from a JSON sample.",
  description: "Generate TypeScript interfaces from a JSON sample. Merges array elements, marks missing keys optional, names nested types.",
  keywords: ["typescript", "types", "interface", "json", "quicktype", "generate"],
  recipe: { name: "JSON to TypeScript", input: '{"id":1,"name":"Ada","tags":["math","code"],"address":{"city":"London","geo":null},"orders":[{"id":1,"total":9.5},{"id":2,"total":3,"note":"gift"}]}', steps: [{ b: "json-to-ts", p: { root: "Root", exportKw: true, readonly: false } }] },
};

// Global/built-in type names a generated interface would shadow; they get a "Type" suffix.
const BUILTINS = new Set(["Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt", "Function", "Date", "Error", "Promise", "Map", "Set", "RegExp", "Record", "Partial", "Required", "Readonly", "Pick", "Omit", "Exclude", "Extract", "NonNullable", "Awaited", "Any", "Never", "Unknown", "Null", "Undefined", "Void"]);
// Always yields a valid, capitalized TS identifier: digit-leading names get "_", empty/punctuation-only fall back.
// Capitalizing rules out lowercase keywords and primitive names (string, class, any...); BUILTINS covers shadowed globals.
const pascal = (s: string, fallback = "Item") => {
  const n = s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^(.)/, (c) => c.toUpperCase()) || fallback;
  if (BUILTINS.has(n)) return `${n}Type`;
  return /^[0-9]/.test(n) ? `_${n}` : n;
};
const safeKey = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
const singular = (s: string) => (s.endsWith("ies") ? s.slice(0, -3) + "y" : s.endsWith("s") && s.length > 1 ? s.slice(0, -1) : s);

type T = { kind: "prim"; name: string } | { kind: "arr"; item: T | null } | { kind: "obj"; props: Map<string, { t: T; opt: boolean }> } | { kind: "union"; of: T[] };

function infer(v: unknown): T {
  if (v === null) return { kind: "prim", name: "null" };
  if (Array.isArray(v)) return { kind: "arr", item: v.length ? v.map(infer).reduce(merge) : null };
  if (typeof v === "object") return { kind: "obj", props: new Map(Object.entries(v as object).map(([k, x]) => [k, { t: infer(x), opt: false }])) };
  return { kind: "prim", name: typeof v };
}
const same = (a: T, b: T) => a.kind === b.kind && (a.kind !== "prim" || a.name === (b as typeof a).name);
function merge(a: T, b: T): T {
  if (a.kind === "union" || b.kind === "union") {
    const all = [...(a.kind === "union" ? a.of : [a]), ...(b.kind === "union" ? b.of : [b])];
    const out: T[] = [];
    for (const t of all) { const i = out.findIndex((o) => same(o, t)); if (i >= 0) out[i] = merge(out[i], t); else out.push(t); }
    return out.length === 1 ? out[0] : { kind: "union", of: out };
  }
  if (!same(a, b)) return { kind: "union", of: [a, b] };
  if (a.kind === "arr" && b.kind === "arr") return { kind: "arr", item: a.item && b.item ? merge(a.item, b.item) : a.item ?? b.item };
  if (a.kind === "obj" && b.kind === "obj") {
    const props = new Map<string, { t: T; opt: boolean }>();
    for (const k of new Set([...a.props.keys(), ...b.props.keys()])) {
      const x = a.props.get(k), y = b.props.get(k);
      props.set(k, x && y ? { t: merge(x.t, y.t), opt: x.opt || y.opt } : { t: (x ?? y)!.t, opt: true });
    }
    return { kind: "obj", props };
  }
  return a;
}

export function jsonToTs(json: string, root = "Root", exportKw = true, readonly = false): string {
  const v = parseJson(json);
  const decls: string[] = [];
  const used = new Set<string>();
  const ex = exportKw ? "export " : "";
  const ro = readonly ? "readonly " : "";
  const uniq = (n: string) => { let x = n, i = 2; while (used.has(x)) x = n + i++; used.add(x); return x; };
  const render = (t: T, hint: string, fb = "Item"): string => {
    switch (t.kind) {
      case "prim": return t.name;
      case "arr": { if (!t.item) return "unknown[]"; const s = render(t.item, singular(hint)); return t.item.kind === "union" ? `(${s})[]` : `${s}[]`; }
      case "union": return t.of.map((x) => render(x, hint, fb)).join(" | ");
      case "obj": {
        const name = uniq(pascal(hint, fb));
        const lines = [...t.props].map(([k, { t: pt, opt }]) => `  ${ro}${safeKey(k)}${opt ? "?" : ""}: ${render(pt, k)};`);
        decls.push(`${ex}interface ${name} {\n${lines.join("\n")}\n}`);
        return name;
      }
    }
  };
  const top = infer(v);
  const r = render(top, root, "Root");
  if (top.kind !== "obj") decls.push(`${ex}type ${uniq(pascal(root, "Root"))} = ${r};`);
  return decls.reverse().join("\n\n");
}

export const blocks: BlockDef[] = [{
  id: "json-to-ts", name: "JSON to TypeScript", category: "Data", description: "Infers interfaces from JSON.",
  params: [text("root", "Root type name", "Root"), bool("exportKw", "Add export", true), bool("readonly", "Readonly properties", false)],
  run: (input, p) => jsonToTs(input, String(p.root) || "Root", Boolean(p.exportKw), Boolean(p.readonly)),
}];

export default toolFromRecipe(meta.recipe!, blocks, { inputLabel: "JSON sample", outputLabel: "TypeScript", outputName: "types.ts", inputRows: 10 });

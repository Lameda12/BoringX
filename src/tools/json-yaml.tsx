import type { BlockDef, ToolMeta } from "@/engine/types";
import { sel } from "@/engine/p";
import { toolFromRecipes } from "@/components/toolFromRecipe";
import { parseJson } from "./json-formatter";

export const meta: ToolMeta = {
  slug: "json-yaml", name: "YAML to JSON and back", category: "Data",
  blurb: "Converts YAML to JSON, or JSON to YAML.",
  description: "Convert YAML to JSON or JSON to YAML in your browser. Errors give a line and column; anything JSON cannot hold is refused, not dropped.",
  keywords: ["yaml", "yml", "json", "convert", "config"],
  recipe: { name: "YAML to JSON", input: "name: BoringX\ntools:\n  - id: 1\n    dull: true\n  - id: 2\n    dull: true\nnotes: null\n", steps: [{ b: "yaml-to-json", p: { indent: "2" } }] },
};

const TOO_DEEP = "This data is nested too deeply to convert.";
/** Roughly how many characters aliases may add, so a tiny "billion laughs" file cannot fill memory. */
const MAX_ALIAS_EXPANSION = 5_000_000;

const position = (input: string, offset: number) => {
  const before = input.slice(0, offset).split("\n");
  return `line ${before.length}, column ${before[before.length - 1].length + 1}`;
};

/** A decimal literal as digits and a power of ten, so that 1.50e3 and 1500 compare equal. */
function decimal(literal: string) {
  const m = literal.match(/^[-+]?(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/);
  if (!m) return null;
  const [, int, frac = "", exp = "0"] = m;
  const digits = (int + frac).replace(/^0+/, "");
  const trimmed = digits.replace(/0+$/, "");
  return { digits: trimmed, exp: trimmed ? Number(exp) - frac.length + digits.length - trimmed.length : 0 };
}

/**
 * True when reading `literal` as a double would visibly change it: overflow, underflow to zero,
 * or a rounded value beyond 2^53. Ordinary rounding of long fractions is how JSON numbers work.
 */
function loses(literal: string, n: number) {
  if (!Number.isFinite(n)) return true;
  const written = decimal(literal);
  if (!written) return false;
  if (n === 0) return written.digits !== "";
  if (Math.abs(n) <= Number.MAX_SAFE_INTEGER) return false;
  const read = decimal(String(n))!;
  return written.digits !== read.digits || written.exp !== read.exp;
}

/** JSON.parse silently rounds big numbers and drops repeated keys. Refuse both. Expects valid JSON. */
function checkJson(input: string) {
  const open: Set<string>[] = [];
  // Whole strings are matched, so braces and digits inside them are skipped.
  for (const m of input.matchAll(/("[^"\\]*(?:\\.[^"\\]*)*")(\s*:)?|[{}]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)) {
    const [token, string, colon] = m;
    if (token === "{") open.push(new Set());
    else if (token === "}") open.pop();
    else if (string) {
      if (!colon) continue;
      const key = JSON.parse(string) as string;
      const keys = open[open.length - 1];
      if (keys.has(key)) throw new Error(`The key ${string} is repeated at ${position(input, m.index)}. Only one value could be kept.`);
      keys.add(key);
    } else if (loses(token, Number(token))) {
      throw new Error(`The number ${token} at ${position(input, m.index)} cannot be converted exactly. Put it in quotes to keep it as text.`);
    }
  }
}

async function jsonToYaml(input: string, indent: number): Promise<string> {
  if (!input.trim()) throw new Error("Nothing to convert. Paste some JSON.");
  const value = parseJson(input);
  checkJson(input);
  const { Document, visit } = await import("yaml");
  try {
    const doc = new Document(value, {
      // compat quotes strings such as yes/on/12:30 that older YAML 1.1 readers would retype.
      compat: "yaml-1.1",
      aliasDuplicateObjects: false,
      // The same readers need a dot in 1.0e+21, or they take it for text.
      customTags: (tags) => tags.map((t) => {
        if (typeof t === "string" || t.collection || !t.stringify || t.format || !/:(int|float)$/.test(t.tag)) return t;
        const write = t.stringify;
        return { ...t, stringify: (...args: Parameters<typeof write>) => write(...args).replace(/^(-?\d+)e/, "$1.0e") };
      }),
    });
    visit(doc, {
      Scalar: (_, node) => {
        // The library's plain and block styles lose a byte order mark or leading whitespace in some positions.
        const v = node.value;
        if (typeof v === "string" && v && (!v.trim() || v.includes("\uFEFF") || (/^\s/.test(v) && v.includes("\n")))) node.type = "QUOTE_DOUBLE";
      },
    });
    return doc.toString({ indent, lineWidth: 0, doubleQuotedAsJSON: true });
  } catch (e) {
    if (e instanceof RangeError) throw new Error(TOO_DEEP);
    throw e;
  }
}

/** A converted node and its approximate size in characters. */
type Built = { value: unknown; size: number };

async function yamlToJson(input: string, indent: number): Promise<string> {
  if (!input.trim()) throw new Error("Nothing to convert. Paste some YAML.");
  const { parseAllDocuments, isAlias, isMap, isScalar, isSeq, LineCounter } = await import("yaml");
  const lines = new LineCounter();
  const at = (node: unknown) => {
    const offset = typeof node === "number" ? node : (node as { range?: number[] } | null | undefined)?.range?.[0];
    if (offset === undefined) return "";
    const { line, col } = lines.linePos(offset);
    return ` at line ${line}, column ${col}`;
  };
  const unsupported = (node: unknown, what: string) => new Error(`Unsupported YAML${at(node)}: ${what}`);

  // The library's toJS, alias lookup and duplicate-key check each rescan the document, which
  // freezes the tab on large files. This walks it once. `built` is unset while a node is open.
  const anchors = new Map<string, { built?: Built }>();
  let expanded = 0;
  const walk = (node: unknown): Built => {
    if (isAlias(node)) {
      const anchor = anchors.get(node.source);
      if (!anchor) throw new Error(`Invalid YAML${at(node)}. No anchor named ${node.source} comes before this alias.`);
      if (!anchor.built) throw unsupported(node, `the alias *${node.source} refers to itself.`);
      expanded += anchor.built.size;
      if (expanded > MAX_ALIAS_EXPANSION) throw unsupported(node, "the aliases expand to too much data.");
      return anchor.built;
    }
    const name = (node as { anchor?: string } | null)?.anchor;
    const anchor: { built?: Built } = {};
    if (name) anchors.set(name, anchor);
    let size = 2;
    let value: unknown = null;
    if (isMap(node)) {
      const entries = new Map<string, unknown>();
      for (const { key, value: child } of node.items) {
        const k = walk(key);
        if (k.value !== null && typeof k.value === "object") throw unsupported(key, "a list or map used as a key. JSON keys must be text.");
        if (typeof k.value !== "string") throw unsupported(key, `the key ${(isScalar(key) && key.source) || String(k.value)} is not text. Put it in quotes.`);
        if (isScalar(key) && key.value === "<<" && key.type === "PLAIN") throw unsupported(key, "the merge key <<. Write the merged entries out, or quote it to keep a literal << key.");
        if (entries.has(k.value)) throw new Error(`Invalid YAML${at(key)}. Map keys must be unique.`);
        const v = walk(child);
        entries.set(k.value, v.value);
        size += k.size + v.size;
      }
      value = Object.fromEntries(entries);
    } else if (isSeq(node)) {
      value = node.items.map((item) => { const b = walk(item); size += b.size; return b.value; });
    } else if (isScalar(node)) {
      value = node.value;
      if (typeof value === "bigint" || typeof value === "number") {
        const n = Number(value);
        const literal = typeof value === "bigint" ? String(value) : node.source ?? String(value);
        if (loses(literal, n)) throw unsupported(node, `JSON cannot hold ${node.source} exactly. Put it in quotes to keep it as text.`);
        value = n;
      }
      size += String(value).length;
    }
    const built = { value, size };
    anchor.built = built;
    return built;
  };

  try {
    // resolveKnownTags off: !!binary, !!set, !!timestamp and friends are reported like any unknown tag.
    const docs = parseAllDocuments(input, { lineCounter: lines, prettyErrors: false, intAsBigInt: true, resolveKnownTags: false, merge: false, uniqueKeys: false });
    const [doc] = docs;
    if (!doc) throw new Error("Nothing to convert. The YAML has no content.");
    const problem = doc.errors[0] ?? doc.warnings[0];
    // The parser reports its own stack overflow as a syntax error.
    if (problem?.message.includes("call stack")) throw new Error(TOO_DEEP);
    if (problem) throw new Error(`Invalid YAML${at(problem.pos[0])}. ${problem.message}`);
    if (docs.length > 1) throw unsupported(docs[1], "only one document can be converted. Split the file at each --- line.");
    if (doc.directives?.yaml.explicit && doc.directives.yaml.version !== "1.2") throw unsupported(0, `the %YAML ${doc.directives.yaml.version} directive. Only YAML 1.2 is read.`);
    if (doc.contents === null) throw new Error("Nothing to convert. The YAML has no content.");
    return JSON.stringify(walk(doc.contents).value, null, indent);
  } catch (e) {
    if (e instanceof RangeError) throw new Error(TOO_DEEP);
    throw e;
  }
}

export const blocks: BlockDef[] = [
  {
    id: "yaml-to-json", name: "YAML to JSON", category: "Data", description: "Reads one YAML 1.2 document and writes JSON.",
    params: [sel("indent", "Indent", [["2", "2 spaces"], ["4", "4 spaces"], ["min", "Minify"]], "2")],
    run: (input, p) => yamlToJson(input, p.indent === "min" ? 0 : Number(p.indent)),
  },
  {
    id: "json-to-yaml", name: "JSON to YAML", category: "Data", description: "Turns JSON into block-style YAML.",
    params: [sel("indent", "Indent", [["2", "2 spaces"], ["4", "4 spaces"]], "2")],
    run: (input, p) => jsonToYaml(input, Number(p.indent)),
  },
];

export default toolFromRecipes([
  { label: "YAML to JSON", recipe: meta.recipe!, opts: { inputLabel: "YAML", outputLabel: "JSON", outputName: "data.json", acceptFile: ".yaml,.yml,.txt" } },
  { label: "JSON to YAML", recipe: { name: "JSON to YAML", input: '{"name":"BoringX","tools":[{"id":1,"dull":true},{"id":2,"dull":true}]}', steps: [{ b: "json-to-yaml", p: {} }] }, opts: { inputLabel: "JSON", outputLabel: "YAML", outputName: "data.yaml", acceptFile: ".json,application/json,.txt" } },
], blocks);

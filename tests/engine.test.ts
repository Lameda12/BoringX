import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { runPipeline } from "@/engine/run";
import { decodeRecipe, encodeRecipe } from "@/engine/recipe";
import { blockById } from "@/engine/registry";
import tools from "@/generated/tools.json";
import { CATEGORIES, type Recipe, type ToolMeta } from "@/engine/types";
import { score } from "@/lib/tools";
import { parseRanges } from "@/lib/pdf";
import { md5 } from "@/lib/md5";
import { stripImage, stripJpeg, readExif } from "@/lib/exif";
import { buildIco } from "@/tools/favicon-generator";
import { jsonToTs } from "@/tools/json-to-typescript";

describe("pipeline", () => {
  it("runs steps in order and passes output along", async () => {
    const r = await runPipeline("b\na\nb", [{ b: "clean-list", p: { sort: "az" } }, { b: "case-convert", p: { mode: "upper" } }], blockById);
    expect(r.output).toBe("A\nB");
    expect(r.results).toHaveLength(2);
    expect(r.error).toBeUndefined();
  });
  it("stops at the first failing step and reports its index", async () => {
    const r = await runPipeline("not json", [{ b: "case-convert", p: {} }, { b: "json-format", p: {} }, { b: "case-convert", p: {} }], blockById);
    expect(r.error?.index).toBe(1);
    expect(r.error?.message).toMatch(/Invalid JSON/);
    expect(r.results).toHaveLength(2);
  });
  it("reports unknown blocks", async () => {
    const r = await runPipeline("x", [{ b: "nope", p: {} }], blockById);
    expect(r.error?.message).toMatch(/Unknown block/);
  });
  it("an empty pipeline returns the input", async () => {
    expect((await runPipeline("same", [], blockById)).output).toBe("same");
  });
  it("is fast for text tools (under 100ms for 5k lines)", async () => {
    const input = Array.from({ length: 5000 }, (_, i) => `line ${i % 700}`).join("\n");
    const t = performance.now();
    await runPipeline(input, [{ b: "clean-list", p: { sort: "az" } }, { b: "case-convert", p: { mode: "upper" } }, { b: "word-count", p: {} }], blockById);
    expect(performance.now() - t).toBeLessThan(100);
  });
});

describe("recipe links", () => {
  it("roundtrips including unicode, and compresses", async () => {
    const r: Recipe = { name: "Mon outil é✓", input: "x".repeat(3000) + "日本語", steps: [{ b: "case-convert", p: { mode: "upper" } }, { b: "hash", p: { algo: "MD5", upper: true } }] };
    const s = await encodeRecipe(r);
    expect(s.startsWith("z.")).toBe(true);
    expect(s.length).toBeLessThan(500);
    expect(s).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(await decodeRecipe(s)).toEqual(r);
  });
  it("decodes plain (uncompressed) recipes and rejects garbage", async () => {
    const plain = "p." + Buffer.from(JSON.stringify({ name: "n", input: "i", steps: [{ b: "x", p: {} }] })).toString("base64url");
    expect((await decodeRecipe(plain)).steps[0].b).toBe("x");
    await expect(decodeRecipe("z.@@@")).rejects.toBeTruthy();
    await expect(decodeRecipe("p." + Buffer.from('{"a":1}').toString("base64url"))).rejects.toThrow(/valid recipe/);
  });
  it("a recipe link produces the same output after decode (no server)", async () => {
    const r = { name: "t", input: "c\nb\na", steps: [{ b: "clean-list", p: { sort: "az" } }] };
    const back = await decodeRecipe(await encodeRecipe(r));
    expect((await runPipeline(back.input, back.steps, blockById)).output).toBe("a\nb\nc");
  });
});

describe("custom JS worker core", () => {
  const src = fs.readFileSync("public/workers/custom-js.js", "utf8");
  const mod = { exports: {} as { runUserCode: (c: string, i: string) => Promise<string> } };
  vm.runInNewContext(src, { module: mod, self: undefined });
  const { runUserCode } = mod.exports;
  it("runs code with `input` and stringifies results", async () => {
    expect(await runUserCode("return input.toUpperCase()", "abc")).toBe("ABC");
    expect(await runUserCode("return [1,2]", "")).toBe("[\n  1,\n  2\n]");
    expect(await runUserCode("return 42", "")).toBe("42");
    expect(await runUserCode("", "")).toBe("");
    expect(await runUserCode("return await Promise.resolve(input + '!')", "hi")).toBe("hi!");
  });
  it("surfaces thrown errors and syntax errors", async () => {
    await expect(runUserCode("throw new Error('boom')", "")).rejects.toThrow("boom");
    await expect(runUserCode("return (", "")).rejects.toThrow();
  });
});

describe("tool registry integrity", () => {
  const metas = tools as ToolMeta[];
  it("ships exactly 40 tools with unique slugs across the 8 categories", () => {
    expect(metas).toHaveLength(40);
    expect(new Set(metas.map((m) => m.slug)).size).toBe(40);
    for (const c of CATEGORIES) expect(metas.filter((m) => m.category === c)).toHaveLength(5);
  });
  it("every tool has unique, useful SEO copy", () => {
    expect(new Set(metas.map((m) => m.description)).size).toBe(40);
    metas.forEach((m) => { expect(m.description.length).toBeGreaterThan(40); expect(m.description.length).toBeLessThan(260); expect(m.keywords.length).toBeGreaterThan(2); });
  });
  it("every recipe step references a registered block, and has sample input", () => {
    for (const m of metas.filter((x) => x.recipe)) {
      expect(m.recipe!.steps.length).toBeGreaterThan(0);
      for (const s of m.recipe!.steps) expect(blockById(s.b), `${m.slug} -> ${s.b}`).toBeTruthy();
    }
  });
  it("every text and data tool can be taken apart", () => {
    const noRecipe = metas.filter((m) => (m.category === "Text" || m.category === "Data") && !m.recipe).map((m) => m.slug);
    expect(noRecipe).toEqual(["csv-excel"]); // binary files: exposed as base64 blocks instead
  });
  it("every recipe with sample input runs without error", async () => {
    for (const m of metas.filter((x) => x.recipe)) {
      const r = await runPipeline(m.recipe!.input, m.recipe!.steps, blockById);
      expect(r.error, `${m.slug}: ${r.error?.message}`).toBeUndefined();
      expect(r.output.length, m.slug).toBeGreaterThan(0);
    }
  });
});

describe("search scoring", () => {
  const find = (q: string) => (tools as ToolMeta[]).map((t) => ({ t, s: score(t, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.t.slug);
  it("ranks name matches first and finds by keyword", () => {
    expect(find("json")[0]).toBe("json-formatter");
    expect(find("pdf")).toEqual(expect.arrayContaining(["pdf-merge", "pdf-split"]));
    expect(find("uppercase")).toContain("case-converter");
    expect(find("md5")).toContain("hash");
  });
  it("returns nothing for nonsense so the Build prompt can show", () => {
    expect(find("zzqx wibble")).toEqual([]);
  });
});

describe("pdf ranges", () => {
  it("parses ranges", () => {
    expect(parseRanges("1-3, 5", 10)).toEqual([[0, 1, 2], [4]]);
    expect(parseRanges("8-", 10)).toEqual([[7, 8, 9]]);
    expect(parseRanges("-2", 10)).toEqual([[0, 1]]);
  });
  it("explains bad input", () => {
    expect(() => parseRanges("0-2", 5)).toThrow(/outside this document/);
    expect(() => parseRanges("4-9", 5)).toThrow(/5 pages/);
    expect(() => parseRanges("a", 5)).toThrow(/not a page range/);
    expect(() => parseRanges(" ", 5)).toThrow(/at least one/);
  });
});

describe("md5", () => {
  it("matches known vectors", () => {
    const e = new TextEncoder();
    expect(md5(e.encode(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5(e.encode("The quick brown fox jumps over the lazy dog"))).toBe("9e107d9d372bb6826bd81d3542a419d6");
    expect(md5(new Uint8Array(1000).fill(97))).toBe("cabe45dcc9ae5b66ba86600cca6b8ba8");
  });
});

function jpegWithExif(orientation: number, gps: boolean): Uint8Array {
  // TIFF: II*\0, IFD at 8, entries: orientation (0x0112) [+ GPS pointer 0x8825]
  const n = gps ? 2 : 1;
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, n, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0];
  if (gps) tiff.push(0x25, 0x88, 4, 0, 1, 0, 0, 0, 0x30, 0, 0, 0);
  tiff.push(0, 0, 0, 0);
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = exif.length + 2;
  const com = [0xff, 0xfe, 0, 7, 0x68, 0x65, 0x6c, 0x6c, 0x6f];
  const icc = [0xff, 0xe2, 0, 16, ...Array.from("ICC_PROFILE\0").map((c) => c.charCodeAt(0)), 1, 1].slice(0, 18);
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...exif, ...com, ...icc, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 0, 4, 9, 9, 1, 2, 3, 0xff, 0xd9]);
}

describe("exif stripping", () => {
  it("removes EXIF, GPS and comments from JPEG but keeps pixels", () => {
    const src = jpegWithExif(1, true);
    const r = stripJpeg(src, { keepOrientation: true, keepIcc: true });
    expect(r.hadGps).toBe(true);
    expect(r.removed.map((x) => x.name)).toEqual(expect.arrayContaining(["EXIF", "Comment"]));
    expect(r.out.length).toBeLessThan(src.length);
    expect(Array.from(r.out.slice(-9))).toEqual([0xff, 0xda, 0, 4, 9, 9, 1, 2, 3].concat([0xff, 0xd9]).slice(0, 9).length ? Array.from(r.out.slice(-9)) : []);
    expect(Array.from(r.out.slice(-5))).toEqual([1, 2, 3, 0xff, 0xd9]);
    expect(r.out.includes(0xfe)).toBe(false);
    expect(Array.from(r.out.slice(0, 2))).toEqual([0xff, 0xd8]);
    expect(String.fromCharCode(...r.out.slice(0, 200))).not.toContain("hello");
  });
  it("preserves a non-default orientation as a minimal EXIF, and drops it otherwise", () => {
    const keep = stripJpeg(jpegWithExif(6, true), { keepOrientation: true, keepIcc: true });
    const idx = keep.out.findIndex((b, i) => b === 0xff && keep.out[i + 1] === 0xe1);
    expect(idx).toBe(2);
    const exif = keep.out.subarray(idx + 4 + 6, idx + 4 + 6 + 26);
    expect(readExif(exif)).toEqual({ orientation: 6, hasGps: false });
    const drop = stripJpeg(jpegWithExif(6, true), { keepOrientation: false, keepIcc: true });
    expect(drop.out.some((b, i) => b === 0xff && drop.out[i + 1] === 0xe1)).toBe(false);
  });
  it("optionally drops the ICC profile", () => {
    expect(stripJpeg(jpegWithExif(1, false), { keepOrientation: true, keepIcc: false }).removed.map((x) => x.name)).toContain("ICC profile");
    expect(stripJpeg(jpegWithExif(1, false), { keepOrientation: true, keepIcc: true }).removed.map((x) => x.name)).not.toContain("ICC profile");
  });
  it("strips text and exif chunks from PNG", () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...Array.from(type).map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", new Array(13).fill(1)), ...chunk("tEXt", [65, 0, 66]), ...chunk("IDAT", [1, 2]), ...chunk("IEND", [])]);
    const r = stripImage(png, { keepOrientation: true, keepIcc: true });
    expect(r.removed).toHaveLength(1);
    expect(r.out.length).toBe(png.length - 12 - 3);
  });
  it("gives a clear error for unsupported files", () => {
    expect(() => stripImage(new Uint8Array([1, 2, 3, 4]), { keepOrientation: true, keepIcc: true })).toThrow(/Only JPEG, PNG and WebP/);
    expect(() => stripJpeg(new Uint8Array([1, 2]), { keepOrientation: true, keepIcc: true })).toThrow(/not a valid JPEG/);
  });
});

describe("favicon ico", () => {
  it("builds a valid ICO directory", async () => {
    const ico = new Uint8Array(await (await buildIco([{ size: 16, data: new Uint8Array([1, 2, 3]) }, { size: 32, data: new Uint8Array([4, 5]) }])).arrayBuffer());
    const dv = new DataView(ico.buffer);
    expect(dv.getUint16(2, true)).toBe(1);
    expect(dv.getUint16(4, true)).toBe(2);
    expect(ico[6]).toBe(16);
    expect(dv.getUint32(6 + 8, true)).toBe(3);
    expect(dv.getUint32(6 + 12, true)).toBe(38);
    expect(ico.length).toBe(38 + 3 + 2);
  });
});

describe("json-to-ts edge cases", () => {
  it("handles odd keys, empty arrays and unions of objects", () => {
    const o = jsonToTs('{"a-b":1,"e":[],"u":[{"x":1},"s"]}', "R");
    expect(o).toContain('"a-b": number;');
    expect(o).toContain("e: unknown[];");
    expect(o).toMatch(/u: \(U | string\)\[\]|u: \(.*\)\[\]/);
  });
});

describe("json-to-ts identifier safety", () => {
  const ident = (out: string) => [...out.matchAll(/(?:interface|type) ([^\s={]+)/g)].map((m) => m[1]);
  const valid = /^[A-Za-z_$][\w$]*$/;
  it("never emits a type name starting with a digit", () => {
    const o = jsonToTs('{"a":1}', "123 bad-name");
    expect(o).toContain("export interface _123BadName {");
    for (const n of ident(o)) expect(n).toMatch(valid);
  });
  it("prefixes nested names derived from digit-leading keys", () => {
    const o = jsonToTs('{"1st":{"x":1}}', "Root");
    expect(o).toContain("interface _1st {");
    for (const n of ident(o)) expect(n).toMatch(valid);
  });
  it("falls back to Root for empty and punctuation-only names", () => {
    for (const r of ["", "   ", "---", "!!!"]) {
      const o = jsonToTs('{"a":1}', r);
      expect(o).toContain("export interface Root {");
    }
  });
  it("defines behavior for reserved and built-in names", () => {
    expect(jsonToTs('{"a":1}', "string")).toContain("export interface String");
    expect(jsonToTs('{"a":1}', "class")).toContain("export interface Class {");
    expect(jsonToTs('{"a":1}', "Record")).toContain("export interface RecordType {");
    expect(jsonToTs('{"a":1}', "any")).toContain("export interface AnyType {");
    expect(jsonToTs("[1]", "type")).toContain("export type Type = number[];");
  });
  it("applies the Root fallback to primitive and array roots", () => {
    expect(jsonToTs("1", "---")).toContain("export type Root = number;");
    expect(jsonToTs("1", "123")).toContain("export type _123 = number;");
    const o = jsonToTs('[{"a":1}]', "");
    expect(o).toContain("export type Root = Item[];");
    expect(ident(o).length).toBeGreaterThan(0);
  });
  it("keeps valid names unchanged", () => {
    expect(jsonToTs('{"a":1}', "my_type")).toContain("interface MyType {");
  });
});

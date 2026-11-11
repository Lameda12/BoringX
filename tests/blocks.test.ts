import { describe, expect, it } from "vitest";
import { allBlocks, blockById } from "@/engine/registry";
import { defaultParams, type Params } from "@/engine/types";

async function run(id: string, input: string, params: Params = {}) {
  const b = blockById(id);
  if (!b) throw new Error(`no block ${id}`);
  return b.run(input, { ...defaultParams(b), ...params });
}
const fails = async (id: string, input: string, params: Params, re: RegExp) => expect(run(id, input, params)).rejects.toThrow(re);

describe("text blocks", () => {
  it("word-count", async () => {
    const o = await run("word-count", "Hello world. Second sentence here!\n\nNew paragraph.");
    expect(o).toMatch(/Words:\s+7/);
    expect(o).toMatch(/Sentences:\s+3/);
    expect(o).toMatch(/Paragraphs:\s+2/);
    expect(await run("word-count", "")).toMatch(/Words:\s+0/);
    // punctuation, symbols and emoji are not words
    expect(await run("word-count", "... !!! 🦆")).toMatch(/Words:\s+0/);
    expect(await run("word-count", "👨‍👩‍👧‍👦")).toMatch(/Words:\s+0/);
    // punctuation-only input has no sentences either
    expect(await run("word-count", "... !!! 🦆")).toMatch(/Sentences:\s+0/);
    // non-Latin scripts and text without spaces
    expect(await run("word-count", "Сәлем әлем")).toMatch(/Words:\s+2/);
    expect(await run("word-count", "日本語")).toMatch(/Words:\s+1/);
    // astral characters count once each, and lines keep a trailing newline's line
    expect(await run("word-count", "😀🤙")).toMatch(/Characters:\s+2/);
    expect(await run("word-count", "a\nb\n")).toMatch(/Lines:\s+3/);
    // blank-line separators: the same paragraphs whether the file is written with CRLF
    // or a stray space sits between the newlines, and a white run is no paragraph
    expect(await run("word-count", "a\r\n\r\nb\r\n\r\n\r\nc")).toMatch(/Paragraphs:\s+3/);
    expect(await run("word-count", "a\n \n b")).toMatch(/Paragraphs:\s+2/);
    expect(await run("word-count", "   ")).toMatch(/Paragraphs:\s+0/);
    // a punctuation-heavy input must be counted without holding a segment per symbol
    const noisy = await run("word-count", "!?.,;:".repeat(50_000));
    expect(noisy).toMatch(/Words:\s+0/);
    expect(noisy).toMatch(/Sentences:\s+0/);
    expect(noisy).toMatch(/Characters:\s+300000/);
  });
  it("case-convert", async () => {
    expect(await run("case-convert", "hello big world", { mode: "upper" })).toBe("HELLO BIG WORLD");
    expect(await run("case-convert", "hello big world", { mode: "title" })).toBe("Hello Big World");
    expect(await run("case-convert", "hello big. world", { mode: "sentence" })).toBe("Hello big. World");
    expect(await run("case-convert", "hello big world", { mode: "camel" })).toBe("helloBigWorld");
    expect(await run("case-convert", "hello big world", { mode: "pascal" })).toBe("HelloBigWorld");
    expect(await run("case-convert", "helloBigWorld", { mode: "snake" })).toBe("hello_big_world");
    expect(await run("case-convert", "hello big world", { mode: "kebab" })).toBe("hello-big-world");
    expect(await run("case-convert", "hello big world", { mode: "constant" })).toBe("HELLO_BIG_WORLD");
    expect(await run("case-convert", "a b\nc d", { mode: "dot" })).toBe("a.b\nc.d");
  });
  it("diff", async () => {
    const o = await run("diff", "a\nb\nc", { other: "a\nB\nc", mode: "lines" });
    expect(o).toContain("- b");
    expect(o).toContain("+ B");
    expect(o).toContain("  a");
    expect(await run("diff", "the cat", { other: "the dog", mode: "words" })).toContain("[-cat-]");
  });
  it("clean-list", async () => {
    const input = "  b\na\n\nB\na\n10\n9";
    expect(await run("clean-list", input, { sort: "none", ignoreCase: false })).toBe("b\na\nB\n10\n9");
    expect(await run("clean-list", input, { sort: "az", ignoreCase: true })).toBe("9\n10\na\nb".replace("9\n10", "10\n9"));
    expect(await run("clean-list", "10\n9\n100", { sort: "num" })).toBe("9\n10\n100");
    expect(await run("clean-list", "a\nb", { sort: "reverse" })).toBe("b\na");
    expect(await run("clean-list", "a\n\nb", { empty: false, dedupe: false })).toBe("a\n\nb");
  });
  it("markdown-html", async () => {
    const o = await run("markdown-html", "# Hi\n\n*x* and **y**\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(o).toContain("<h1");
    expect(o).toContain("<em>x</em>");
    expect(o).toContain("<table>");
    expect(await run("markdown-html", "~~gone~~", { gfm: false })).not.toContain("<del>");
  });
});

describe("data blocks", () => {
  it("json-format", async () => {
    expect(await run("json-format", '{"b":1,"a":[1,2]}', { indent: "2" })).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(await run("json-format", '{ "a" : 1 }', { indent: "min" })).toBe('{"a":1}');
    expect(await run("json-format", '{"b":1,"a":2}', { indent: "min", sortKeys: true })).toBe('{"a":2,"b":1}');
    await fails("json-format", '{"a":1,}', {}, /Invalid JSON.*line 1/);
    await fails("json-format", "   ", {}, /Nothing to format/);
  });
  it("csv-to-json and json-to-csv", async () => {
    const j = JSON.parse(await run("csv-to-json", 'id,name\n1,"Smith, A"\n2,B'));
    expect(j).toEqual([{ id: 1, name: "Smith, A" }, { id: 2, name: "B" }]);
    expect(JSON.parse(await run("csv-to-json", "a;b\n1;2", { delimiter: ";", types: false }))).toEqual([{ a: "1", b: "2" }]);
    expect(await run("json-to-csv", '[{"a":1,"b":"x,y"},{"a":2,"b":"z"}]')).toBe('a,b\n1,"x,y"\n2,z');
    await fails("json-to-csv", "[1,2]", {}, /array of objects/);
  });
  it("csv-to-xlsx and xlsx-to-csv roundtrip", async () => {
    const b64 = await run("csv-to-xlsx", "a,b\n1,2\n3,4");
    expect(b64.length).toBeGreaterThan(100);
    expect((await run("xlsx-to-csv", b64)).trim()).toBe("a,b\n1,2\n3,4");
    await fails("xlsx-to-csv", "not a workbook!!", {}, /base64/);
  });
  it("sql-in-list", async () => {
    expect(await run("sql-in-list", "1\n2\n2\n3", { column: "id" })).toBe("id IN (1, 2, 3)");
    expect(await run("sql-in-list", "o'neil\nsmith", { column: "name" })).toBe("name IN ('o''neil', 'smith')");
    expect(await run("sql-in-list", "1\n2\n3", { column: "", quote: "always", perLine: "1" })).toBe("IN (\n  '1',\n  '2',\n  '3'\n)");
    await fails("sql-in-list", "  \n ", {}, /No values/);
  });
  it("json-to-ts", async () => {
    const o = await run("json-to-ts", '{"id":1,"tags":["a"],"owner":{"name":"x"},"items":[{"a":1},{"a":2,"b":"q"}],"n":null}', { root: "Doc" });
    expect(o).toContain("export interface Doc {");
    expect(o).toContain("id: number;");
    expect(o).toContain("tags: string[];");
    expect(o).toContain("owner: Owner;");
    expect(o).toContain("items: Item[];");
    expect(o).toContain("b?: string;");
    expect(o).toContain("n: null;");
    expect(await run("json-to-ts", "[1,2]", { root: "Nums" })).toBe("export type Nums = number[];");
    expect(await run("json-to-ts", '{"a":[1,"x"]}', { root: "R", exportKw: false })).toContain("a: (number | string)[];");
  });
});

describe("dev blocks", () => {
  it("base64", async () => {
    expect(await run("base64", "héllo ✓", { mode: "encode" })).toBe("aMOpbGxvIOKckw==");
    expect(await run("base64", "aMOpbGxvIOKckw==", { mode: "decode" })).toBe("héllo ✓");
    expect(await run("base64", "??>>", { mode: "encode", urlSafe: true })).toBe("Pz8-Pg");
    expect(await run("base64", "Pz8-Pg", { mode: "decode" })).toBe("??>>");
    await fails("base64", "***", { mode: "decode" }, /not valid Base64/);
  });
  it("url-code", async () => {
    expect(await run("url-code", "a b&c=é", { mode: "encode", scope: "component" })).toBe("a%20b%26c%3D%C3%A9");
    expect(await run("url-code", "https://x.com/a b?q=1", { mode: "encode", scope: "uri" })).toBe("https://x.com/a%20b?q=1");
    expect(await run("url-code", "a%20b+c", { mode: "decode", scope: "component" })).toBe("a b c");
    await fails("url-code", "%E0%A4%A", { mode: "decode" }, /Could not decode/);
  });
  it("jwt-decode", async () => {
    const tok = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.sig";
    const o = await run("jwt-decode", "Bearer " + tok);
    expect(o).toContain('"alg": "HS256"');
    expect(o).toContain('"name": "John Doe"');
    expect(o).toContain("iat: 2018-01-18T01:30:22.000Z");
    expect(o).toContain("not verified");
    await fails("jwt-decode", "abc", {}, /three parts/);
    await fails("jwt-decode", "a.b.c", {}, /not valid Base64-encoded JSON/);
  });
  it("regex", async () => {
    const o = await run("regex", "a1 b22", { pattern: "([a-z])(\\d+)", flags: "g", mode: "matches" });
    expect(o).toContain("2 matches");
    expect(o).toContain('#2 at 3: "b22"');
    expect(o).toContain('$2 = "22"');
    expect(await run("regex", "a1 b22", { pattern: "\\d+", flags: "g", mode: "replace", replacement: "#" })).toBe("a# b#");
    expect(await run("regex", "x\ny1\nz", { pattern: "\\d", flags: "", mode: "test" })).toBe("y1");
    expect(await run("regex", "abc", { pattern: "\\d", mode: "matches" })).toBe("No matches.");
    await fails("regex", "abc", { pattern: "(", mode: "matches" }, /Invalid regex/);
  });
  it("hash", async () => {
    expect(await run("hash", "abc", { algo: "MD5" })).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(await run("hash", "abc", { algo: "SHA-1" })).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(await run("hash", "abc", { algo: "SHA-256" })).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await run("hash", "", { algo: "MD5", upper: true })).toBe("D41D8CD98F00B204E9800998ECF8427E");
  });
});

describe("generate blocks", () => {
  it("uuid", async () => {
    const v4 = (await run("uuid", "", { count: 20, version: "v4" })).split("\n");
    expect(v4).toHaveLength(20);
    v4.forEach((u) => expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
    expect(new Set(v4).size).toBe(20);
    const v7 = (await run("uuid", "", { count: 3, version: "v7", upper: true, hyphens: false })).split("\n");
    v7.forEach((u) => expect(u).toMatch(/^[0-9A-F]{12}7[0-9A-F]{3}[89AB][0-9A-F]{15}$/));
    expect(await run("uuid", "", { count: 99999 })).toHaveLength(1000 * 36 + 999);
  });
  it("password", async () => {
    const pw = (await run("password", "", { length: 30, count: 10 })).split("\n");
    expect(pw).toHaveLength(10);
    pw.forEach((p) => { expect(p).toHaveLength(30); expect(p).toMatch(/[a-z]/); expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/\d/); expect(p).toMatch(/[^A-Za-z0-9]/); expect(p).not.toMatch(/[O0Il1|]/); });
    expect(await run("password", "", { length: 12, count: 1, upper: false, symbols: false, digits: false })).toMatch(/^[a-km-z]{12}$/);
    await fails("password", "", { lower: false, upper: false, digits: false, symbols: false }, /at least one/);
    await fails("password", "", { length: 3, count: 1 }, /Length must be/);
  });
  it("qr-svg", async () => {
    const svg = await run("qr-svg", "https://example.com");
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("<path");
    await fails("qr-svg", "  ", {}, /Enter some text/);
    await fails("qr-svg", "x".repeat(5000), {}, /too much data/);
  });
  it("lorem", async () => {
    expect(await run("lorem", "", { unit: "paragraphs", count: 3 })).toMatch(/^Lorem ipsum dolor sit amet, consectetur adipiscing elit\./);
    expect((await run("lorem", "", { unit: "paragraphs", count: 3 })).split("\n\n")).toHaveLength(3);
    expect((await run("lorem", "", { unit: "words", count: 12 })).replace(/\.$/, "").split(" ")).toHaveLength(12);
    expect(await run("lorem", "", { unit: "sentences", count: 2, classic: false })).toMatch(/^[A-Z].*\. [A-Z].*\.$/);
    expect(await run("lorem", "", { unit: "words", count: 5 })).toBe(await run("lorem", "", { unit: "words", count: 5 }));
  });
  it("placeholder-svg", async () => {
    const s = await run("placeholder-svg", "", { width: 300, height: 100 });
    expect(s).toContain('width="300"');
    expect(s).toContain("300 x 100");
    expect(await run("placeholder-svg", "<Hi>", {})).toContain("&lt;Hi&gt;");
    await fails("placeholder-svg", "", { width: 0 }, /positive/);
    await fails("placeholder-svg", "", { bg: "red;}</style>" }, /Colours/);
  });
});

describe("convert blocks", () => {
  it("timestamp", async () => {
    const o = await run("timestamp", "1700000000\n1700000000000\n2026-01-01T00:00:00Z", { tz: "UTC" });
    expect(o.match(/2023-11-14T22:13:20\.000Z/g)).toHaveLength(2);
    expect(o).toContain("seconds:  1767225600");
    expect(await run("timestamp", "0", { tz: "America/Halifax" })).toContain("1969-12-31 20:00:00");
    expect(await run("timestamp", "garbage", {})).toContain("Could not read");
    await fails("timestamp", "0", { tz: "Mars/Base" }, /not a time zone/);
  });
  it("timezone (with DST)", async () => {
    const o = await run("timezone", "2026-03-08 09:00", { from: "America/Halifax", to: "UTC, Asia/Tokyo" });
    expect(o).toMatch(/UTC\s+2026-03-08 12:00:00/); // DST began 2:00 that morning, so Halifax is UTC-3
    expect(o).toMatch(/Asia\/Tokyo\s+2026-03-08 21:00:00/);
    expect(await run("timezone", "2026-03-07 09:00", { from: "America/Halifax", to: "UTC" })).toMatch(/2026-03-07 13:00:00/); // day before DST: UTC-4
    await fails("timezone", "x", { from: "Nope/Zone" }, /not a time zone/);
  });
  it("units", async () => {
    expect(await run("units", "10 km to mi")).toBe("10 km = 6.21371 mi");
    expect(await run("units", "212 f to c")).toBe("212 f = 100 c");
    expect(await run("units", "1 gib to mib")).toBe("1 gib = 1024 mib");
    expect(await run("units", "1 kg to lb")).toContain("2.20462");
    expect(await run("units", "5 km to kg")).toContain("Cannot convert");
    expect(await run("units", "5 zorp to kg")).toContain("Unknown unit");
    expect(await run("units", "2 cups")).toContain("= 473.176");
  });
  it("color", async () => {
    const o = await run("color", "#1f3fa8");
    expect(o).toContain("rgb(31 63 168)");
    expect(o).toContain("hsl(226 68.8% 39%)");
    expect(o).toContain("oklch(0.416 0.173 265.9)");
    expect(await run("color", "rgb(255 255 255)")).toContain("#ffffff");
    expect(await run("color", "white")).toMatch(/On black: 21:1 AAA/);
    expect(await run("color", "hsl(0 100% 50%)")).toContain("#ff0000");
    expect(await run("color", "oklch(0.628 0.2577 29.23)")).toContain("#ff0000");
    await fails("color", "nope", {}, /Could not read/);
  });
  it("number-base", async () => {
    const o = await run("number-base", "255");
    expect(o).toContain("bin  11111111");
    expect(o).toContain("hex  ff");
    expect(await run("number-base", "0xFF")).toContain("dec  255");
    expect(await run("number-base", "123456789012345678901234567890")).toContain("hex  18ee90ff6c373e0ee4e3f0ad2");
    expect(await run("number-base", "z", { from: 36 })).toContain("dec  35");
    expect(await run("number-base", "-10")).toContain("bin  -1010");
    await fails("number-base", "12", { from: 2 }, /not a valid digit in base 2/);
  });
});

describe("builtin blocks", () => {
  it("replace", async () => {
    expect(await run("replace", "a.b.c", { find: ".", with: "-" })).toBe("a-b-c");
    expect(await run("replace", "a1b22", { find: "\\d+", with: "#", regex: true })).toBe("a#b#");
    expect(await run("replace", "aaa", { find: "a", with: "b", all: false })).toBe("baa");
    expect(await run("replace", "Hello", { find: "hello", with: "x", ignoreCase: true })).toBe("x");
    await fails("replace", "x", { find: "(", regex: true }, /Invalid regex/);
  });
  it("split-join", async () => {
    expect(await run("split-join", "a\nb\nc", { mode: "join", sep: ", " })).toBe("a, b, c");
    expect(await run("split-join", "a,b,c", { mode: "split", sep: "," })).toBe("a\nb\nc");
    expect(await run("split-join", "a\nb", { mode: "join", sep: "\\t" })).toBe("a\tb");
  });
  it("limit-lines", async () => {
    expect(await run("limit-lines", "1\n2\n3\n4", { which: "first", n: 2 })).toBe("1\n2");
    expect(await run("limit-lines", "1\n2\n3\n4", { which: "last", n: 1 })).toBe("4");
  });
  it("custom-js is registered with a code param", () => {
    const b = blockById("custom-js")!;
    expect(b.params.map((p) => p.key)).toEqual(["code"]);
  });
});

describe("registry", () => {
  it("has unique block ids and every block has a description", () => {
    const ids = allBlocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    allBlocks.forEach((b) => expect(b.description.length).toBeGreaterThan(5));
  });
  it("every block either runs or fails with a human message on empty input", async () => {
    for (const b of allBlocks) {
      try { await Promise.resolve(b.run("", defaultParams(b))); }
      catch (e) { expect(e, b.id).toBeInstanceOf(Error); expect((e as Error).message.length, b.id).toBeGreaterThan(10); }
    }
  });
});

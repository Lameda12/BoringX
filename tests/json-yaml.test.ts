import { describe, expect, it, vi } from "vitest";
import { allBlocks, blockById } from "@/engine/registry";
import { runPipeline } from "@/engine/run";
import { defaultParams, type Params } from "@/engine/types";
import tools from "@/generated/tools.json";

async function run(id: string, input: string, params: Params = {}) {
  const b = blockById(id);
  if (!b) throw new Error(`no block ${id}`);
  return b.run(input, { ...defaultParams(b), ...params });
}
const toYaml = (s: string, p?: Params) => run("json-to-yaml", s, p);
const toJson = (s: string, p?: Params) => run("yaml-to-json", s, p);
const parsed = async (s: string) => JSON.parse(await toJson(s));

const nested = { name: "x", n: -1.5, big: 9007199254740991, ok: true, no: false, nil: null, empty: "", list: [1, [2, 3], { a: [] }], obj: { deep: { deeper: {} } }, text: "line one\nline two\n", uni: "é ✓ 日本" };
// Strings that would change type or meaning if written without quotes.
const tricky = ["yes", "no", "on", "off", "y", "n", "true", "null", "~", "", "001", "1e3", "0x1F", "1_000", "12:30", "2026-01-01", ".nan", "<<", "- a", "a: b", "# c", "*x", "&x", "!t", " pad ", "tab\there", "---"];

describe("JSON to YAML", () => {
  it("writes block-style YAML", async () => {
    expect(await toYaml('{"a":1,"b":["x",{"c":null}]}')).toBe("a: 1\nb:\n  - x\n  - c: null\n");
  });
  it("round-trips nested objects, arrays and scalars", async () => {
    expect(await parsed(await toYaml(JSON.stringify(nested)))).toEqual(nested);
    expect(await parsed(await toYaml(JSON.stringify(nested), { indent: "4" }))).toEqual(nested);
    for (const v of [0, -0.25, true, null, "s", [], {}]) expect(await parsed(await toYaml(JSON.stringify(v)))).toEqual(v);
  });
  it("keeps look-alike strings as strings, as values and as keys", async () => {
    const v = { list: tricky, keys: Object.fromEntries(tricky.map((s) => [s, s])) };
    expect(await parsed(await toYaml(JSON.stringify(v)))).toEqual(v);
    // YAML 1.1 readers must not see booleans either
    expect(await toYaml('{"a":"yes","b":"on"}')).toBe('a: "yes"\nb: "on"\n');
  });
  it("keeps a __proto__ key as data", async () => {
    const out = await toJson(await toYaml('{"__proto__":{"a":1}}'), { indent: "min" });
    expect(out).toBe('{"__proto__":{"a":1}}');
  });
  it("refuses a repeated key instead of keeping one value", async () => {
    await expect(toYaml('{"a":1,\n "\\u0061":2}')).rejects.toThrow(/repeated at line 2, column 2/);
    expect(await toYaml('[{"a":"{\\"a\\":"},{"a":{"a":2}}]')).toContain("a: 2");
  });
  it.each([" \n", "  \n", "\n", "  indented\nnext", " \nfoo", "\tx\ny", "\uFEFF", "\uFEFFid", "\uFEFF[", "a\r\nb", "trail \n \n", "\u2028x\u0085", "\u2028", "\u00a0", "\u0000\u007f"])("round-trips the awkward string %j anywhere", async (text) => {
    for (const v of [text, [text], { [text]: text }, { a: [{ b: text }], z: 1 }]) expect(await parsed(await toYaml(JSON.stringify(v)))).toEqual(v);
  });
  it("round-trips random strings and numbers", async () => {
    const pieces = [" ", "\n", "\t", "\r", "\uFEFF", "a", "1", ".", "e", "+", "-", ":", "#", "'", '"', "\\", "[", "{", "|", ">", "%", "@", "`", "?", ",", "&", "*", "!", "é", "\u2028", "\u2029", "\u00a0", "\u3000", "\u0085", "\u000b", "\u000c", "<", "="];
    let seed = 7;
    const rand = (n: number) => (seed = (seed * 48271) % 2147483647) % n;
    const word = () => Array.from({ length: rand(7) }, () => pieces[rand(pieces.length)]).join("");
    for (let i = 0; i < 1500; i++) {
      const v = rand(2) ? word() : { [word()]: word(), list: [word(), [word()], rand(1000) * 10 ** (rand(31) - 10)] };
      const json = JSON.stringify(v);
      if (/\d{16}/.test(json)) continue;
      const y = await toYaml(json);
      expect(await parsed(y), json).toEqual(v);
    }
  });
  it("writes exponents that YAML 1.1 readers take as numbers", async () => {
    expect(await toYaml("[1e21,1e-7,5e-324,-2.5e-8]")).toBe("- 1.0e+21\n- 1.0e-7\n- 5.0e-324\n- -2.5e-8\n");
  });
  it("reports where the JSON is broken", async () => {
    await expect(toYaml('{\n  "a": 1,\n}')).rejects.toThrow(/Invalid JSON at line 3, column 1/);
    await expect(toYaml("  ")).rejects.toThrow(/Nothing to convert/);
  });
  it("refuses numbers that would silently change", async () => {
    await expect(toYaml('{"id":12345678901234567890}')).rejects.toThrow(/12345678901234567890.*line 1, column 7/);
    await expect(toYaml('[1e400]')).rejects.toThrow(/1e400/);
    await expect(toYaml('[1e-400]')).rejects.toThrow(/1e-400/);
    await expect(toYaml('[9007199254740993.0]')).rejects.toThrow(/9007199254740993/);
    await expect(toYaml('[12345678901234567890.5]')).rejects.toThrow(/12345678901234567890/);
    const exact = [1e20, -1e20, 1e300, 1.5e-9, 0, -9007199254740991];
    expect(await parsed(await toYaml(JSON.stringify(exact)))).toEqual(exact);
    expect(await toYaml('{"id":"12345678901234567890"}')).toContain("12345678901234567890");
  });
});

describe("YAML to JSON", () => {
  it("reads block and flow collections, scalars and comments", async () => {
    const y = "# top\nserver:\n  host: localhost\n  ports: [80, 443]\n  tls: true\n  note: |\n    a\n    b\nitems:\n  - {id: 1, tag: null}\n  - id: 2\n    tag: ~\nversion: '1.0'\nanswer: yes\n";
    expect(await parsed(y)).toEqual({ server: { host: "localhost", ports: [80, 443], tls: true, note: "a\nb\n" }, items: [{ id: 1, tag: null }, { id: 2, tag: null }], version: "1.0", answer: "yes" });
    expect(await toJson("a: 1", { indent: "min" })).toBe('{"a":1}');
    expect(await toJson("a: 1", { indent: "4" })).toBe('{\n    "a": 1\n}');
    expect(await parsed("42")).toBe(42);
    expect(await parsed("---\nnull\n")).toBeNull();
  });
  it("expands ordinary anchors and aliases, and accepts core tags", async () => {
    expect(await parsed("a: &x {n: 1}\nb: *x\n")).toEqual({ a: { n: 1 }, b: { n: 1 } });
    expect(await parsed("a: !!str 12\nb: !!int \"3\"\nc: !!seq [1]\nd: !!map {}")).toEqual({ a: "12", b: 3, c: [1], d: {} });
  });
  it("reports where the YAML is broken", async () => {
    await expect(toJson("a: 1\nb: [1, 2\nc: 3\n")).rejects.toThrow(/Invalid YAML at line \d+, column \d+/);
    await expect(toJson("a: 1\na: 2\n")).rejects.toThrow(/Invalid YAML at line 2, column 1.*unique/i);
    await expect(toJson("a:\n\tb: 1\n")).rejects.toThrow(/Invalid YAML at line 2/);
    await expect(toJson("a: *missing")).rejects.toThrow(/line 1, column 4.*missing/);
    await expect(toJson("")).rejects.toThrow(/Nothing to convert/);
    await expect(toJson("# only a comment\n")).rejects.toThrow(/Nothing to convert/);
  });
  it.each([
    ["multiple documents", "a: 1\n---\nb: 2\n", /line 2.*one document/i],
    ["custom tag", "a: !Ref MyThing", /line 1, column \d+.*!Ref/],
    ["custom tag on a map", "a: !custom\n  b: 1", /!custom/],
    ["binary tag", "a: !!binary aGk=", /binary/],
    ["timestamp tag", "a: !!timestamp 2026-01-01", /timestamp/],
    ["set tag", "a: !!set {x, y}", /set/],
    ["mismatched core tag", "a: !!int hello", /line 1/],
    ["merge key", "base: &b {x: 1}\nc:\n  <<: *b\n", /line 3, column 3.*merge key/i],
    ["infinity", "a: .inf", /line 1, column 4.*\.inf/],
    ["not a number", "a: .nan", /\.nan/],
    ["alias to a list as key", "a: &k [1]\n*k : 1\n", /key/i],
    ["unsafe integer", "a: 12345678901234567890", /line 1, column 4.*12345678901234567890/],
    ["float overflow", "a: 1e400", /1e400/],
    ["collection key", "? [a, b]\n: 1\n", /line 1, column \d+.*key/i],
    ["number key", "200: ok", /key.*200.*quote/i],
    ["null key", "~: 1", /key.*quote/i],
    ["alias to a number as key", "a: &k 5\n*k : 1\n", /key.*quote/i],
    ["self-referencing alias", "a: &x [1, *x]", /line 1.*refers to itself/],
    ["YAML 1.1 directive", "%YAML 1.1\n---\na: yes\n", /1\.1/],
    ["unknown directive", "%FOO bar\n---\na: 1\n", /line 1/],
  ])("fails explicitly on %s", async (_name, input, message) => {
    await expect(toJson(input)).rejects.toThrow(message);
  });
  it("allows a quoted << key and an alias to a text key", async () => {
    expect(await parsed('"<<": 1\nb: &k name\n*k : 2\n')).toEqual({ "<<": 1, b: "name", name: 2 });
  });
  it.each([
    ["&k a: 1\n*k : 2\n", /line 2, column 1.*unique/],
    ["x: &k a\nm:\n  a: 1\n  *k : 2\n", /line 4, column 3.*unique/],
  ])("does not let an alias key overwrite a value: %j", async (input, message) => {
    await expect(toJson(input)).rejects.toThrow(message);
  });
  it.each([
    ["float beyond 2^53", "a: 9007199254740993.0"],
    ["long decimal beyond 2^53", "a: 12345678901234567890.5"],
    ["underflow", "a: 1e-400"],
    ["hex beyond 2^53", "a: 0x20000000000001"],
  ])("refuses to change a number: %s", async (_name, input) => {
    await expect(toJson(input)).rejects.toThrow(/line 1, column 4.*exactly/);
  });
  it("reads back every number it writes", async () => {
    const out = await toJson("[1e20, -1e20, 1.0e+21]", { indent: "min" });
    expect(await parsed(await toYaml(out))).toEqual([1e20, -1e20, 1e21]);
  });
  it("resolves a reused anchor name to the latest one", async () => {
    expect(await parsed("a: &x [&x 1, *x]\nb: *x\n")).toEqual({ a: [1, 1], b: 1 });
  });
  it("allows many ordinary aliases", async () => {
    const out = await parsed("d: &d {t: 1}\nl:\n" + "  - *d\n".repeat(500));
    expect(out.l).toHaveLength(500);
  });
  it("stays fast on large maps and many aliases", async () => {
    const map = Array.from({ length: 40_000 }, (_, i) => `k${i}: 1`).join("\n");
    const aliases = "- &a 1\n" + "- *a\n".repeat(20_000);
    const t = performance.now();
    expect(Object.keys(await parsed(map))).toHaveLength(40_000);
    expect(await parsed(aliases)).toHaveLength(20_001);
    expect(performance.now() - t).toBeLessThan(6000); // took about a minute with the library's own passes
  }, 90_000);
  it("stops alias expansion bombs", async () => {
    let y = "a0: &a0 [x, x, x, x, x, x, x, x, x, x]\n";
    for (let i = 1; i < 9; i++) y += `a${i}: &a${i} [${Array(10).fill(`*a${i - 1}`).join(", ")}]\n`;
    await expect(toJson(y)).rejects.toThrow(/alias/i);
  });
  it("explains nesting that is too deep instead of overflowing", async () => {
    for (const n of [1000, 20_000]) await expect(toJson("[".repeat(n) + "]".repeat(n))).rejects.toThrow(/nested too deeply/);
  });
});

describe("JSON and YAML tool", () => {
  it("is registered as a Data tool with two Sandbox blocks", () => {
    expect(tools.find((t) => t.slug === "json-yaml")).toMatchObject({ category: "Data", recipe: { steps: [{ b: "yaml-to-json" }] } });
    expect(allBlocks.map((b) => b.id)).toEqual(expect.arrayContaining(["json-to-yaml", "yaml-to-json"]));
  });
  it("chains in a pipeline and makes no requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await runPipeline("b: 2\na: [1]\n", [{ b: "yaml-to-json", p: {} }, { b: "json-format", p: { indent: "min", sortKeys: true } }, { b: "json-to-yaml", p: {} }], blockById);
    expect(r.error).toBeUndefined();
    expect(r.output).toBe("a:\n  - 1\nb: 2\n");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

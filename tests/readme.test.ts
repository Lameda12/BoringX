import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SITE } from "@/lib/tools";
import tools from "@/generated/tools.json";
import { runPipeline } from "@/engine/run";
import { blockById } from "@/engine/registry";

const root = path.resolve(__dirname, "..");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
// The opening section: everything before the first "## " heading.
const opening = readme.split(/^## /m)[0];
const toolIds = new Map((tools as { slug: string; name: string }[]).map((t) => [t.name, t.slug]));

describe("README opening section", () => {
  it("links to the live site and the Sandbox", () => {
    expect(opening).toContain(`](${SITE.url})`);
    expect(opening).toContain(`](${SITE.url}/sandbox)`);
    expect(fs.existsSync(path.join(root, "src/app/sandbox"))).toBe(true);
  });
  it("explains one chain, Clean List then SQL IN List, and the claim holds", async () => {
    const m = opening.match(/\*\*([^*]+)\*\* → \*\*([^*]+)\*\*/);
    expect(m, "expected a '**Tool** → **Tool**' chain sentence").not.toBeNull();
    expect([toolIds.get(m![1]), toolIds.get(m![2])]).toEqual(["clean-list", "sql-in-list"]);
    const r = await runPipeline("b2\nB1\nb2\n\na3", [{ b: "clean-list", p: { trim: true, empty: true, dedupe: true, ignoreCase: true, sort: "az" } }, { b: "sql-in-list", p: {} }], blockById);
    expect(r.error).toBeUndefined();
    expect(r.output).toMatch(/IN \('?a3'?, '?B1'?, '?b2'?\)/i);
  });
  it("keeps the screenshots, and the files exist", () => {
    for (const img of ["docs/home.png", "docs/sandbox.png", "docs/pdf-dark.png"]) {
      expect(opening).toContain(`](${img})`);
      expect(fs.existsSync(path.join(root, img))).toBe(true);
    }
  });
});

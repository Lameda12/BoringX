import type { BlockDef, ToolMeta } from "@/engine/types";
import { runRegexJob } from "@/engine/regex-worker";
import { sel, text } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";

export const meta: ToolMeta = {
  slug: "regex-tester", name: "Regex Tester", category: "Dev",
  blurb: "Tests a JavaScript regex against text. Lists matches or replaces.",
  description: "Test JavaScript regular expressions live: see every match with index and capture groups, or run a replace.",
  keywords: ["regex", "regular expression", "match", "replace", "javascript", "test"],
  recipe: { name: "Regex Tester", input: "ada@example.com, grace@navy.mil, not-an-email, linus@kernel.org", steps: [{ b: "regex", p: { pattern: "(\\w+)@([\\w.]+)", flags: "g", mode: "matches", replacement: "$2: $1" } }] },
};

export const blocks: BlockDef[] = [{
  id: "regex", name: "Regex", category: "Dev", description: "List matches or replace with a JavaScript regex.",
  params: [text("pattern", "Pattern", "\\w+"), text("flags", "Flags", "g", "g i m s u y"), sel("mode", "Mode", [["matches", "List matches"], ["replace", "Replace"], ["test", "Keep matching lines"]]), text("replacement", "Replacement", "$&", "Use $1, $2, $& for groups.")],
  run: (input, p) => runRegexJob({ kind: "regex", input, pattern: String(p.pattern), flags: String(p.flags), mode: String(p.mode), replacement: String(p.replacement) }, "Regex block"),
}];

export default toolFromRecipe(meta.recipe!, blocks, { outputLabel: "Result", outputName: "regex.txt", inputRows: 6 });

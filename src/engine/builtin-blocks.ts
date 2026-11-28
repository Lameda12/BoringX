import type { BlockDef } from "./types";
import { area, num, sel, text, bool } from "./p";
import { runCustomJs } from "./custom-js";
import { runRegexJob } from "./regex-worker";

export const builtinBlocks: BlockDef[] = [
  {
    id: "custom-js", name: "Custom JavaScript", category: "Dev",
    description: "Your code runs in an isolated Worker with no network access. Use `input` and `return` a value.",
    params: [area("code", "Code", "// input is the text from the previous block\nreturn input.split('\\n').map((l) => l.toUpperCase()).join('\\n');", "Runs in a Worker with connect-src 'none'. Stops after 2 seconds.")],
    run: (input, p) => runCustomJs(String(p.code), input),
  },
  {
    id: "replace", name: "Find and replace", category: "Text", description: "Replace text, optionally with a regex.",
    params: [text("find", "Find", ""), text("with", "Replace with", ""), bool("regex", "Find is a regex", false), bool("all", "Replace all", true), bool("ignoreCase", "Ignore case", false)],
    run: (input, p) => {
      const find = String(p.find);
      if (!find) return input;
      const flags = (p.all ? "g" : "") + (p.ignoreCase ? "i" : "");
      // A literal search cannot backtrack, so only user-written patterns go to the worker.
      if (p.regex) return runRegexJob({ kind: "replace", input, find, with: String(p.with), all: Boolean(p.all), ignoreCase: Boolean(p.ignoreCase) }, "Find and replace block");
      return input.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags), String(p.with));
    },
  },
  {
    id: "split-join", name: "Split or join lines", category: "Text", description: "Turn lines into one line, or one line into lines.",
    params: [sel("mode", "Mode", [["join", "Join lines with separator"], ["split", "Split on separator into lines"]]), text("sep", "Separator", ", ", "Use \\n for a newline, \\t for a tab.")],
    run: (input, p) => {
      const sep = String(p.sep).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      return p.mode === "split" ? input.split(sep).join("\n") : input.split(/\r?\n/).join(sep);
    },
  },
  {
    id: "limit-lines", name: "Keep lines", category: "Text", description: "Keep the first or last N lines.",
    params: [sel("which", "Keep", [["first", "First"], ["last", "Last"]]), num("n", "How many", 10, 0)],
    run: (input, p) => { const l = input.split("\n"); const n = Math.max(0, Math.floor(Number(p.n))); return (p.which === "last" ? l.slice(Math.max(0, l.length - n)) : l.slice(0, n)).join("\n"); },
  },
];

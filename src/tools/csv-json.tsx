import type { BlockDef, ToolMeta } from "@/engine/types";
import { bool, sel } from "@/engine/p";
import { toolFromRecipes } from "@/components/toolFromRecipe";
import { parseJson } from "./json-formatter";

export const meta: ToolMeta = {
  slug: "csv-json", name: "CSV to JSON and back", category: "Data",
  blurb: "Converts CSV to JSON, or JSON to CSV.",
  description: "Convert CSV to JSON or JSON to CSV in your browser. Handles quoted fields, custom delimiters and header rows.",
  keywords: ["csv", "json", "convert", "papaparse", "spreadsheet"],
  recipe: { name: "CSV to JSON", input: "id,name,city\n001,Ada,London\n002,Grace,\"New York, NY\"\n003,Linus,Helsinki", steps: [{ b: "csv-to-json", p: { header: true, delimiter: "", types: false } }] },
};

export const blocks: BlockDef[] = [
  {
    id: "csv-to-json", name: "CSV to JSON", category: "Data", description: "Parses CSV into a JSON array.",
    params: [bool("header", "First row is header", true), sel("delimiter", "Delimiter", [["", "Auto"], [",", "Comma"], [";", "Semicolon"], ["\t", "Tab"], ["|", "Pipe"]], ""), bool("types", "Convert numbers and booleans", false, "Off keeps every value as text, so identifiers and leading zeros such as 001 stay intact. On turns 001 into 1, true into a boolean and empty cells into null.")],
    run: async (input, p) => {
      if (!input.trim()) throw new Error("Nothing to convert. Paste some CSV.");
      const Papa = (await import("papaparse")).default;
      const r = Papa.parse(input, { header: Boolean(p.header), delimiter: String(p.delimiter), skipEmptyLines: "greedy", dynamicTyping: Boolean(p.types) });
      const fatal = r.errors.find((e) => e.type !== "FieldMismatch" && e.code !== "UndetectableDelimiter");
      if (fatal) throw new Error(`CSV problem on row ${(fatal.row ?? 0) + 1}: ${fatal.message}. Check quotes and the delimiter setting.`);
      return JSON.stringify(r.data, null, 2);
    },
  },
  {
    id: "json-to-csv", name: "JSON to CSV", category: "Data", description: "Turns a JSON array into CSV.",
    params: [sel("delimiter", "Delimiter", [[",", "Comma"], [";", "Semicolon"], ["\t", "Tab"], ["|", "Pipe"]], ","), bool("header", "Include header row", true)],
    run: async (input, p) => {
      const Papa = (await import("papaparse")).default;
      const v = parseJson(input);
      const rows = Array.isArray(v) ? v : [v];
      if (rows.some((r) => r === null || typeof r !== "object")) throw new Error("JSON must be an array of objects or an array of arrays. Wrap plain values in objects first.");
      const flat = rows.map((r) => (Array.isArray(r) ? r : Object.fromEntries(Object.entries(r as object).map(([k, x]) => [k, x !== null && typeof x === "object" ? JSON.stringify(x) : x]))));
      return Papa.unparse(flat as never, { delimiter: String(p.delimiter), header: Boolean(p.header), newline: "\n" });
    },
  },
];

export default toolFromRecipes([
  { label: "CSV to JSON", recipe: meta.recipe!, opts: { inputLabel: "CSV", outputLabel: "JSON", outputName: "data.json", acceptFile: ".csv,.tsv,.txt,text/csv" } },
  { label: "JSON to CSV", recipe: { name: "JSON to CSV", input: '[{"id":1,"name":"Ada"},{"id":2,"name":"Grace"}]', steps: [{ b: "json-to-csv", p: {} }] }, opts: { inputLabel: "JSON", outputLabel: "CSV", outputName: "data.csv", acceptFile: ".json,.txt" } },
], blocks);

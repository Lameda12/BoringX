/**
 * One short sentence for a live region, so screen readers hear the shape of a result
 * rather than the whole document. Errors return "" because role="alert" already reads them.
 */
export function resultStatus({ output, error }: { output: string; error?: string | null }): string {
  if (error) return "";
  if (!output) return "No output yet.";
  const chars = [...output].length;
  const lines = output.split("\n").length;
  const count = (n: number, one: string) => `${n.toLocaleString("en-US")} ${one}${n === 1 ? "" : "s"}`;
  return `Result ready: ${count(chars, "character")} in ${count(lines, "line")}.`;
}

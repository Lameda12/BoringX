/** Output actions (copy, download) are only offered for a settled, successful, non-empty result. */
export function canUseOutput(o: { output: string; error?: unknown; pending?: boolean }): boolean {
  return !o.pending && !o.error && o.output !== "";
}

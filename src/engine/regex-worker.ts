/** Regex work for user-supplied patterns runs in a dedicated Worker with a hard timeout, so a pathological pattern cannot freeze the tab. */
export type RegexJob =
  | { kind: "regex"; input: string; pattern: string; flags: string; mode: string; replacement: string }
  | { kind: "replace"; input: string; find: string; with: string; all: boolean; ignoreCase: boolean };

type WorkerLike = {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: { ok: boolean; out?: string; error?: string } }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
};

const defaultWorker = (): WorkerLike => {
  if (typeof Worker === "undefined") throw new Error("Workers are not available in this browser.");
  return new Worker("/workers/regex.js") as unknown as WorkerLike;
};

/** In-flight jobs. A new job terminates older ones: the UI only ever shows the newest result, so a superseded catastrophic pattern must not keep burning CPU. */
const inflight = new Set<{ w: WorkerLike; timer: ReturnType<typeof setTimeout>; reject: (e: Error) => void }>();

/** `operation` names the block in the timeout message, e.g. "Regex block" or "Find and replace block". */
export function runRegexJob(job: RegexJob, operation: string, timeoutMs = 2000, create: () => WorkerLike = defaultWorker): Promise<string> {
  return new Promise((resolve, reject) => {
    let w: WorkerLike;
    try { w = create(); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); return; }
    const entry = { w, timer: undefined as unknown as ReturnType<typeof setTimeout>, reject };
    for (const old of [...inflight]) { clearTimeout(old.timer); old.w.terminate(); inflight.delete(old); old.reject(new Error("Superseded by a newer run.")); }
    inflight.add(entry);
    const timer = entry.timer = setTimeout(() => {
      inflight.delete(entry);
      w.terminate();
      reject(new Error(`${operation} ran longer than ${timeoutMs / 1000}s and was stopped. The pattern may backtrack catastrophically; simplify it, or make nested repeats like (a+)+ more specific.`));
    }, timeoutMs);
    w.onmessage = (e) => {
      clearTimeout(timer); inflight.delete(entry);
      w.terminate();
      e.data.ok ? resolve(e.data.out ?? "") : reject(new Error(e.data.error));
    };
    w.onerror = (e) => {
      clearTimeout(timer); inflight.delete(entry);
      w.terminate();
      reject(new Error(`${operation} could not run: ${e.message || "worker failed to start"}`));
    };
    w.postMessage(job);
  });
}

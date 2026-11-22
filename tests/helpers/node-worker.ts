import { Worker as NodeWorker } from "node:worker_threads";
import fs from "node:fs";
import path from "node:path";

/** Minimal browser-Worker stand-in over worker_threads, so the real public/workers/*.js files run (and can be terminated) under vitest. */
export class ShimWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  private w: NodeWorker;
  constructor(url: string) {
    const src = fs.readFileSync(path.join("public", url), "utf8");
    const boot = `const { parentPort, workerData } = require("node:worker_threads");
      globalThis.self = globalThis;
      globalThis.postMessage = (m) => parentPort.postMessage(m);
      require("node:vm").runInThisContext("(function (module) {" + workerData + "\\n})(undefined)");
      parentPort.on("message", (d) => globalThis.onmessage({ data: d }));`;
    this.w = new NodeWorker(boot, { eval: true, workerData: src });
    this.w.on("message", (data) => this.onmessage?.({ data }));
    this.w.on("error", (e: Error) => this.onerror?.({ message: e.message }));
  }
  postMessage(m: unknown) { this.w.postMessage(m); }
  terminate() { void this.w.terminate(); }
}

export const installWorkerShim = () => { (globalThis as { Worker?: unknown }).Worker = ShimWorker; };

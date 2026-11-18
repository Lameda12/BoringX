"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { runPipeline } from "@/engine/run";
import { defaultParams, type BlockDef, type Params, type Recipe, type Step } from "@/engine/types";
import { encodeRecipe } from "@/engine/recipe";
import { CopyBtn, DownloadBtn, ErrorNote, FileDrop, ResultStatus } from "./kit";
import { ParamControls } from "./ParamControls";

/**
 * A tool built on the Sandbox engine: one input, a fixed recipe of blocks, live output.
 * "Take it apart" opens the same recipe, with current input and settings, in the Sandbox.
 */
export function BlockTool({
  recipe, blocks, inputLabel = "Input", outputLabel = "Result", outputName = "result.txt", acceptFile, inputRows = 10, renderOutput, extra,
}: { renderOutput?: (out: string) => ReactNode; extra?: (out: string) => ReactNode; recipe: Recipe; blocks: BlockDef[]; inputLabel?: string; outputLabel?: string; outputName?: string; acceptFile?: string; inputRows?: number }) {
  const lookup = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const [input, setInput] = useState(recipe.input);
  const [steps, setSteps] = useState<Step[]>(() => recipe.steps.map((s) => ({ b: s.b, p: { ...defaultParams(lookup.get(s.b)!), ...s.p } })));
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [href, setHref] = useState("/sandbox");
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const t0 = performance.now();
    runPipeline(input, steps, (b) => lookup.get(b)).then((r) => {
      if (id !== seq.current) return;
      setOutput(r.error ? "" : r.output);
      setError(r.error?.message ?? null);
      setMs(performance.now() - t0);
    });
  }, [input, steps, lookup]);

  useEffect(() => {
    let live = true;
    encodeRecipe({ name: "", input, steps }).then((s) => live && setHref(`/sandbox#r=${s}`));
    return () => { live = false; };
  }, [input, steps]);

  return (
    <div className="stack">
      <section className="panel">
        <header className="panel-head">
          <h2>{inputLabel}</h2>
          <div className="panel-actions">
            <label className="btn">
              Load file
              <input type="file" hidden accept={acceptFile ?? ".txt,.csv,.json,.md,.sql,.tsv,text/*"} onChange={async (e) => {
                const f = e.target.files?.[0]; if (f) setInput(await f.text()); e.target.value = "";
              }} />
            </label>
            <button type="button" className="btn" onClick={async () => { try { setInput(await navigator.clipboard.readText()); } catch { setError("Clipboard access was blocked. Paste with Ctrl+V or Cmd+V instead."); } }}>Paste</button>
            <button type="button" className="btn" onClick={() => setInput("")}>Clear</button>
          </div>
        </header>
        <textarea
          className="mono text-in" rows={inputRows} spellCheck={false} aria-label={inputLabel}
          value={input} onChange={(e) => setInput(e.target.value)}
        />
      </section>

      {steps.some((s) => lookup.get(s.b)!.params.length) && (
        <section className="panel">
          <header className="panel-head"><h2>Settings</h2></header>
          {steps.map((s, i) => {
            const d = lookup.get(s.b)!;
            if (!d.params.length) return null;
            return (
              <div key={i} className="ledger-row settings-row">
                {steps.length > 1 && <span className="step-name">{d.name}</span>}
                <ParamControls idPrefix={`s${i}`} defs={d.params} values={s.p} onChange={(p: Params) => setSteps(steps.map((x, j) => (j === i ? { ...x, p } : x)))} />
              </div>
            );
          })}
        </section>
      )}

      <section className="panel">
        <header className="panel-head">
          <h2>{outputLabel}</h2>
          <div className="panel-actions">
            <CopyBtn text={output} />
            <DownloadBtn data={output} name={outputName} type="text/plain" />
            {extra?.(output)}
            <Link className="btn" href={href} prefetch={false}>Take it apart</Link>
          </div>
        </header>
        <ErrorNote error={error} />
        {renderOutput && !error && output ? <div className="rendered" data-testid="rendered">{renderOutput(output)}</div> : null}
        <pre className={`mono text-out ${renderOutput && output ? "sr-only" : ""}`} data-testid="output" tabIndex={0}>{output}</pre>
        <ResultStatus output={output} error={error} />
        <p className="meter">{ms !== null ? `${ms < 1 ? "<1" : Math.round(ms)} ms` : ""}</p>
      </section>
    </div>
  );
}

export { FileDrop };

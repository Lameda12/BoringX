"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allBlocks, blockById } from "@/engine/registry";
import { runPipeline, type StepResult } from "@/engine/run";
import { decodeRecipe, encodeRecipe } from "@/engine/recipe";
import { defaultParams, CATEGORIES, type Params, type Recipe } from "@/engine/types";
import { Btn, CopyBtn, DownloadBtn, ErrorNote } from "./kit";
import { ParamControls } from "./ParamControls";
import { copyText } from "@/lib/clipboard";

type UStep = { uid: string; b: string; p: Params };
const uid = () => Math.random().toString(36).slice(2, 9);
const mk = (b: string, p: Params = {}): UStep => ({ uid: uid(), b, p: { ...defaultParams(blockById(b)!), ...p } });

const DEFAULT: Recipe = {
  name: "",
  input: "banana\napple\nBanana\ncherry\napple\n  date  ",
  steps: [{ b: "clean-list", p: { trim: true, empty: true, dedupe: true, ignoreCase: true, sort: "az" } }, { b: "case-convert", p: { mode: "upper" } }, { b: "sql-in-list", p: { column: "fruit", quote: "auto", dedupe: true, perLine: "0" } }],
};
const KEY = "boringx.saved.v1";
type Saved = { id: string; name: string; recipe: Recipe };
const loadSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const storeSaved = (s: Saved[]) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };

export function Sandbox() {
  const [name, setName] = useState("");
  const [input, setInput] = useState(DEFAULT.input);
  const [steps, setSteps] = useState<UStep[]>(() => DEFAULT.steps.map((s) => mk(s.b, s.p)));
  const [results, setResults] = useState<StepResult[]>([]);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<{ index: number; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [filter, setFilter] = useState("");
  const [withInput, setWithInput] = useState(true);
  const [link, setLink] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const seq = useRef(0);

  const apply = useCallback((r: Recipe) => {
    setName(r.name); setInput(r.input);
    setSteps(r.steps.filter((s) => blockById(s.b)).map((s) => mk(s.b, s.p)));
    const unknown = r.steps.filter((s) => !blockById(s.b));
    setNotice(unknown.length ? `Skipped ${unknown.length} unknown block${unknown.length > 1 ? "s" : ""} (${unknown.map((u) => u.b).join(", ")}). This link may be from a newer version.` : null);
  }, []);

  useEffect(() => {
    setSaved(loadSaved());
    const fromHash = async () => {
      const h = new URLSearchParams(location.hash.slice(1));
      const r = h.get("r"); const n = h.get("n");
      if (r) { try { apply(await decodeRecipe(r)); } catch (e) { setNotice(e instanceof Error ? e.message : "This link could not be opened."); } }
      else if (n) setName(n);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [apply]);

  useEffect(() => {
    const id = ++seq.current;
    runPipeline(input, steps.map((s) => ({ b: s.b, p: s.p })), blockById).then((r) => {
      if (id !== seq.current) return;
      setResults(r.results); setOutput(r.error ? "" : r.output); setError(r.error ?? null);
    });
  }, [input, steps]);

  const recipe = useMemo<Recipe>(() => ({ name, input: withInput ? input : "", steps: steps.map(({ b, p }) => ({ b, p })) }), [name, input, steps, withInput]);
  useEffect(() => { let live = true; encodeRecipe(recipe).then((s) => live && setLink(`${location.origin}/sandbox#r=${s}`)); return () => { live = false; }; }, [recipe]);

  const move = (i: number, j: number) => { if (j < 0 || j >= steps.length) return; const s = [...steps]; const [x] = s.splice(i, 1); s.splice(j, 0, x); setSteps(s); setPeek(null); };
  const setP = (i: number, p: Params) => setSteps(steps.map((s, k) => (k === i ? { ...s, p } : s)));
  const rerun = () => setSteps((s) => [...s]);

  const filtered = allBlocks.filter((b) => !filter || `${b.name} ${b.description} ${b.category}`.toLowerCase().includes(filter.toLowerCase()));
  const save = () => {
    const entry: Saved = { id: uid(), name: name.trim() || "Untitled", recipe: { ...recipe, input } };
    const next = [entry, ...saved.filter((s) => s.name !== entry.name)];
    setSaved(next); storeSaved(next); setNotice(`Saved "${entry.name}" in this browser.`);
  };
  const isSvg = /^\s*<svg[\s>]/.test(output);
  const title = name.trim() ? `Boring ${name.trim()}` : "Boring ____";

  return (
    <div className="stack">
      <section className="panel" aria-label="Name">
        <div className="namebar">
          <span className="boring" aria-hidden="true">Boring</span>
          <input className="mono name-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="name your tool" aria-label={`Tool name, shown as ${title}`} maxLength={60} />
        </div>
        <div className="row">
          <Btn primary onClick={save}>Save</Btn>
          <Btn onClick={async () => { await copyText(link); setNotice(link.length > 8000 ? "Link copied, but it is very long. Untick \"Include input\" to shorten it." : "Link copied. It opens and runs with no server."); }}>Copy share link</Btn>
          <label className="check"><input type="checkbox" checked={withInput} onChange={(e) => setWithInput(e.target.checked)} /> Include input in link</label>
        </div>
        {notice && <p className="help" role="status">{notice}</p>}
      </section>

      <section className="panel">
        <header className="panel-head"><h2>Input</h2><div className="panel-actions">
          <label className="btn">Load file<input type="file" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setInput(await f.text()); e.target.value = ""; }} /></label>
          <Btn onClick={() => setInput("")}>Clear</Btn></div></header>
        <textarea className="mono text-in" rows={7} spellCheck={false} aria-label="Input" value={input} onChange={(e) => setInput(e.target.value)} />
      </section>

      <section className="panel" aria-label="Blocks">
        <header className="panel-head"><h2>Blocks</h2><div className="panel-actions"><Btn onClick={rerun}>Run again</Btn></div></header>
        {steps.length === 0 && <p className="help">No blocks. The output is the input. Add a block below.</p>}
        <ol className="steps">
          {steps.map((s, i) => {
            const d = blockById(s.b)!; const r = results[i];
            return (
              <li key={s.uid} className={`step ${error?.index === i ? "step-err" : ""} ${dragFrom === i ? "dragging" : ""}`}
                onDragOver={(e) => { if (dragFrom !== null) e.preventDefault(); }}
                onDrop={() => { if (dragFrom !== null) move(dragFrom, i); setDragFrom(null); }}>
                <div className="step-head">
                  <span className="grip" draggable aria-hidden="true" title="Drag to reorder" onDragStart={() => setDragFrom(i)} onDragEnd={() => setDragFrom(null)}>⠿</span>
                  <span className="step-n mono">{i + 1}</span>
                  <strong className="step-title">{d.name}</strong>
                  <span className="step-ms mono">{r ? `${r.ms < 1 ? "<1" : Math.round(r.ms)} ms` : ""}</span>
                  <span className="step-actions">
                    <Btn aria-label={`Move ${d.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>Up</Btn>
                    <Btn aria-label={`Move ${d.name} down`} disabled={i === steps.length - 1} onClick={() => move(i, i + 1)}>Down</Btn>
                    <Btn aria-label={`Show output after ${d.name}`} onClick={() => setPeek(peek === i ? null : i)}>{peek === i ? "Hide" : "Peek"}</Btn>
                    <Btn aria-label={`Remove ${d.name}`} onClick={() => { setSteps(steps.filter((_, k) => k !== i)); setPeek(null); }}>Remove</Btn>
                  </span>
                </div>
                <p className="help">{d.description}</p>
                <ParamControls idPrefix={s.uid} defs={d.params} values={s.p} onChange={(p) => setP(i, p)} />
                {r && !r.ok && <p role="alert" className="note-error">{r.error}</p>}
                {peek === i && r?.ok && <pre className="mono text-out peek">{r.out}</pre>}
              </li>
            );
          })}
        </ol>
        <details className="adder">
          <summary className="btn btn-primary">Add a block</summary>
          <input className="mono" type="search" placeholder="Filter blocks" aria-label="Filter blocks" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {CATEGORIES.map((c) => {
            const list = filtered.filter((b) => b.category === c);
            if (!list.length) return null;
            return (
              <div key={c}>
                <h3 className="cat-h">{c}</h3>
                <ul className="ledger">{list.map((b) => (
                  <li key={b.id} className="ledger-row"><button type="button" className="row-btn" onClick={() => { setSteps([...steps, mk(b.id)]); setPeek(null); }}><span className="tool-name">{b.name}</span><span className="tool-blurb">{b.description}</span></button></li>
                ))}</ul>
              </div>
            );
          })}
        </details>
      </section>

      <section className="panel">
        <header className="panel-head"><h2>Output</h2><div className="panel-actions"><CopyBtn text={output} /><DownloadBtn data={output} name={isSvg ? "output.svg" : "output.txt"} type={isSvg ? "image/svg+xml" : "text/plain"} /></div></header>
        <ErrorNote error={error ? `Block ${error.index + 1} (${blockById(steps[error.index]?.b)?.name ?? "?"}): ${error.message}` : null} />
        {isSvg && !error && /* eslint-disable-next-line @next/next/no-img-element */ <img className="preview-img" alt="SVG output" src={`data:image/svg+xml;utf8,${encodeURIComponent(output)}`} />}
        <pre className="mono text-out" data-testid="output" aria-live="polite" tabIndex={0}>{output}</pre>
      </section>

      <section className="panel">
        <header className="panel-head"><h2>Saved in this browser</h2></header>
        {saved.length === 0 ? <p className="help">Nothing saved yet. Saved tools stay in this browser only.</p> : (
          <ul className="ledger">{saved.map((s) => (
            <li key={s.id} className="ledger-row file-row"><span className="mono file-name">Boring {s.name}</span>
              <Btn onClick={() => apply(s.recipe)}>Open</Btn>
              <Btn aria-label={`Delete ${s.name}`} onClick={() => { const n = saved.filter((x) => x.id !== s.id); setSaved(n); storeSaved(n); }}>Delete</Btn></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}

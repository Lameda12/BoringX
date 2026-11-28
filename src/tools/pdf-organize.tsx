import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ToolMeta } from "@/engine/types";
import { Btn, DownloadBtn, ErrorNote, FileDrop, Panel, Progress, useJob } from "@/components/kit";
import { openPdf, renderPageToBlob } from "@/lib/pdf";
import { exportPages, initialPages, movePage, rotatePages, type PageItem } from "@/lib/pdf-organize";
import { samplePdf } from "@/lib/samples";
import { baseName, fmtBytes } from "@/lib/util";

export const meta: ToolMeta = {
  slug: "pdf-organize", name: "PDF Organize", category: "PDF",
  blurb: "Rotates and reorders pages. Text stays text.",
  description: "Rotate and reorder PDF pages in your browser, then export without turning them into images. No upload.",
  keywords: ["pdf", "rotate pdf", "reorder pages", "rearrange", "organize", "sideways scan"],
};

const THUMB_PX = 200;

export default function Tool() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [thumbError, setThumbError] = useState(false);
  const [out, setOut] = useState<{ blob: Blob; name: string } | null>(null);
  const [said, setSaid] = useState({ text: "", n: 0 });
  const job = useJob();
  const latestLoad = useRef(0);
  const edits = useRef(0);
  const list = useRef<HTMLOListElement>(null);
  const refocus = useRef<{ src: number; by: -1 | 1 } | null>(null);

  const edit = (next: PageItem[], message: string) => { edits.current++; setPages(next); setOut(null); setSaid((s) => ({ text: message, n: s.n + 1 })); };

  const load = (f: File) => {
    const id = ++latestLoad.current;
    return job.run(async () => {
      const { PDFDocument } = await import("pdf-lib");
      let count: number;
      try { count = (await PDFDocument.load(await f.arrayBuffer())).getPageCount(); }
      catch { if (id !== latestLoad.current) return; throw new Error(`"${f.name}" could not be read as a PDF. It may be encrypted or damaged.`); }
      if (id !== latestLoad.current) return;
      if (!count) throw new Error(`"${f.name}" has no pages.`);
      setFile(f); setSelected(new Set()); setThumbs({}); setThumbError(false);
      edit(initialPages(count), "");
    });
  };
  useEffect(() => { samplePdf("Sample", 3).then((f) => { if (!latestLoad.current) load(f); }); }, []); // eslint-disable-line

  // Previews are drawn only for pages near the viewport, so long documents stay usable.
  useEffect(() => {
    if (!file) return;
    let stale = false;
    let drawing = false;
    const urls: string[] = [];
    const wanted = new Set<number>();
    const drawn = new Set<number>();
    const opened = openPdf(file);
    const failed = () => { if (!stale) setThumbError(true); };
    opened.catch(failed);
    const draw = async () => {
      if (drawing) return;
      drawing = true;
      try {
        const doc = await opened;
        for (const src of wanted) {
          if (stale) break;
          wanted.delete(src);
          drawn.add(src);
          try {
            const { width, height } = (await doc.getPage(src + 1)).getViewport({ scale: 1 });
            const { blob } = await renderPageToBlob(doc, src + 1, THUMB_PX / Math.max(width, height), "image/png");
            if (stale) break;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            setThumbs((t) => ({ ...t, [src]: url }));
          } catch { failed(); }
        }
      } catch { /* reported by opened.catch */ }
      drawing = false;
    };
    const near = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const src = Number((e.target as HTMLElement).dataset.src);
        if (!e.isIntersecting) wanted.delete(src);
        else if (!drawn.has(src)) wanted.add(src);
      }
      draw();
    }, { rootMargin: "400px" });
    list.current?.querySelectorAll("[data-src]").forEach((el) => near.observe(el));
    return () => {
      stale = true;
      near.disconnect();
      urls.forEach((u) => URL.revokeObjectURL(u));
      opened.then((doc) => doc.loadingTask.destroy()).catch(() => {});
    };
  }, [file]);

  // Reordering moves DOM nodes, which drops focus. Put it back on the page that moved.
  useLayoutEffect(() => {
    const want = refocus.current;
    if (!want) return;
    refocus.current = null;
    const find = (by: number) => list.current?.querySelector<HTMLButtonElement>(`[data-move="${want.src}:${by}"]:not(:disabled)`);
    (find(want.by) ?? find(-want.by))?.focus();
  }, [pages]);

  const move = (i: number, by: -1 | 1) => {
    const { src } = pages[i];
    refocus.current = { src, by };
    edit(movePage(pages, i, by), `Page ${src + 1} moved to position ${i + by + 1} of ${pages.length}.`);
  };
  const rotate = (by: 90 | -90) => {
    const next = rotatePages(pages, selected, by);
    const one = selected.size === 1 ? next.find((p) => selected.has(p.src)) : undefined;
    const way = by > 0 ? "right" : "left";
    edit(next, one ? `Page ${one.src + 1} rotated ${way}, now at ${one.turn}°.` : `${selected.size} pages rotated ${way}.`);
  };
  const toggle = (src: number) => {
    const next = new Set(selected);
    if (!next.delete(src)) next.add(src);
    setSelected(next);
  };

  // The button stays enabled while working so that keyboard focus is not thrown away.
  const build = () => !job.busy && job.run(async () => {
    if (!file) throw new Error("Choose a PDF first.");
    const version = edits.current;
    const bytes = await exportPages(await file.arrayBuffer(), pages);
    if (version !== edits.current) return; // edited while saving: this output is already out of date
    setOut({ blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), name: `${baseName(file.name)}-organized.pdf` });
  });

  return (
    <div className="stack">
      <Panel title="File">
        <FileDrop multiple={false} accept="application/pdf,.pdf" onFiles={(f) => load(f[0])} hint={file ? `${file.name}, ${pages.length} page${pages.length === 1 ? "" : "s"}` : undefined} />
      </Panel>
      <Panel title="Pages">
        <div className="row">
          <Btn disabled={!pages.length} onClick={() => setSelected(new Set(pages.map((p) => p.src)))}>Select all</Btn>
          <Btn disabled={!pages.length} onClick={() => setSelected(new Set())}>Select none</Btn>
          <Btn disabled={!selected.size} onClick={() => rotate(-90)}>Rotate left</Btn>
          <Btn disabled={!selected.size} onClick={() => rotate(90)}>Rotate right</Btn>
          <Btn disabled={!pages.length} onClick={() => edit(initialPages(pages.length), "Original order and rotation restored.")}>Reset</Btn>
        </div>
        <p className="help">Tick pages to rotate them. Earlier and Later change the order.</p>
        {thumbError && <p className="help">Some previews could not be drawn. Reordering, rotating and export still work.</p>}
        {/* A fresh child each time, so a repeated message is announced again. */}
        <p className="sr-only" role="status"><span key={said.n}>{said.text}</span></p>
        <ol ref={list} className="thumbs page-list" aria-label="Pages in export order">
          {pages.map((p, i) => (
            <li key={p.src} className="thumb">
              <div className="page-box" data-src={p.src}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumbs[p.src] && <img src={thumbs[p.src]} alt={`Preview of page ${p.src + 1}`} style={{ transform: `rotate(${p.turn}deg)` }} />}
              </div>
              <label className="check">
                <input type="checkbox" checked={selected.has(p.src)} onChange={() => toggle(p.src)} />
                <span className="mono">Page {p.src + 1}</span>
              </label>
              <span className="field-help">{p.turn ? `Rotated ${p.turn}°` : "As in file"}</span>
              <div className="row">
                <Btn data-move={`${p.src}:-1`} aria-label={`Move page ${p.src + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>Earlier</Btn>
                <Btn data-move={`${p.src}:1`} aria-label={`Move page ${p.src + 1} later`} disabled={i === pages.length - 1} onClick={() => move(i, 1)}>Later</Btn>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="Result">
        <p className="help">Pages are moved, not turned into images, so text stays selectable and links and form fields stay. A digitally signed file will no longer verify.</p>
        <ErrorNote error={job.error} />
        <Progress value={job.progress} label="Working" />
        <div className="row">
          <Btn primary disabled={!pages.length} aria-busy={job.busy} onClick={build}>Make PDF</Btn>
          {out && <DownloadBtn primary data={out.blob} name={out.name} label={`Download ${out.name} (${fmtBytes(out.blob.size)})`} />}
        </div>
      </Panel>
    </div>
  );
}

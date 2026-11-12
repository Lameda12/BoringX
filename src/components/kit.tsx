"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { copyText } from "@/lib/clipboard";
import { resultStatus } from "@/lib/status";
import { download as dl, fmtBytes } from "@/lib/util";

export function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  const { primary, className = "", ...rest } = props;
  return <button type="button" {...rest} className={`btn ${primary ? "btn-primary" : ""} ${className}`} />;
}

export function Field({ label, children, help, className = "" }: { label: string; children: ReactNode; help?: string; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {help && <span className="field-help">{help}</span>}
    </label>
  );
}

export function ErrorNote({ error }: { error?: string | null }) {
  if (!error) return null;
  return <p role="alert" className="note-error">{error}</p>;
}

/**
 * Announced result status, kept separate from the result body so a long document is never
 * read out. Debounced, so typing through several inputs produces one announcement.
 */
export function ResultStatus({ output, error, delay = 500 }: { output: string; error?: string | null; delay?: number }) {
  const message = resultStatus({ output, error });
  const [live, setLive] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setLive(message), delay);
    return () => clearTimeout(t);
  }, [message, delay]);
  return <p className="sr-only" role="status">{live}</p>;
}

export function Progress({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return null;
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
      <span className="progress-text">{label ? `${label} ` : ""}{pct}%</span>
    </div>
  );
}

export function CopyBtn({ text, label = "Copy" }: { text: string | (() => string); label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Btn
      onClick={async () => {
        await copyText(typeof text === "function" ? text() : text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? "Copied" : label}
    </Btn>
  );
}

export function DownloadBtn({ data, name, type, label = "Download", primary }: { data: Blob | string | (() => Blob | string); name: string; type?: string; label?: string; primary?: boolean }) {
  return <Btn primary={primary} onClick={() => dl(typeof data === "function" ? data() : data, name, type)}>{label}</Btn>;
}

export function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="ledger-row stat">
      <span className="stat-k">{k}</span>
      <span className="stat-v mono">{v}</span>
    </div>
  );
}

/**
 * Drop zone: drag and drop, paste from clipboard, and file picker.
 * Paste works anywhere on the page while the tool is mounted.
 */
export function FileDrop({
  onFiles, accept, multiple = true, hint, children,
}: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; hint?: string; children?: ReactNode }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cb = useRef(onFiles);
  cb.current = onFiles;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        cb.current(multiple ? files : files.slice(0, 1));
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [multiple]);

  const handle = useCallback((list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }, [onFiles, multiple]);

  return (
    <div
      className={`drop ${over ? "drop-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
    >
      <input
        ref={inputRef} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { handle(e.target.files); e.target.value = ""; }}
        data-testid="file-input"
      />
      <p className="drop-title">Drop {multiple ? "files" : "a file"} here, paste, or</p>
      <Btn primary onClick={() => inputRef.current?.click()}>Choose {multiple ? "files" : "a file"}</Btn>
      {hint && <p className="drop-hint">{hint}</p>}
      {children}
    </div>
  );
}

export function FileList({ files, onRemove, onMove }: { files: File[]; onRemove?: (i: number) => void; onMove?: (i: number, d: -1 | 1) => void }) {
  if (!files.length) return null;
  return (
    <ul className="ledger" aria-label="Selected files">
      {files.map((f, i) => (
        <li key={i} className="ledger-row file-row">
          <span className="mono file-name">{f.name}</span>
          <span className="file-size">{fmtBytes(f.size)}</span>
          {onMove && <Btn aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => onMove(i, -1)}>Up</Btn>}
          {onMove && <Btn aria-label={`Move ${f.name} down`} disabled={i === files.length - 1} onClick={() => onMove(i, 1)}>Down</Btn>}
          {onRemove && <Btn aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)}>Remove</Btn>}
        </li>
      ))}
    </ul>
  );
}

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head"><h2>{title}</h2><div className="panel-actions">{actions}</div></header>
      {children}
    </section>
  );
}

/** Runs an async job with progress + error handling. */
export function useJob() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: (p: (v: number) => void) => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError(null); setProgress(0);
    try { return await fn((v) => setProgress(v)); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); setProgress(null); }
  }, []);
  return { busy, progress, error, setError, run };
}

/** Blob URL that is revoked automatically. */
export function useObjectUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** Download whose content is produced asynchronously (e.g. rasterising an SVG). */
export function AsyncDownloadBtn({ make, name, label, primary }: { make: () => Promise<Blob>; name: string; label: string; primary?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Btn primary={primary} onClick={async () => { try { setErr(null); dl(await make(), name); } catch (e) { setErr(e instanceof Error ? e.message : "Download failed."); } }}>{label}</Btn>
      {err && <span role="alert" className="note-error">{err}</span>}
    </>
  );
}

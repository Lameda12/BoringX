import { useEffect, useState } from "react";
import type { ToolMeta } from "@/engine/types";
import { Btn, CopyBtn, DownloadBtn, ErrorNote, FileDrop, Panel, Progress, ResultStatus, useJob, useObjectUrl } from "@/components/kit";
import { sampleTextImage } from "@/lib/samples";

export const meta: ToolMeta = {
  slug: "ocr", name: "OCR", category: "Files",
  blurb: "Reads text out of an image. English, on your device.",
  description: "Extract text from images (OCR) in your browser with Tesseract. English language. No upload; the engine and language data are served from this site.",
  keywords: ["ocr", "image to text", "tesseract", "extract text", "scan", "text recognition"],
};

export default function Tool() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [conf, setConf] = useState<number | null>(null);
  const [stage, setStage] = useState("");
  const job = useJob();
  const url = useObjectUrl(file);
  useEffect(() => { sampleTextImage().then(setFile); }, []);

  const run = () => job.run(async (progress) => {
    if (!file) throw new Error("Choose an image first.");
    setText(""); setConf(null); setStage("Starting the engine");
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js", corePath: "/tesseract/core/", langPath: "/tesseract/lang/", workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => { setStage(m.status); if (m.status === "recognizing text") progress(m.progress); },
    }).catch((e: unknown) => { throw new Error(`The OCR engine did not start: ${e instanceof Error ? e.message : "unknown error"}.`); });
    try {
      const r = await worker.recognize(file);
      setText(r.data.text.trim()); setConf(Math.round(r.data.confidence));
      if (!r.data.text.trim()) throw new Error("No text was found. Try a sharper, higher-contrast image with dark text on a light background.");
    } finally { await worker.terminate(); }
  });

  return (
    <div className="stack">
      <Panel title="Image"><FileDrop multiple={false} accept="image/*" onFiles={(f) => { setFile(f[0]); setText(""); }} hint={file?.name} />{url && /* eslint-disable-next-line @next/next/no-img-element */ <img className="preview-img" src={url} alt="Source image" />}</Panel>
      <Panel title="Text" actions={<><Btn primary disabled={job.busy || !file} onClick={run}>Read text</Btn>{text && <><CopyBtn text={text} /><DownloadBtn data={text} name="ocr.txt" type="text/plain" /></>}</>}>
        <ErrorNote error={job.error} />
        {job.busy && <p className="help" aria-live="polite">{stage}</p>}
        <Progress value={job.progress} label="Recognising" />
        <pre className="mono text-out" data-testid="output">{text}</pre>
        <ResultStatus output={text} error={job.error} />
        {conf !== null && <p className="meter">Confidence {conf}%</p>}
      </Panel>
    </div>
  );
}

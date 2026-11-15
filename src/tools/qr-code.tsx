import type { BlockDef, ToolMeta } from "@/engine/types";
import { num, sel } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";
import { AsyncDownloadBtn } from "@/components/kit";
import { canvasToBlob, loadImage } from "@/lib/util";

export const meta: ToolMeta = {
  slug: "qr-code", name: "QR Code", category: "Generate",
  blurb: "Makes a QR code from text or a link. SVG or PNG.",
  description: "Generate QR codes from text or URLs in your browser and download them as SVG or PNG. No tracking, no expiry.",
  keywords: ["qr", "qr code", "barcode", "link", "generate"],
  recipe: { name: "QR Code", input: "https://boringx.vercel.app", steps: [{ b: "qr-svg", p: { ecc: "M", margin: 2 } }] },
};

export const blocks: BlockDef[] = [{
  id: "qr-svg", name: "QR code (SVG)", category: "Generate", description: "Outputs an SVG QR code for the input text.",
  params: [sel("ecc", "Error correction", [["L", "Low"], ["M", "Medium"], ["Q", "Quartile"], ["H", "High"]], "M"), num("margin", "Margin (modules)", 2, 0, 10)],
  run: async (input, p) => {
    if (!input.trim()) throw new Error("Enter some text or a URL to encode.");
    const QR = await import("qrcode");
    try { return await QR.toString(input, { type: "svg", errorCorrectionLevel: String(p.ecc) as "L", margin: Number(p.margin) }); }
    catch { throw new Error("That is too much data for a QR code. Shorten the text or lower the error correction."); }
  },
}];

const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
async function svgToPng(svg: string, size = 1024) {
  const img = await loadImage(svgUrl(svg));
  const c = document.createElement("canvas"); c.width = c.height = size;
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, size, size);
  return canvasToBlob(c, "image/png");
}

export default toolFromRecipe(meta.recipe!, blocks, {
  inputLabel: "Text or URL", outputLabel: "QR code", outputName: "qr.svg", inputRows: 3,
  renderOutput: (svg) => <img className="qr" alt="QR code" width={240} height={240} src={svgUrl(svg)} />,
  extra: (svg, ok) => <AsyncDownloadBtn disabled={!ok} label="PNG" name="qr.png" make={() => svgToPng(svg)} />,
});

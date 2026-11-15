import type { BlockDef, ToolMeta } from "@/engine/types";
import { num, text } from "@/engine/p";
import { toolFromRecipe } from "@/components/toolFromRecipe";
import { AsyncDownloadBtn } from "@/components/kit";
import { canvasToBlob, loadImage } from "@/lib/util";

export const meta: ToolMeta = {
  slug: "placeholder-image", name: "Placeholder Image", category: "Generate",
  blurb: "A flat rectangle with its size written on it. SVG or PNG.",
  description: "Generate placeholder images of any size and colour, as SVG or PNG, without requesting them from a server.",
  keywords: ["placeholder", "dummy image", "image", "size", "mock", "svg"],
  recipe: { name: "Placeholder Image", input: "", steps: [{ b: "placeholder-svg", p: { width: 800, height: 450, bg: "#cfcdc6", fg: "#3b3b38" } }] },
};

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export const blocks: BlockDef[] = [{
  id: "placeholder-svg", name: "Placeholder image (SVG)", category: "Generate", description: "Input text is the label (blank shows the size).",
  params: [num("width", "Width", 800, 1, 8000), num("height", "Height", 450, 1, 8000), text("bg", "Background", "#cfcdc6"), text("fg", "Text colour", "#3b3b38")],
  run: (input, p) => {
    const w = Math.floor(Number(p.width)), h = Math.floor(Number(p.height));
    if (!(w > 0 && h > 0)) throw new Error("Width and height must be positive numbers.");
    const color = /^#[0-9a-f]{3,8}$|^[a-z]+$/i;
    if (!color.test(String(p.bg)) || !color.test(String(p.fg))) throw new Error("Colours must be hex like #cccccc or a colour name like grey.");
    const label = esc(input.trim() || `${w} x ${h}`);
    const fs = Math.max(10, Math.min(w / Math.max(6, label.length * 0.62), h / 4));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${p.bg}"/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="${p.fg}" stroke-opacity=".15"/><text x="50%" y="50%" fill="${p.fg}" font-family="monospace" font-size="${fs.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${label}</text></svg>`;
  },
}];

const url = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
export default toolFromRecipe(meta.recipe!, blocks, {
  inputLabel: "Label (blank shows size)", inputRows: 1, outputLabel: "Image", outputName: "placeholder.svg",
  renderOutput: (svg) => <img className="preview-img" alt="Placeholder" src={url(svg)} />,
  extra: (svg, ok) => <AsyncDownloadBtn disabled={!ok} label="PNG" name="placeholder.png" make={async () => {
    const img = await loadImage(url(svg));
    const c = document.createElement("canvas"); c.width = img.naturalWidth || 800; c.height = img.naturalHeight || 450;
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return canvasToBlob(c, "image/png");
  }} />,
});

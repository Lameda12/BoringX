// Renders 1200x630 OG cards as PNG for every tool, the sandbox and the home page.
// Existing files are kept, so only new tools get rendered. Delete public/og to redo all.
import sharp from "sharp";
import fs from "node:fs";

const tools = JSON.parse(fs.readFileSync("src/generated/tools.json", "utf8"));
const esc = (s) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
const wrap = (s, n) => { const out = []; let line = ""; for (const w of s.split(" ")) { if ((line + " " + w).trim().length > n) { out.push(line); line = w; } else line = (line + " " + w).trim(); } if (line) out.push(line); return out.slice(0, 3); };
const card = (title, sub, tag) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#e9e8e4"/>
<rect x="40" y="40" width="1120" height="550" fill="#f3f2ee" stroke="#1c1c1a" stroke-width="3"/>
${[150, 250, 350, 450, 530].map((y) => `<line x1="40" y1="${y}" x2="1160" y2="${y}" stroke="#b4b2aa" stroke-width="1.5"/>`).join("")}
<text x="80" y="110" font-family="DejaVu Sans Mono, Liberation Mono, monospace" font-size="34" font-weight="700" fill="#1c1c1a">BoringX</text>
<text x="1120" y="110" font-family="DejaVu Sans Mono, Liberation Mono, monospace" font-size="26" text-anchor="end" fill="#55554f">${esc(tag.toUpperCase())}</text>
<text x="80" y="290" font-family="DejaVu Sans Mono, Liberation Mono, monospace" font-size="72" font-weight="700" fill="#1f3fa8">Boring</text>
<text x="80" y="385" font-family="DejaVu Sans Mono, Liberation Mono, monospace" font-size="${title.length > 18 ? 60 : 78}" font-weight="700" fill="#1c1c1a">${esc(title)}</text>
${wrap(sub, 56).map((l, i) => `<text x="80" y="${440 + i * 36}" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="28" fill="#55554f">${esc(l)}</text>`).join("")}
<text x="80" y="565" font-family="DejaVu Sans Mono, Liberation Mono, monospace" font-size="24" fill="#1c1c1a">Nothing is uploaded.</text>
</svg>`;
const jobs = [["home", "Tools", "Small tools that each do one dull job.", "free, private"], ["sandbox", "Sandbox", "Chain blocks into your own tool.", "build"], ...tools.map((t) => [t.slug, t.name, t.blurb, t.category])];
fs.mkdirSync("public/og", { recursive: true });
let n = 0;
for (const [slug, title, sub, tag] of jobs) {
  const f = `public/og/${slug}.png`;
  if (fs.existsSync(f)) continue;
  await sharp(Buffer.from(card(title, sub, tag))).png({ compressionLevel: 9, palette: true }).toFile(f); n++;
}
console.log(`og: rendered ${n}, total ${jobs.length}`);

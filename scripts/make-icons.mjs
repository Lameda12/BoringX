import sharp from "sharp";
import fs from "node:fs";
const svg = fs.readFileSync("public/icon.svg");
const out = async (name, size, pad = 0) => {
  const inner = Math.round(size * (1 - pad * 2));
  const img = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#e9e8e4" } }).composite([{ input: img, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }]).png().toFile(`public/${name}`);
};
await out("icon-192.png", 192); await out("icon-512.png", 512); await out("icon-maskable-512.png", 512, 0.12); await out("apple-touch-icon.png", 180);

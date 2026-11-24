// Tiny static server for out/ that applies vercel.json headers and cleanUrls, so local tests match production.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("out");
const port = Number(process.env.PORT || 4173);
const cfg = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const rules = (cfg.headers || []).map((r) => ({ re: new RegExp("^" + r.source.replace(/\(\.\*\)/g, ".*") + "$"), headers: r.headers }));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain", ".xml": "application/xml", ".gz": "application/gzip", ".ico": "image/x-icon" };

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end("Bad request"); }
  const cands = [p, p + ".html", path.join(p, "index.html")];
  let file = cands.map((c) => path.join(root, c)).find((f) => f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile());
  const h = {};
  for (const r of rules) if (r.re.test(p)) for (const x of r.headers) h[x.key] = x.value;
  if (!file) { const nf = path.join(root, "404.html"); res.writeHead(404, { ...h, "content-type": "text/html" }); return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "Not found"); }
  res.writeHead(200, { ...h, "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving out/ on http://localhost:${port}`));

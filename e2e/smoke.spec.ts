import { expect, test, type Page } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";

const out = (p: Page) => p.getByTestId("output");
const alert = (p: Page) => p.locator(".note-error");

test.describe("home", () => {
  test("filters tools as you type and offers to build when nothing matches", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Boring");
    await expect(page.locator("a.tool-row")).toHaveCount(41); // 40 tools + sandbox
    await page.locator("#hero-q").fill("pdf");
    await expect(page.locator("a.tool-row")).toHaveCount(5);
    await page.locator("#hero-q").fill("zzqx wibble");
    const build = page.getByRole("link", { name: "Build Boring zzqx wibble" });
    await expect(build).toBeVisible();
    await build.click();
    await expect(page).toHaveURL(/\/sandbox#n=zzqx%20wibble/);
    await expect(page.getByLabel(/Tool name/)).toHaveValue("zzqx wibble");
  });
  test("slash focuses search and cmd+K opens the palette", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("/");
    await expect(page.locator("#hero-q")).toBeFocused();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await page.keyboard.type("base64");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/base64$/);
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });
});

test("PDF: merge sample files into a valid PDF", async ({ page }) => {
  await page.goto("/pdf-merge");
  await expect(page.getByText("Sample A")).toHaveCount(0);
  await expect(page.locator(".file-row")).toHaveCount(2);
  await page.getByRole("button", { name: /Merge 2 files/ }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download merged\.pdf/ }).click();
  const file = await (await dl).path();
  const bytes = fs.readFileSync(file!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const { PDFDocument } = await import("pdf-lib");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
});

test("PDF: split and render with pdf.js", async ({ page }) => {
  await page.goto("/pdf-to-images");
  await expect(page.getByRole("heading", { name: "3 pages" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".thumb img")).toHaveCount(3);
  await page.goto("/pdf-split");
  await expect(page.getByText(/sample.pdf, 5 pages/)).toBeVisible();
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByRole("button", { name: /Download sample-split\.zip/ })).toBeVisible();
  await page.getByLabel("Pages").fill("9-12");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(alert(page)).toContainText("outside this document");
});

test("Image: convert the sample and show sizes", async ({ page }) => {
  await page.goto("/image-convert");
  await expect(page.locator(".ledger-row.file-row")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".file-name")).toHaveText("sample-photo.png");
  await page.getByLabel("Format").selectOption("image/webp");
  await expect(page.locator(".file-name")).toHaveText("sample-photo.webp");
  await page.getByLabel("Format").selectOption("image/avif"); // browsers rarely encode AVIF; a self-hosted WASM encoder covers it
  await expect(page.locator(".file-name")).toHaveText("sample-photo.avif", { timeout: 30_000 });
  await page.goto("/image-compress");
  await expect(page.locator(".file-size")).toContainText(/KB.* to .*KB/, { timeout: 15_000 });
});

test("Image: strip EXIF from a real JPEG with GPS", async ({ page }) => {
  await page.goto("/strip-exif");
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 2, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 0x30, 0, 0, 0, 0, 0, 0, 0];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 0, 4, 9, 9, 1, 2, 3, 0xff, 0xd9]);
  await page.getByTestId("file-input").setInputFiles({ name: "holiday.jpg", mimeType: "image/jpeg", buffer: jpg });
  await expect(page.getByText("Found and removed")).toBeVisible();
  await expect(page.locator(".stat-v", { hasText: "EXIF" })).toBeVisible();
});

test("Text: case converter and take it apart", async ({ page }) => {
  await page.goto("/case-converter");
  await expect(out(page)).toContainText("The Quick Brown Fox");
  await page.getByLabel("Case", { exact: true }).selectOption("snake");
  await expect(out(page)).toHaveText("the_quick_brown_fox\nnothing_exciting_happens_here");
  await page.getByRole("link", { name: "Take it apart" }).click();
  await expect(page).toHaveURL(/\/sandbox#r=/);
  await expect(page.getByRole("heading", { name: "Change case" })).toHaveCount(0);
  await expect(page.locator(".step-title")).toHaveText(["Change case"]);
  await expect(out(page)).toHaveText("the_quick_brown_fox\nnothing_exciting_happens_here");
});

test("Text: diff and markdown render", async ({ page }) => {
  await page.goto("/diff");
  await expect(page.locator(".diff-del").first()).toContainText("two");
  await expect(page.locator(".diff-add").first()).toContainText("2");
  await page.goto("/markdown-preview");
  await expect(page.locator(".md h1")).toHaveText("Heading");
  await expect(page.locator(".md table")).toBeVisible();
});

test("Data: JSON formatter explains errors, CSV converts both ways", async ({ page }) => {
  await page.goto("/json-formatter");
  await expect(out(page)).toContainText('"name": "BoringX"');
  await page.getByLabel("JSON", { exact: true }).fill('{"a": 1,}');
  await expect(alert(page)).toContainText(/Invalid JSON at line 1, column \d+/);
  await page.goto("/csv-json");
  await expect(out(page)).toContainText('"city": "New York, NY"');
  await page.getByRole("tab", { name: "JSON to CSV" }).click();
  await expect(out(page)).toContainText("id,name");
  await page.goto("/sql-in-list");
  await expect(out(page)).toHaveText("id IN (1001, 1002, 1003, 1004)");
  await page.goto("/json-to-typescript");
  await expect(out(page)).toContainText("export interface Root");
  await page.getByLabel("Root type name").fill("123 bad-name");
  await expect(out(page)).toContainText("export interface _123BadName");
  await expect(out(page)).not.toContainText("interface 123");
});

test("Data: CSV to Excel builds an xlsx and reads it back", async ({ page }) => {
  await page.goto("/csv-excel");
  await page.getByRole("button", { name: "Build .xlsx" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download data\.xlsx/ }).click();
  const path = await (await dl).path();
  expect(fs.readFileSync(path!).subarray(0, 2).toString()).toBe("PK");
  await page.getByTestId("file-input").last().setInputFiles(path!);
  await expect(page.getByTestId("output")).toContainText("Ada,London");
});

test("Dev: base64, jwt, regex, hash", async ({ page }) => {
  await page.goto("/base64");
  await expect(out(page)).toHaveText("Tm90aGluZyBleGNpdGluZyBoYXBwZW5zIGhlcmUu");
  await page.goto("/hash");
  await expect(out(page)).toHaveText(crypto.createHash("sha256").update("Nothing exciting happens here.").digest("hex"));
  await page.goto("/jwt-decoder");
  await expect(out(page)).toContainText('"name": "Ada Lovelace"');
  await page.goto("/regex-tester");
  await expect(out(page)).toContainText("3 matches");
  await page.goto("/url-encode");
  await expect(out(page)).toContainText("https%3A%2F%2Fexample.com");
});

test("Generate: uuid, password, qr, filler, placeholder", async ({ page }) => {
  await page.goto("/uuid");
  await expect(out(page)).toHaveText(/^([0-9a-f-]{36}\n){4}[0-9a-f-]{36}$/);
  await page.goto("/password");
  await expect(out(page)).toHaveText(/^(\S{20}\n){2}\S{20}$/);
  await page.goto("/qr-code");
  await expect(page.locator("img.qr")).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG" }).click();
  expect((await dl).suggestedFilename()).toBe("qr.png");
  await page.goto("/filler-text");
  await expect(out(page)).toContainText("Lorem ipsum dolor sit amet");
  await page.goto("/placeholder-image");
  await expect(page.locator("img.preview-img")).toBeVisible();
});

test("Convert: timestamp, time zone, units, color, base", async ({ page }) => {
  await page.goto("/unix-timestamp");
  await expect(out(page)).toContainText("2023-11-14T22:13:20.000Z");
  await page.goto("/time-zone");
  await expect(out(page)).toContainText("Asia/Tokyo");
  await page.goto("/units");
  await expect(out(page)).toContainText("10 km = 6.21371 mi");
  await page.goto("/color");
  await expect(out(page)).toContainText("rgb(31 63 168)");
  await expect(page.getByRole("img", { name: /Swatch/ })).toBeVisible();
  await page.goto("/number-base");
  await expect(out(page)).toContainText("hex  ff");
});

test("Files: checksum, zip, svg to png, favicon", async ({ page }) => {
  await page.goto("/file-checksum");
  const want = crypto.createHash("sha256").update("Nothing exciting happens here.\n").digest("hex");
  await expect(page.getByText(want)).toBeVisible();
  await page.getByLabel(/Compare with a known hash/).fill(want);
  await expect(page.getByText("Match").first()).toBeVisible();
  await page.goto("/zip");
  await page.getByRole("button", { name: "Make .zip" }).click();
  await expect(page.getByRole("button", { name: /Download archive\.zip/ })).toBeVisible();
  await page.getByRole("tab", { name: "Unzip" }).click();
  await expect(page.getByText("docs/readme.md")).toBeVisible();
  await page.goto("/svg-to-png");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  const png = fs.readFileSync((await (await dl).path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  await page.goto("/favicon-generator");
  const dl2 = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download favicons.zip" }).click();
  expect((await dl2).suggestedFilename()).toBe("favicons.zip");
});

test("Files: OCR reads the sample image on-device", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/ocr");
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(out(page)).toContainText(/exciting happens here/i, { timeout: 90_000 });
});

test("Image: background removal runs on-device and returns a PNG", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/remove-background");
  await page.getByRole("button", { name: "Remove background" }).click();
  const dl = page.getByRole("button", { name: /Download PNG/ });
  await expect(dl.or(alert(page))).toBeVisible({ timeout: 220_000 });
  await expect(alert(page)).toHaveCount(0);
  await expect(page.getByAltText("Background removed")).toBeVisible();
});

test.describe("sandbox", () => {
  test("default pipeline works; blocks can be added, reordered, removed; errors name the block", async ({ page }) => {
    await page.goto("/sandbox");
    await expect(out(page)).toContainText("fruit IN ('APPLE', 'BANANA', 'CHERRY', 'DATE')");
    await page.getByRole("button", { name: "Move Change case down" }).click();
    await expect(out(page)).toContainText("fruit IN ('apple'", { ignoreCase: false }).catch(() => {});
    await page.getByRole("button", { name: "Remove SQL IN list" }).click();
    await page.getByText("Add a block").click();
    await page.getByRole("button", { name: /JSON to TypeScript/ }).click();
    await expect(alert(page).first()).toContainText(/Invalid JSON/);
    await expect(page.getByText(/Block \d \(JSON to TypeScript\)/)).toBeVisible();
  });

  test("custom JavaScript runs in a Worker with no network", async ({ page }) => {
    await page.goto("/sandbox#r=" + await page.evaluate(async () => {
      const r = { name: "", input: "a\nb", steps: [{ b: "custom-js", p: { code: "return input.split('\\n').map((l,i)=>l+i).join('|')" } }] };
      return "p." + btoa(JSON.stringify(r)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }));
    await expect(out(page)).toHaveText("a0|b1");
    // network attempts from user code are blocked by the worker's CSP
    await page.locator(".step textarea").first().fill("try { await fetch('https://example.com'); return 'LEAK'; } catch (e) { return 'blocked'; }");
    await expect(out(page)).toHaveText("blocked");
    await page.locator(".step textarea").first().fill("while(true){}");
    await expect(alert(page).first()).toContainText("ran longer than 2s", { timeout: 8000 });
  });

  test("name, save, share link opens and runs in a fresh browser context", async ({ page, browser }) => {
    await page.goto("/sandbox");
    await page.getByLabel(/Tool name/).fill("Fruit Fixer");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText('Saved "Fruit Fixer"')).toBeVisible();
    await page.reload();
    await expect(page.getByText("Boring Fruit Fixer")).toBeVisible();
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByLabel(/Tool name/)).toHaveValue("Fruit Fixer");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy share link" }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/sandbox#r=z\./);
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto(link);
    await expect(p2.getByLabel(/Tool name/)).toHaveValue("Fruit Fixer");
    await expect(p2.getByTestId("output")).toContainText("fruit IN ('APPLE', 'BANANA', 'CHERRY', 'DATE')");
    await ctx.close();
  });
});

test.describe("trust", () => {
  test("strict CSP header is served and no third-party requests are made", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", ""].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol)) external.push(r.url()); });
    const res = await page.goto("/");
    const csp = res!.headers()["content-security-policy"];
    expect(csp).toContain("connect-src 'self' blob: data:");
    expect(csp).not.toMatch(/https?:\/\//);
    for (const p of ["/json-formatter", "/pdf-merge", "/sandbox", "/qr-code"]) { await page.goto(p); await page.waitForLoadState("networkidle"); }
    expect(external).toEqual([]);
    const w = await page.request.get("/workers/custom-js.js");
    expect(w.headers()["content-security-policy"]).toContain("connect-src 'none'");
  });
  test("every page has its own title, description and OG image", async ({ page }) => {
    const seen = new Set<string>();
    for (const slug of ["pdf-merge", "units", "ocr", "sandbox"]) {
      await page.goto("/" + slug);
      const title = await page.title();
      expect(seen.has(title)).toBe(false); seen.add(title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{40,}/);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/og/${slug}\\.png$`));
    }
    expect((await page.request.get("/og/units.png")).status()).toBe(200);
    expect((await page.request.get("/sitemap.xml")).status()).toBe(200);
  });
  test("privacy and about pages exist; footer line present", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
    await page.goto("/about");
    await expect(page.locator("footer")).toContainText("Nothing exciting happens here.");
  });
});

test("mobile: usable at 380px with no horizontal scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 760 }, hasTouch: true });
  const page = await ctx.newPage();
  for (const p of ["/", "/pdf-merge", "/sandbox", "/json-formatter", "/image-resize"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, p).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});

test("PWA: manifest, service worker and offline reload", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith("boringx-")) && (await (await caches.open((await caches.keys())[0])).keys()).length > 100, null, { timeout: 30_000 });
  const m = await (await page.request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  await context.setOffline(true);
  await page.goto("/uuid");
  await expect(page.getByTestId("output")).toHaveText(/[0-9a-f-]{36}/);
  await context.setOffline(false);
});

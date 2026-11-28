import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const items = (p: Page) => p.getByRole("list", { name: "Pages in export order" }).getByRole("listitem");
const names = (p: Page) => items(p).getByRole("checkbox").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).labels![0].textContent!.trim()));
const btn = (p: Page, name: string) => p.getByRole("button", { name, exact: true });

async function exportAndRead(page: Page) {
  await btn(page, "Make PDF").click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download sample-organized\.pdf/ }).click();
  const bytes = new Uint8Array(fs.readFileSync((await (await dl).path())!));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const out: { text: string; rotate: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const text = (await pg.getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join("").replace(/\s+/g, " ");
    out.push({ text: text.match(/Page \d of \d/)?.[0] ?? "", rotate: pg.rotate });
  }
  await task.destroy();
  return out;
}

test("PDF Organize: keyboard reorder and rotate, export keeps text", async ({ page }) => {
  await page.goto("/pdf-organize");
  await expect(items(page)).toHaveCount(3);
  await expect(items(page).locator("img")).toHaveCount(3, { timeout: 30_000 });
  await expect(btn(page, "Rotate right")).toBeDisabled();
  await expect(btn(page, "Move page 1 earlier")).toBeDisabled();
  await expect(btn(page, "Move page 3 later")).toBeDisabled();

  // Keyboard only: focus follows the page as it moves.
  await btn(page, "Move page 3 earlier").focus();
  await page.keyboard.press("Enter");
  expect(await names(page)).toEqual(["Page 1", "Page 3", "Page 2"]);
  await expect(btn(page, "Move page 3 earlier")).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await names(page)).toEqual(["Page 3", "Page 1", "Page 2"]);
  // "earlier" is now disabled, so focus lands on the other control for the same page.
  await expect(btn(page, "Move page 3 later")).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Page 3 moved to position 1 of 3");

  await page.getByRole("checkbox", { name: "Page 1" }).focus();
  await page.keyboard.press("Space");
  await btn(page, "Rotate right").focus();
  await page.keyboard.press("Enter");
  await expect(items(page).nth(1)).toContainText("Rotated 90°");
  await expect(items(page).nth(0)).not.toContainText("Rotated");

  expect(await exportAndRead(page)).toEqual([
    { text: "Page 3 of 3", rotate: 0 },
    { text: "Page 1 of 3", rotate: 90 },
    { text: "Page 2 of 3", rotate: 0 },
  ]);

  // Editing after export drops the now stale download.
  await btn(page, "Rotate left").click();
  await expect(page.getByRole("button", { name: /Download sample-organized/ })).toHaveCount(0);

  await btn(page, "Reset").click();
  expect(await names(page)).toEqual(["Page 1", "Page 2", "Page 3"]);
  await expect(items(page).filter({ hasText: "Rotated" })).toHaveCount(0);

  await btn(page, "Select all").click();
  await btn(page, "Rotate left").click();
  await expect(items(page).filter({ hasText: "Rotated 270°" })).toHaveCount(3);
  await btn(page, "Select none").click();
  await expect(btn(page, "Rotate left")).toBeDisabled();
});

test("PDF Organize: replaces the file, rejects a bad one, stays inside 380px", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 760 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/pdf-organize");
  await expect(items(page).locator("img")).toHaveCount(3, { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.getByTestId("file-input").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
  await expect(page.locator(".note-error")).toContainText('"broken.pdf" could not be read');
  await expect(items(page)).toHaveCount(3); // the previous document stays usable

  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]); doc.addPage([300, 200]);
  await page.getByTestId("file-input").setInputFiles({ name: "two.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
  await expect(items(page)).toHaveCount(2);
  await expect(page.getByText("two.pdf, 2 pages")).toBeVisible();
  await expect(page.locator(".note-error")).toHaveCount(0);
  await ctx.close();
});

test("PDF Organize: focus stays on the toolbar, repeats are announced, nothing leaves the browser", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["GET", "HEAD"].includes(r.method()) || r.postData() || u.search.includes("sample") || (!["localhost", ""].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol))) sent.push(`${r.method()} ${r.url()}`);
  });
  await page.goto("/pdf-organize");
  await expect(items(page)).toHaveCount(3);
  for (const name of ["Select all", "Select none", "Select all", "Reset", "Make PDF"]) {
    await btn(page, name).focus();
    await page.keyboard.press("Enter");
    await expect(btn(page, name)).toBeFocused();
  }
  const status = page.getByRole("status");
  await btn(page, "Rotate right").click();
  await expect(status).toContainText("3 pages rotated right");
  await status.evaluate((el) => {
    (window as unknown as { spoken: number }).spoken = 0;
    new MutationObserver(() => (window as unknown as { spoken: number }).spoken++).observe(el, { childList: true, subtree: true, characterData: true });
  });
  await btn(page, "Rotate right").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { spoken: number }).spoken)).toBeGreaterThan(0);
  await exportAndRead(page);
  expect(sent).toEqual([]);
});

test("PDF Organize: long documents draw previews as they come into view; empty ones are refused", async ({ page }) => {
  const { PDFDocument } = await import("pdf-lib");
  const long = await PDFDocument.create();
  for (let i = 0; i < 80; i++) long.addPage([200, 300]).drawLine({ start: { x: 0, y: 0 }, end: { x: 200, y: 300 } });
  const empty = await PDFDocument.create();
  const upload = async (name: string, bytes: Uint8Array) => page.getByTestId("file-input").setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(bytes) });

  await page.goto("/pdf-organize");
  await expect(items(page).locator("img")).toHaveCount(3, { timeout: 30_000 });
  await upload("long.pdf", await long.save());
  await expect(items(page)).toHaveCount(80);
  await expect(items(page).first().locator("img")).toBeVisible();
  await expect(items(page).last().locator("img")).toHaveCount(0);
  await items(page).last().scrollIntoViewIfNeeded();
  await expect(items(page).last().locator("img")).toBeVisible();

  await upload("empty.pdf", await empty.save({ addDefaultPage: false }));
  await expect(page.locator(".note-error")).toContainText('"empty.pdf" has no pages');
  await expect(items(page)).toHaveCount(80);
});

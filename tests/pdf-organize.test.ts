import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRef, StandardFonts, degrees } from "pdf-lib";
import { exportPages, initialPages, movePage, rotatePages } from "@/lib/pdf-organize";

/** One line of real text per page, so order and selectability can be read back. */
async function fixture(rotations: number[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  rotations.forEach((angle, i) => {
    const p = doc.addPage([420, 595]);
    p.drawText(`Page ${i + 1}`, { x: 40, y: 500, size: 18, font });
    p.setRotation(degrees(angle));
  });
  return doc.save();
}

async function read(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const out: { text: string; rotate: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const text = (await page.getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join("");
    out.push({ text, rotate: page.rotate });
  }
  await task.destroy();
  return out;
}

const order = (pages: { src: number }[]) => pages.map((p) => p.src);

describe("pdf organize: page list", () => {
  it("starts in document order with no added rotation", () => {
    expect(initialPages(3)).toEqual([{ src: 0, turn: 0 }, { src: 1, turn: 0 }, { src: 2, turn: 0 }]);
  });
  it("rotates only the selected pages and wraps in both directions", () => {
    const start = initialPages(3);
    const right = rotatePages(start, new Set([0, 2]), 90);
    expect(right.map((p) => p.turn)).toEqual([90, 0, 90]);
    expect(rotatePages(start, new Set([1]), -90).map((p) => p.turn)).toEqual([0, 270, 0]);
    const full = [90, 90, 90].reduce((pages) => rotatePages(pages, new Set([0, 2]), 90), right);
    expect(full.map((p) => p.turn)).toEqual([0, 0, 0]);
    expect(start.map((p) => p.turn)).toEqual([0, 0, 0]); // not mutated
  });
  it("moves a page one step and ignores moves past either end", () => {
    const start = initialPages(3);
    expect(order(movePage(start, 2, -1))).toEqual([0, 2, 1]);
    expect(order(movePage(start, 0, 1))).toEqual([1, 0, 2]);
    expect(order(movePage(start, 0, -1))).toEqual([0, 1, 2]);
    expect(order(movePage(start, 2, 1))).toEqual([0, 1, 2]);
    expect(order(start)).toEqual([0, 1, 2]); // not mutated
  });
});

describe("pdf organize: export", () => {
  it("writes pages in the new order with text still extractable", async () => {
    const src = await fixture([0, 0, 0]);
    const pages = movePage(movePage(initialPages(3), 2, -1), 1, -1);
    const out = await read(await exportPages(src, pages));
    expect(out.map((p) => p.text)).toEqual(["Page 3", "Page 1", "Page 2"]);
  });
  it("adds the turn to whatever rotation the page already had", async () => {
    const src = await fixture([90, 270, -90, 0]);
    let pages = rotatePages(initialPages(4), new Set([0, 1, 2]), 90);
    pages = movePage(pages, 3, -1); // rotation must follow its page, not its position
    const out = await read(await exportPages(src, pages));
    expect(out).toEqual([
      { text: "Page 1", rotate: 180 },
      { text: "Page 2", rotate: 0 },
      { text: "Page 4", rotate: 0 },
      { text: "Page 3", rotate: 0 },
    ]);
  });
  it("leaves the source bytes untouched", async () => {
    const src = await fixture([0, 0]);
    const before = Array.from(src);
    await exportPages(src, rotatePages(initialPages(2), new Set([0]), 90));
    expect(Array.from(src)).toEqual(before);
  });
  it("refuses to write an empty document", async () => {
    await expect(exportPages(await fixture([0]), [])).rejects.toThrow(/no pages/i);
  });
});

describe("pdf organize: export keeps the document, not just the pages", () => {
  it("keeps internal links pointing at the moved page, with no orphan copies", async () => {
    const doc = await PDFDocument.load(await fixture([0, 0, 0]));
    const [first, , third] = doc.getPages();
    first.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(doc.context.obj({
      Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 50], Dest: [third.ref, "Fit"],
    }))]));
    const out = await PDFDocument.load(await exportPages(await doc.save(), movePage(initialPages(3), 2, -1)));
    const pages = out.getPages(); // order: 1, 3, 2
    const link = pages[0].node.Annots()!.lookup(0) as unknown as { lookup(n: PDFName): PDFArray };
    expect(link.lookup(PDFName.of("Dest")).get(0) as PDFRef).toBe(pages[1].ref);
    const leaves = out.context.enumerateIndirectObjects().filter(([, o]) => String((o as { get?: (n: PDFName) => unknown }).get?.(PDFName.of("Type"))) === "/Page");
    expect(leaves).toHaveLength(3);
  });
  it("keeps title, author and filled form fields", async () => {
    const doc = await PDFDocument.load(await fixture([0, 0]));
    doc.setTitle("Lease"); doc.setAuthor("Office");
    const field = doc.getForm().createTextField("tenant");
    field.setText("Ada");
    field.addToPage(doc.getPage(1), { x: 40, y: 100, width: 120, height: 20 });
    const out = await PDFDocument.load(await exportPages(await doc.save(), movePage(initialPages(2), 1, -1)), { updateMetadata: false });
    expect(out.getTitle()).toBe("Lease");
    expect(out.getAuthor()).toBe("Office");
    expect(out.getForm().getTextField("tenant").getText()).toBe("Ada");
  });
  it("keeps size and rotation that a page inherited from a branch of the page tree", async () => {
    const doc = await PDFDocument.load(await fixture([0, 0]));
    const rootRef = doc.catalog.get(PDFName.of("Pages")) as PDFRef;
    const [a, b] = doc.getPages();
    const branch = doc.context.register(doc.context.obj({ Type: "Pages", Parent: rootRef, Kids: [b.ref], Count: 1, MediaBox: [0, 0, 200, 100], Rotate: 90 }));
    b.node.delete(PDFName.of("MediaBox")); b.node.delete(PDFName.of("Rotate")); b.node.setParent(branch);
    doc.catalog.Pages().set(PDFName.of("Kids"), doc.context.obj([a.ref, branch]));
    const out = await PDFDocument.load(await exportPages(await doc.save(), movePage(initialPages(2), 1, -1)));
    expect(out.getPage(0).getSize()).toEqual({ width: 200, height: 100 });
    expect(out.getPage(0).getRotation().angle).toBe(90);
  });
  it("does not choke on a rotation that is not a quarter turn", async () => {
    const doc = await PDFDocument.load(await fixture([0, 0]));
    for (const p of doc.getPages()) p.node.set(PDFName.of("Rotate"), PDFNumber.of(45));
    const bytes = await exportPages(await doc.save(), rotatePages(initialPages(2), new Set([0]), 90));
    const out = await PDFDocument.load(bytes);
    expect(out.getPage(0).getRotation().angle % 90).toBe(0);
    expect(out.getPage(1).getRotation().angle).toBe(45); // untouched pages stay as they were
  });
  it("only accepts a list that holds every page exactly once", async () => {
    const src = await fixture([0, 0]);
    await expect(exportPages(src, [{ src: 0, turn: 0 }])).rejects.toThrow(/every page/i);
    await expect(exportPages(src, [{ src: 0, turn: 0 }, { src: 0, turn: 0 }])).rejects.toThrow(/every page/i);
  });
});

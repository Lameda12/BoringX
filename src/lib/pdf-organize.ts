/** One page of the output: which source page, and the quarter turns added on top of its own rotation. */
export type PageItem = { src: number; turn: number };

const quarter = (angle: number) => ((angle % 360) + 360) % 360;

export const initialPages = (count: number): PageItem[] => Array.from({ length: count }, (_, src) => ({ src, turn: 0 }));

export const rotatePages = (pages: PageItem[], selected: ReadonlySet<number>, by: 90 | -90): PageItem[] =>
  pages.map((p) => (selected.has(p.src) ? { ...p, turn: quarter(p.turn + by) } : p));

/** Swaps the page at `index` with its neighbour. Moves past either end change nothing. */
export function movePage(pages: PageItem[], index: number, by: -1 | 1): PageItem[] {
  const to = index + by;
  if (index < 0 || index >= pages.length || to < 0 || to >= pages.length) return pages;
  const next = [...pages];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * Reorders the page tree of the loaded document. Pages are never rasterised or copied,
 * so text, links, bookmarks, form fields and metadata keep pointing at the same objects.
 */
export async function exportPages(source: ArrayBuffer | Uint8Array, pages: PageItem[]): Promise<Uint8Array> {
  if (!pages.length) throw new Error("There are no pages to export.");
  const { PDFDocument, PDFName, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(source, { updateMetadata: false });
  const all = doc.getPages();
  if (pages.length !== all.length || new Set(pages.map((p) => p.src)).size !== all.length || pages.some((p) => !all[p.src]))
    throw new Error("The new order must list every page exactly once.");

  // Pages may inherit these from branches of the tree, which is about to be flattened.
  for (const { node } of all)
    for (const key of ["Resources", "MediaBox", "CropBox", "Rotate"].map((k) => PDFName.of(k))) {
      const inherited = node.getInheritableAttribute(key);
      if (inherited) node.set(key, inherited);
    }

  const root = doc.catalog.Pages();
  const rootRef = doc.catalog.get(PDFName.of("Pages")) as (typeof all)[number]["ref"];
  for (const { src, turn } of pages) {
    const page = all[src];
    page.node.setParent(rootRef);
    // Some files carry angles that are not quarter turns; leave those alone unless this page was turned.
    if (turn) page.setRotation(degrees(quarter(Math.round(page.getRotation().angle / 90) * 90 + turn)));
  }
  root.set(PDFName.of("Kids"), doc.context.obj(pages.map((p) => all[p.src].ref)));
  root.set(PDFName.of("Count"), doc.context.obj(pages.length));
  return doc.save();
}

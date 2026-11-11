import type { BlockDef, ToolMeta } from "@/engine/types";
import { toolFromRecipe } from "@/components/toolFromRecipe";

export const meta: ToolMeta = {
  slug: "word-count", name: "Word Count", category: "Text",
  blurb: "Counts words, characters, sentences and reading time.",
  description: "Count words, characters, sentences, paragraphs and reading time. Punctuation, symbols and emoji do not count as words. Runs in your browser, nothing is uploaded.",
  keywords: ["words", "characters", "count", "length", "reading time"],
  recipe: {
    name: "Word Count",
    input: "The quick brown fox jumps over the lazy dog. Nothing exciting happens here.\n\nA second paragraph, for counting purposes.",
    steps: [{ b: "word-count", p: {} }],
  },
};

export function countText(s: string) {
  // Word-aware segmentation: punctuation, symbols and emoji are not word-like.
  // Counted as the iterator yields: a punctuation-heavy input produces one segment
  // per symbol, so holding them in an array costs as much memory as the input again.
  let words = 0;
  for (const seg of new Intl.Segmenter(undefined, { granularity: "word" }).segment(s)) if (seg.isWordLike) words += 1;
  // One pass over the code points keeps the astral counting the spread had without the arrays.
  let characters = 0, charactersNoSpaces = 0, newlines = 0;
  for (const ch of s) {
    characters += 1;
    if (ch === "\n") newlines += 1;
    else if (!/\s/.test(ch)) charactersNoSpaces += 1;
  }
  // A sentence needs a letter or digit: "... !!!" is punctuation, not a sentence.
  // Matched one at a time, because match() copies every sentence out of the input first.
  let sentences = 0;
  const sentenceRe = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
  for (let m; (m = sentenceRe.exec(s));) if (/[\p{L}\p{N}]/u.test(m[0])) sentences += 1;
  // Paragraphs are the segments between blank lines that hold any content, counted as
  // they are walked instead of split into an array of copies.
  let paragraphs = 0, inContent = false, sawNewline = false;
  for (const ch of s) {
    if (ch === "\n") {
      if (sawNewline) inContent = false; // a second newline, blank line between: the segment ends
      sawNewline = true;
    } else if (!/\s/.test(ch)) {
      if (!inContent) { paragraphs += 1; inContent = true; }
      sawNewline = false;
    }
  }
  return {
    words,
    characters,
    charactersNoSpaces,
    sentences,
    paragraphs,
    lines: s === "" ? 0 : newlines + 1,
    readingMinutes: words / 238,
  };
}

export const blocks: BlockDef[] = [{
  id: "word-count", name: "Word count", category: "Text", description: "Counts words, characters, sentences, paragraphs.", params: [],
  run: (input) => {
    const c = countText(input);
    const mins = c.readingMinutes;
    return [
      `Words:                ${c.words}`,
      `Characters:           ${c.characters}`,
      `Characters (no space):${" "}${c.charactersNoSpaces}`,
      `Sentences:            ${c.sentences}`,
      `Paragraphs:           ${c.paragraphs}`,
      `Lines:                ${c.lines}`,
      `Reading time:         ${mins < 1 ? "under a minute" : `${Math.ceil(mins)} min`}`,
    ].join("\n");
  },
}];

export default toolFromRecipe(meta.recipe!, blocks, { outputLabel: "Counts", outputName: "counts.txt" });

import type { Line, LineDocument, RawDocument, RawItem } from "../types";

// Items whose baselines differ by less than this share of the text height are one line.
const SAME_LINE = 0.5;
// Two fragments closer than this share of the text height are one word: a space is about a quarter
// of the height, so anything tighter is kerning or a glyph drawn as its own item.
const SAME_WORD = 0.2;

/** Merges fragments that touch into one item; wider gaps (a space, a column gutter) stay apart. */
function mergeFragments(sorted: readonly RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  for (const cur of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      cur.x - (prev.x + prev.w) < SAME_WORD * Math.max(prev.h, cur.h)
    ) {
      out[out.length - 1] = {
        ...prev,
        str: prev.str + cur.str,
        w: Math.max(prev.x + prev.w, cur.x + cur.w) - prev.x,
        h: Math.max(prev.h, cur.h),
      };
    } else out.push(cur);
  }
  return out;
}

function toLine(page: number, items: readonly RawItem[]): Line {
  const merged = mergeFragments([...items].sort((a, b) => a.x - b.x));
  return {
    page,
    y: Math.min(...items.map((i) => i.y)),
    items: merged,
    text: merged
      .map((i) => i.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

/**
 * Positioned text to visual lines. Pure: groups items by baseline within a tolerance relative to
 * the text height, orders lines top to bottom and items left to right, and merges fragments that
 * touch. Whitespace-only items are dropped: the gaps they stand for are already in the positions.
 */
export function normalize(doc: RawDocument): LineDocument {
  const lines: Line[] = [];
  doc.pages.forEach((page, index) => {
    const items = page.items
      .filter((i) => i.str.trim() !== "")
      .sort((a, b) => a.y - b.y);
    let group: RawItem[] = [];
    let first: RawItem | undefined;
    for (const it of items) {
      if (first && it.y - first.y > SAME_LINE * Math.max(first.h, 1)) {
        lines.push(toLine(index + 1, group));
        group = [];
        first = undefined;
      }
      first ??= it;
      group.push(it);
    }
    if (group.length > 0) lines.push(toLine(index + 1, group));
  });
  return { meta: doc.meta, lines };
}

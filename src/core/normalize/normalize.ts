import type { Line, LineDocument, RawDocument, RawItem } from "../types";

// Items whose baselines differ by less than this share of the text height are one line.
const SAME_LINE = 0.5;
// Two fragments closer than this share of the text height are one word: a space is about a quarter
// of the height, so anything tighter is kerning or a glyph drawn as its own item.
const SAME_WORD = 0.2;
// An item that repeats an earlier one's text within this share of the text height, both across and
// down, is the same text drawn twice (a total row drawn twice for a bold or underline effect).
const OVERDRAW = 0.25;

/**
 * Drops a copy of an item that is drawn again at nearly the same place. Fragments that merely
 * overlap with different text are kept: they are not the same text, and dropping one loses it.
 * `sorted` must be ordered by y.
 */
function dropOverdraw(sorted: readonly RawItem[]): RawItem[] {
  const kept: RawItem[] = [];
  for (const it of sorted) {
    const tol = OVERDRAW * Math.max(it.h, 1);
    let copy = false;
    for (let k = kept.length - 1; k >= 0 && !copy; k--) {
      const prev = kept[k] as RawItem;
      if (it.y - prev.y > tol) break;
      copy = prev.str === it.str && Math.abs(it.x - prev.x) <= tol;
    }
    if (!copy) kept.push(it);
  }
  return kept;
}

/**
 * Merges fragments that touch into one item; wider gaps (a space, a column gutter) stay apart.
 * Fragments that overlap by more than kerning are not merged either: concatenating them would
 * produce text that is on the page nowhere.
 */
function mergeFragments(sorted: readonly RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  for (const cur of sorted) {
    const prev = out[out.length - 1];
    const gap = prev ? cur.x - (prev.x + prev.w) : 0;
    const reach = SAME_WORD * Math.max(prev?.h ?? 0, cur.h);
    if (prev && gap < reach && gap >= -reach) {
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
    const items = dropOverdraw(
      page.items.filter((i) => i.str.trim() !== "").sort((a, b) => a.y - b.y),
    );
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

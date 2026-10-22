// Label and value placement (rendering.md §2.4, CAN-08, RSP-12): each part's
// label block tries a few positions around its symbol and takes the first that
// overlaps no symbol, no wire and no label already placed. A block with no
// free position is hidden and shown on hover. Pure geometry in screen pixels.

import type { Box } from "@cs/elements";

export interface LabelRequest {
  id: string;
  /** The part's symbol box, screen px. */
  box: Box;
  lines: string[];
  /** Width of each line, px. */
  widths: number[];
  lineHeight: number;
  /** A position the student dragged the label to (block centre, screen px): used as is. */
  fixed?: { x: number; y: number };
}

export interface LabelPlacement {
  id: string;
  /** Block box, screen px; lines are drawn centred in it, top to bottom. */
  box: Box;
  lines: string[];
  lineHeight: number;
  hidden: boolean;
}

const GAP = 3;

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Candidate block boxes around a symbol, in order of preference. */
export function candidates(box: Box, w: number, h: number): Box[] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const wide = box.w >= box.h;
  const above = { x: cx - w / 2, y: box.y - GAP - h, w, h };
  const below = { x: cx - w / 2, y: box.y + box.h + GAP, w, h };
  const right = { x: box.x + box.w + GAP, y: cy - h / 2, w, h };
  const left = { x: box.x - GAP - w, y: cy - h / 2, w, h };
  const aboveRight = { x: box.x + box.w + GAP, y: box.y - GAP - h, w, h };
  const belowRight = { x: box.x + box.w + GAP, y: box.y + box.h + GAP, w, h };
  const aboveLeft = { x: box.x - GAP - w, y: box.y - GAP - h, w, h };
  const belowLeft = { x: box.x - GAP - w, y: box.y + box.h + GAP, w, h };
  return wide
    ? [above, below, right, left, aboveRight, belowRight, aboveLeft, belowLeft]
    : [right, left, above, below, aboveRight, belowRight, aboveLeft, belowLeft];
}

/**
 * Place every request. `obstacles` are symbol boxes and wire segments (as thin
 * boxes); each part's own box is always an obstacle for its label.
 */
export function placeLabels(requests: readonly LabelRequest[], obstacles: readonly Box[]): LabelPlacement[] {
  const placed: Box[] = [];
  const out: LabelPlacement[] = [];
  for (const r of requests) {
    const w = Math.max(0, ...r.widths);
    const h = r.lines.length * r.lineHeight;
    if (r.fixed) {
      const box = { x: r.fixed.x - w / 2, y: r.fixed.y - h / 2, w, h };
      placed.push(box);
      out.push({ id: r.id, box, lines: r.lines, lineHeight: r.lineHeight, hidden: false });
      continue;
    }
    const free = (b: Box) => !overlaps(b, r.box) && !placed.some((p) => overlaps(b, p)) && !obstacles.some((o) => overlaps(b, o));
    const box = candidates(r.box, w, h).find(free);
    if (box) placed.push(box);
    out.push({ id: r.id, box: box ?? candidates(r.box, w, h)[0], lines: r.lines, lineHeight: r.lineHeight, hidden: !box });
  }
  return out;
}

/** A wire segment as a thin box for the obstacle list. */
export function segmentBox(ax: number, ay: number, bx: number, by: number, half = 2): Box {
  return { x: Math.min(ax, bx) - half, y: Math.min(ay, by) - half, w: Math.abs(bx - ax) + 2 * half, h: Math.abs(by - ay) + 2 * half };
}

/**
 * Draw placed label blocks on a canvas (screen px). Hidden blocks are drawn
 * only for the parts in `reveal` (hovered or selected; ANI-23, RSP-12).
 */
export function drawPlacedLabels(
  ctx: CanvasRenderingContext2D,
  placements: readonly LabelPlacement[],
  colors: { label: string; value: string },
  reveal: ReadonlySet<string>,
  firstIsLabel: (id: string) => boolean,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of placements) {
    if (p.hidden && !reveal.has(p.id)) continue;
    const cx = p.box.x + p.box.w / 2;
    p.lines.forEach((text, i) => {
      ctx.fillStyle = i === 0 && firstIsLabel(p.id) ? colors.label : colors.value;
      ctx.fillText(text, cx, p.box.y + (i + 0.5) * p.lineHeight);
    });
  }
}

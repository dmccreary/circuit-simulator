// Lane layout math (CHT-01, CHT-02): lanes stack vertically above one shared
// time axis and share the available height in proportion to their preferred
// heights.

export const GUTTER_LEFT = 56;
export const GUTTER_RIGHT = 8;
/** Extra right gutter when a lane has a second unit axis (CHT-03). */
export const GUTTER_RIGHT_AXIS = 48;
export const AXIS_H = 22;
export const LANE_PAD = 4;
export const DEFAULT_LANE_HEIGHT = 120;
export const MIN_LANE_HEIGHT = 36;
/** Pointer distance (px) that grabs a divider, cursor, or the playhead. */
export const GRAB_PX = 5;

export interface LaneBand {
  index: number;
  top: number;
  height: number;
}

export interface LaneLayout {
  bands: LaneBand[];
  /** CSS pixels per unit of preferred height. */
  scale: number;
  axisTop: number;
}

/** Bands for lanes with optional preferred heights inside a panel `total` px tall. */
export function layoutLanes(heights: readonly (number | undefined)[], total: number, axisH = AXIS_H): LaneLayout {
  const avail = Math.max(0, total - axisH);
  const prefs = heights.map((h) => (h && h > 0 ? h : DEFAULT_LANE_HEIGHT));
  const sum = prefs.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? avail / sum : 1;
  let y = 0;
  const bands = prefs.map((p, index) => {
    const height = p * scale;
    const band = { index, top: y, height };
    y += height;
    return band;
  });
  return { bands, scale, axisTop: avail };
}

/** Index of the lane under y, or -1 (on the time axis or outside). */
export function laneAt(layout: LaneLayout, y: number): number {
  for (const b of layout.bands) if (y >= b.top && y < b.top + b.height) return b.index;
  return -1;
}

/** Index i of the divider between lane i and i + 1 within GRAB_PX of y, or -1. */
export function dividerAt(layout: LaneLayout, y: number, grab = GRAB_PX): number {
  const b = layout.bands;
  for (let i = 0; i < b.length - 1; i++) {
    if (Math.abs(b[i].top + b[i].height - y) <= grab) return i;
  }
  return -1;
}

/**
 * New preferred heights after dragging divider `i` by `dy` px. Only the two
 * neighbouring lanes change; neither shrinks below MIN_LANE_HEIGHT on screen.
 */
export function resizeLanes(layout: LaneLayout, i: number, dy: number, minPx = MIN_LANE_HEIGHT): number[] {
  const b = layout.bands;
  const out = b.map((x) => x.height / (layout.scale || 1));
  if (i < 0 || i >= b.length - 1) return out;
  const total = b[i].height + b[i + 1].height;
  const lo = Math.min(minPx, total / 2);
  const upper = Math.max(lo, Math.min(total - lo, b[i].height + dy));
  out[i] = upper / (layout.scale || 1);
  out[i + 1] = (total - upper) / (layout.scale || 1);
  return out.map((h) => Math.round(h));
}

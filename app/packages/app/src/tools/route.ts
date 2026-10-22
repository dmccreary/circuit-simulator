import type { CircuitDocument, Point } from "@cs/model";
import type { ElementDescriptor } from "@cs/elements";

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Right-angled route: horizontal first, then vertical (EDT-09). */
export function routeL(a: Point, b: Point, verticalFirst = false): Point[] {
  const corner = verticalFirst ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
  const pts = [a, corner, b].filter((p, i, arr) => i === 0 || !same(p, arr[i - 1]));
  return pts.length === 1 ? [a, b] : pts;
}

/** Next free label for a prefix, such as "R3" (EDT-08). */
export function nextLabel(doc: CircuitDocument, prefix: string): string {
  if (!prefix) return "";
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const p of Object.values(doc.parts)) {
    const m = re.exec(p.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

export function defaultProps(d: ElementDescriptor): Record<string, number | string | boolean> {
  return Object.fromEntries(d.props.map((p) => [p.key, p.default]));
}

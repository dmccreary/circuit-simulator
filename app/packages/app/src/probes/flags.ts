// Probe flags on the schematic (PRB-09): where each flag hangs, its live
// value, and the clamp and direction arrow of current probes (PRB-06/08).

import type { CircuitDocument, Point, Probe, ProbeTarget } from "@cs/model";
import { probeColor, type FlagSpec, type SchematicRenderer, type Theme } from "@cs/render";
import { formatReading } from "../tools/probe";
import { probeValue, type LiveSource } from "./evaluate";

const ARROW_PX = 26;

export interface FlagInputs {
  doc: CircuitDocument;
  renderer: Pick<SchematicRenderer, "probeAnchor" | "terminalsOf" | "view">;
  theme: Theme;
  live?: LiveSource;
  selection: ReadonlySet<string>;
  blind: boolean;
}

/** Where a current probe's arrow sits and which way it points, in document coordinates. */
export function currentArrow(doc: CircuitDocument, r: FlagInputs["renderer"], t: ProbeTarget): { at: Point; dir: Point } | undefined {
  if (t.kind === "segment" || t.kind === "point") {
    const w = doc.wires[t.wire];
    const a = w?.points[t.segment];
    const b = w?.points[t.segment + 1];
    if (!a || !b) return undefined;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const s = t.kind === "segment" && t.reversed ? -1 : 1;
    const f = t.kind === "point" ? t.t : 0.5;
    return { at: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, dir: { x: (s * (b.x - a.x)) / len, y: (s * (b.y - a.y)) / len } };
  }
  if (t.kind === "through" || t.kind === "across" || t.kind === "terminal") {
    const terms = r.terminalsOf(t.part);
    const k = t.kind === "across" ? 0 : (t.terminal ?? 0);
    const tp = terms[k];
    if (!tp || terms.length < 2) return undefined;
    const cx = terms.reduce((s, p) => s + p.x, 0) / terms.length;
    const cy = terms.reduce((s, p) => s + p.y, 0) / terms.length;
    const len = Math.hypot(cx - tp.x, cy - tp.y) || 1;
    // Positive points INTO the part through terminal k.
    const s = t.kind === "through" && t.reversed ? -1 : 1;
    return { at: tp, dir: { x: (s * (cx - tp.x)) / len, y: (s * (cy - tp.y)) / len } };
  }
  return undefined;
}

export function buildFlags(inp: FlagInputs): FlagSpec[] {
  const { doc, renderer: r, theme } = inp;
  const v = r.view;
  const out: FlagSpec[] = [];
  for (const probe of Object.values(doc.probes)) {
    const spec = flagFor(probe, inp);
    if (spec) out.push(spec);
  }
  return out;

  function flagFor(probe: Probe, inp: FlagInputs): FlagSpec | undefined {
    const t = probe.target;
    const anchorDoc = r.probeAnchor(t.kind === "between" ? t.a : t);
    if (!anchorDoc) return undefined;
    const color = probeColor(theme, probe.style.color);
    let anchor = v.toScreen(anchorDoc);
    let arrow: FlagSpec["arrow"];
    const isCurrent = probe.quantity === "current";
    if (isCurrent) {
      const a = currentArrow(doc, r, t);
      if (a) {
        const at = v.toScreen(a.at);
        anchor = at;
        const through = t.kind !== "segment" && t.kind !== "point";
        // On a wire the arrow sits on the clamp; on a part it ends at the terminal, pointing in.
        const end = through ? { x: at.x - a.dir.x * 8, y: at.y - a.dir.y * 8 } : { x: at.x + (a.dir.x * ARROW_PX) / 2, y: at.y + (a.dir.y * ARROW_PX) / 2 };
        arrow = { from: { x: end.x - a.dir.x * ARROW_PX, y: end.y - a.dir.y * ARROW_PX }, to: end };
      }
    }
    const at = v.toScreen({ x: anchorDoc.x + probe.flag.offset.x, y: anchorDoc.y + probe.flag.offset.y });
    let value: string | undefined;
    if (probe.flag.showValue) {
      value = inp.blind ? "?" : inp.live ? formatReading(probe.quantity, probeValue(inp.live, probe)) : undefined;
    }
    const blackDoc = t.kind === "between" ? r.probeAnchor(t.b) : undefined;
    return {
      id: probe.id,
      name: probe.name,
      color,
      anchor,
      at,
      value,
      selected: inp.selection.has(probe.id),
      arrow,
      clamp: isCurrent,
      black: blackDoc ? v.toScreen(blackDoc) : undefined,
    };
  }
}

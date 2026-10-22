// Hover cards (CAN-16/17) and pinned meters (CAN-19). Values are sampled
// with useLiveValue, so frame-rate data never drives React renders directly;
// they show the scrub position when the student scrubs back (CAN-18).

import { useRef } from "react";
import { getDescriptor } from "@cs/elements";
import { formatValue } from "@cs/units";
import { useController, useDocument } from "../ui/context";
import { useLiveValue } from "../live";
import { t } from "../messages";
import { measureOf } from "../probes/install";
import type { MeasureUi, PinTarget, Pinned } from "../probes/session";
import { useStore } from "../store";
import { nodeReading, partReadings } from "./readings";

const fmt = (v: number, unit: Parameters<typeof formatValue>[1], suffix = "") => (Number.isFinite(v) ? `${formatValue(v, unit, { digits: 3 })}${suffix}` : "–");

interface Row {
  label: string;
  value: string;
}

/** The card's rows as one string per sample, so an unchanged reading does not re-render. */
function useRows(target: PinTarget): Row[] {
  const c = useController();
  const s = measureOf(c);
  const text = useLiveValue(c.bus, () => {
    const live = s.live();
    if (!live) return "";
    const blind = s.blind();
    const show = (v: string) => (blind ? "?" : v);
    if (target.kind === "part") {
      const part = c.edits.doc.parts[target.part];
      if (!part) return "";
      return partReadings(live, part)
        .map((r) => `${t(`meter.${r.key}`)}\t${show(fmt(r.value, r.unit, r.suffix ? ` ${r.suffix}` : ""))}`)
        .join("\n");
    }
    const node = s.nodeOf(target.target);
    if (node === undefined) return "";
    const n = nodeReading(live, node, target.seg);
    const rows = [`${t("meter.node")}\t${n.name}`, `${t("meter.nodeVoltage")}\t${show(fmt(n.voltage, "V"))}`];
    if (n.segmentCurrent !== undefined) rows.push(`${t("meter.wireCurrent")}\t${show(`${fmt(Math.abs(n.segmentCurrent), "A")} ${arrowFor(c, target, n.segmentCurrent)}`)}`);
    return rows.join("\n");
  });
  if (!text) return [];
  return text.split("\n").map((line) => {
    const [label, value] = line.split("\t");
    return { label, value };
  });
}

/** Screen direction of a wire current: → ← ↑ ↓ (CAN-16). */
function arrowFor(c: ReturnType<typeof useController>, target: PinTarget, i: number): string {
  if (target.kind !== "node" || !target.seg) return "";
  const w = c.edits.doc.wires[target.seg.wire];
  const a = w?.points[target.seg.segment];
  const b = w?.points[target.seg.segment + 1];
  if (!a || !b || Math.abs(i) < 1e-15) return "";
  const s = i >= 0 ? 1 : -1;
  const dx = (b.x - a.x) * s;
  const dy = (b.y - a.y) * s;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "→" : "←") : dy > 0 ? "↓" : "↑";
}

function Title({ target }: { target: PinTarget }) {
  const part = useDocument((d) => (target.kind === "part" ? d.parts[target.part] : undefined));
  if (target.kind !== "part") return <strong>{t("meter.node")}</strong>;
  if (!part) return null;
  const d = getDescriptor(part.type);
  const main = d?.props.filter((p) => p.showOnCanvas && typeof part.props[p.key] === "number").map((p) => formatValue(part.props[p.key] as number, p.unit, { trimZeros: true }));
  return (
    <>
      <strong>{part.label}</strong> <span className="measure-type">{part.type}</span>
      {main && main.length > 0 && <span className="measure-main"> {main.join(", ")}</span>}
    </>
  );
}

function Rows({ target }: { target: PinTarget }) {
  const rows = useRows(target);
  if (rows.length === 0) return <p className="measure-empty">{t("meter.noData")}</p>;
  return (
    <dl className="measure-rows">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd className="measure-value">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HoverCard() {
  const c = useController();
  const s = measureOf(c);
  const hover = useLiveHover();
  if (!hover) return null;
  const target: PinTarget = hover.kind === "part" ? { kind: "part", part: hover.part } : { kind: "node", target: hover.target, seg: hover.seg, at: c.schematic?.view.toGrid(hover.screen) ?? { x: 0, y: 0 } };
  return (
    <div className="measure-card hover" style={{ transform: `translate(${Math.round(hover.screen.x + 16)}px, ${Math.round(hover.screen.y + 16)}px)` }} role="tooltip">
      <div className="measure-head">
        <Title target={target} />
        <button type="button" className="measure-pin" aria-label={t("meter.pin")} title={t("meter.pin")} onClick={() => s.pin(target)}>
          📌
        </button>
      </div>
      <Rows target={target} />
    </div>
  );
}

function useLiveHover() {
  return useStore(measureOf(useController()).ui, selectHover);
}

const selectHover = (u: MeasureUi) => u.hover;

export function PinnedCard({ pin }: { pin: Pinned }) {
  const c = useController();
  const s = measureOf(c);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | undefined>(undefined);
  return (
    <div
      className="measure-card pinned"
      ref={(el) => {
        if (el) s.pinnedEls.set(pin.id, el);
        else s.pinnedEls.delete(pin.id);
        s.redraw();
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, ox: pin.offset.x, oy: pin.offset.y };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) s.movePin(pin.id, { x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
      }}
      onPointerUp={() => (drag.current = undefined)}
    >
      <div className="measure-head">
        <Title target={pin.target} />
        <button type="button" className="measure-pin" aria-label={t("meter.unpin")} title={t("meter.unpin")} onClick={() => s.unpin(pin.id)}>
          ✕
        </button>
      </div>
      <Rows target={pin.target} />
    </div>
  );
}

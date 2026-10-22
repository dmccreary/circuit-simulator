// Pointer, wheel and key handling on the chart canvas: hover readout, cursor
// and playhead dragging (scrubbing), panning, wheel zoom, lane resizing.
// Everything goes to the renderer or the session; nothing enters React state.

import { GRAB_PX, dividerAt, grabbedMarker, laneAt, resizeLanes, type ChartRenderer, type LaneLayout } from "@cs/render";
import type { AppController } from "../controller";
import { setLaneHeights } from "./lane-edits";

type Drag =
  | { kind: "divider"; index: number; y0: number; layout: LaneLayout; heights?: number[] }
  | { kind: "marker"; id: "a" | "b" | "playhead" }
  | { kind: "pan"; x0: number; t0: number; moved: boolean };

const WHEEL_ZOOM = 0.0015;

export function attachChartInteraction(host: HTMLElement, c: AppController, chart: ChartRenderer): () => void {
  const s = c.chartSession;
  let drag: Drag | undefined;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inPlot = (x: number) => {
    const p = chart.plotArea();
    return x >= p.x && x <= p.x + p.w;
  };
  const markers = () => {
    const m = chart.state;
    const paused = s.canScrub;
    return [
      { id: "a" as const, x: m.cursors ? chart.xOf(m.cursors.a) : undefined },
      { id: "b" as const, x: m.cursors ? chart.xOf(m.cursors.b) : undefined },
      { id: "playhead" as const, x: paused && m.playhead !== undefined ? chart.xOf(m.playhead) : undefined },
    ];
  };
  const hoverAt = (x: number, y: number) => {
    const layout = chart.layout();
    const li = laneAt(layout, y);
    if (!inPlot(x) || li < 0) return chart.update({ hover: undefined });
    chart.update({ hover: { t: chart.timeAt(x), lane: chart.getLanes()[li]?.id } });
  };
  const cursorStyle = (x: number, y: number) => {
    const layout = chart.layout();
    if (dividerAt(layout, y) >= 0) return "row-resize";
    if (grabbedMarker(x, markers(), GRAB_PX)) return "ew-resize";
    if (y >= layout.axisTop && s.canScrub) return "pointer";
    return inPlot(x) ? "crosshair" : "default";
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const { x, y } = local(e);
    host.focus({ preventScroll: true });
    const layout = chart.layout();
    const div = dividerAt(layout, y);
    if (div >= 0) drag = { kind: "divider", index: div, y0: y, layout };
    else {
      const m = grabbedMarker(x, markers(), GRAB_PX);
      if (m) drag = { kind: "marker", id: m };
      else if (y >= layout.axisTop && s.canScrub) {
        drag = { kind: "marker", id: "playhead" };
        s.scrubTo(chart.timeAt(x));
      } else if (inPlot(x)) drag = { kind: "pan", x0: x, t0: chart.timeAt(x), moved: false };
    }
    if (drag) {
      host.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };

  const onMove = (e: PointerEvent) => {
    const { x, y } = local(e);
    if (!drag) {
      host.style.cursor = cursorStyle(x, y);
      hoverAt(x, y);
      return;
    }
    if (drag.kind === "divider") {
      drag.heights = resizeLanes(drag.layout, drag.index, y - drag.y0);
      chart.previewLaneHeights(drag.heights);
    } else if (drag.kind === "marker") {
      const t = chart.timeAt(x);
      if (drag.id === "playhead") s.scrubTo(t);
      else s.setCursor(drag.id, t);
      hoverAt(x, y);
    } else {
      if (Math.abs(x - drag.x0) > 3) drag.moved = true;
      if (drag.moved) s.pan(drag.t0 - chart.timeAt(x));
    }
  };

  const onUp = (e: PointerEvent) => {
    const d = drag;
    drag = undefined;
    host.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (d.kind === "divider") {
      chart.previewLaneHeights(undefined);
      if (d.heights) c.edits.edit({ key: "chart.resizeLane" }, (doc) => setLaneHeights(doc, d.heights!));
    } else if (d.kind === "pan" && !d.moved && s.canScrub) {
      // A click (no drag) on the plot while paused moves the playhead there.
      s.scrubTo(chart.timeAt(local(e).x));
    }
  };

  const onLeave = () => {
    if (!drag) chart.update({ hover: undefined });
  };

  const onWheel = (e: WheelEvent) => {
    const { x } = local(e);
    if (!inPlot(x)) return;
    e.preventDefault();
    const win = chart.visibleWindow();
    const span = win.t1 - win.t0;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX;
      s.pan((d / chart.plotArea().w) * span);
    } else {
      s.zoom(Math.exp(e.deltaY * WHEEL_ZOOM), chart.timeAt(x));
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
        s.nudge(-step);
        break;
      case "ArrowRight":
        s.nudge(step);
        break;
      case "+":
      case "=":
        s.zoom(0.5);
        break;
      case "-":
        s.zoom(2);
        break;
      case "Escape":
        s.endScrub();
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onUp);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("wheel", onWheel, { passive: false });
  host.addEventListener("keydown", onKey);
  return () => {
    host.removeEventListener("pointerdown", onDown);
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerup", onUp);
    host.removeEventListener("pointercancel", onUp);
    host.removeEventListener("pointerleave", onLeave);
    host.removeEventListener("wheel", onWheel);
    host.removeEventListener("keydown", onKey);
  };
}

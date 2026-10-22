import { useEffect, useRef } from "react";
import { useApp, useController } from "./context";
import type { CanvasPointer } from "../tools/types";

/** Hosts the schematic canvases; input goes to the tool controller. */
export function SchematicView() {
  const c = useController();
  const host = useRef<HTMLDivElement>(null);
  const tool = useApp((s) => s.tool);

  useEffect(() => {
    const el = host.current!;
    const r = c.attachSchematic(el);
    // Fit the circuit once, as soon as the canvas has a real size.
    let fitted = false;
    const sizeToHost = () => {
      const b = el.getBoundingClientRect();
      r.resize(b.width, b.height);
      if (!fitted && b.width > 0 && b.height > 0) {
        fitted = true;
        c.fit();
      }
    };
    const ro = new ResizeObserver(sizeToHost);
    ro.observe(el);
    sizeToHost();

    const toPointer = (e: PointerEvent): CanvasPointer => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, button: e.button, shiftKey: e.shiftKey, altKey: e.altKey, time: e.timeStamp };
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      el.focus();
      c.tools.pointerDown(toPointer(e));
      el.style.cursor = c.tools.cursor();
    };
    const move = (e: PointerEvent) => {
      c.tools.pointerMove(toPointer(e));
      el.style.cursor = c.tools.cursor();
    };
    const up = (e: PointerEvent) => {
      c.tools.pointerUp(toPointer(e));
      el.style.cursor = c.tools.cursor();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      r.view.zoomAbout({ x: e.clientX - rect.left, y: e.clientY - rect.top }, Math.exp(-e.deltaY * 0.0015));
      c.scheduler.invalidateAll();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      r.dispose();
      c.schematic = undefined;
    };
  }, [c]);

  useEffect(() => {
    if (host.current) host.current.style.cursor = c.tools.cursor();
  }, [c, tool]);

  return (
    <div
      ref={host}
      className="schematic"
      tabIndex={0}
      role="application"
      aria-label="Circuit schematic"
      aria-roledescription="schematic editor"
    />
  );
}

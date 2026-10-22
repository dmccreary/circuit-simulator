// Symbol style dispatch (CAN-07, CAN-14) and failure marks (RLM-06).
//
// styledView() wraps a part type's view so drawSymbol honours the style:
// "iec" and "lifelike" use the drawers in symbols-iec.ts / symbols-lifelike.ts
// when the type has one, else the view's own drawing. A part whose `failed`
// prop is set is then drawn damaged: scorched, with a crack (open) or a
// melted bridge (short), in every style.

import type { Part } from "@cs/model";
import type { ElementView, SymbolGraphics } from "../api";
import { IEC_SYMBOLS } from "./symbols-iec";
import { LIFELIKE_SYMBOLS } from "./symbols-lifelike";
import { circlePath, fillCss, strokeCss } from "./graphics-ext";
import { failedMode } from "./ratings";

export type SymbolStyle = "ansi" | "iec" | "lifelike";

/** Draw marks of damage over a failed part's body. */
export function drawDamage(g: SymbolGraphics, part: Part, view: ElementView): void {
  const mode = failedMode(part.props);
  if (!mode) return;
  const b = view.hitShape(part);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = Math.max(0.5, Math.min(b.w, b.h) * 0.45);
  // Soot: two overlapping blotches.
  circlePath(g, cx - 0.15 * r, cy - 0.1 * r, r * 0.8);
  fillCss(g, "#3e2723", "symbol", 0.45);
  circlePath(g, cx + 0.25 * r, cy + 0.15 * r, r * 0.55);
  fillCss(g, "#212121", "symbol", 0.4);
  g.beginPath();
  if (mode === "open") {
    // A crack across the body.
    g.moveTo(cx - 0.2, cy - r);
    g.lineTo(cx + 0.15, cy - 0.35 * r);
    g.lineTo(cx - 0.15, cy + 0.1 * r);
    g.lineTo(cx + 0.2, cy + 0.55 * r);
    g.lineTo(cx - 0.05, cy + r);
    strokeCss(g, "#ffffff", 0.14, "background");
  } else {
    // A melted bridge.
    g.moveTo(cx - r, cy);
    g.lineTo(cx + r, cy);
    strokeCss(g, "#5d4037", 0.22, "symbol");
  }
}

/** A view whose drawSymbol honours the IEC and lifelike styles and draws failure damage. */
export function styledView(type: string, view: ElementView): ElementView {
  const iec = IEC_SYMBOLS[type];
  const lifelike = LIFELIKE_SYMBOLS[type];
  return {
    ...view,
    drawSymbol(g: SymbolGraphics, part: Part, style: SymbolStyle) {
      const own = style === "iec" ? iec : style === "lifelike" ? lifelike : undefined;
      if (own) own(g, part);
      else view.drawSymbol(g, part, style);
      drawDamage(g, part, view);
    },
  };
}

/** Types with their own drawing in a style (tests, the settings preview). */
export function hasStyle(type: string, style: SymbolStyle): boolean {
  return style === "ansi" || (style === "iec" ? !!IEC_SYMBOLS[type] : !!LIFELIKE_SYMBOLS[type]);
}

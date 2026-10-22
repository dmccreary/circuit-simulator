import type { Orientation, Point, Rotation } from "@cs/model";
import type { CanvasPointer, KeyInput, Tool, ToolContext } from "./types";
import { defaultProps, nextLabel } from "./route";

/** Place one part from the palette, then return to Select. */
export class PlaceTool implements Tool {
  readonly id = "place" as const;
  at: Point | undefined;
  orientation: Orientation = { rot: 0, flip: false };

  constructor(readonly type: string) {}

  cursor(): string {
    return "copy";
  }

  onPointerMove(e: CanvasPointer, ctx: ToolContext): void {
    this.at = ctx.view.snap(e);
    ctx.invalidateOverlay();
  }

  onPointerDown(e: CanvasPointer, ctx: ToolContext): void {
    const d = ctx.descriptor(this.type);
    if (!d) return;
    const at = ctx.view.snap(e);
    const id = ctx.newId("p");
    const tx = ctx.begin({ key: "edit.place", values: { type: this.type } });
    tx.update((doc) => {
      doc.parts[id] = {
        id,
        type: this.type,
        label: nextLabel(doc, d.labelPrefix),
        at,
        orientation: { ...this.orientation },
        ...(d.stretchable ? { length: d.stretchable.default } : {}),
        props: defaultProps(d, doc.settings.realisticParts),
      };
    });
    tx.commit();
    ctx.select([id]);
    ctx.setTool({ id: "select" });
  }

  onKey(e: KeyInput, ctx: ToolContext): boolean {
    if (e.key.toLowerCase() !== "r" || e.ctrlKey || e.metaKey) return false;
    this.orientation = { ...this.orientation, rot: ((this.orientation.rot + 90) % 360) as Rotation };
    ctx.invalidateOverlay();
    return true;
  }

  drawOverlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
    if (!this.at) return;
    const d = ctx.descriptor(this.type);
    if (!d) return;
    const ghost = { id: "", type: this.type, label: "", at: this.at, orientation: this.orientation, props: {}, length: d.stretchable?.default };
    const pts = ctx.terminals(ghost).map((p) => ctx.view.toScreen(p));
    g.globalAlpha = 0.6;
    g.strokeStyle = g.fillStyle = "#1e88e5";
    g.lineWidth = 2;
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.stroke();
    for (const p of pts) {
      g.beginPath();
      g.arc(p.x, p.y, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

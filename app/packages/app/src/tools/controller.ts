import type { ToolSpec } from "../app-state";
import type { CanvasPointer, KeyInput, Tool, ToolContext } from "./types";
import { SelectTool } from "./select";
import { PlaceTool } from "./place";
import { WireTool } from "./wire";
import { ProbeTool } from "./probe";

export function createTool(spec: ToolSpec): Tool {
  switch (spec.id) {
    case "select":
      return new SelectTool();
    case "place":
      return new PlaceTool(spec.type);
    case "wire":
      return new WireTool();
    case "probe-v":
      return new ProbeTool();
  }
}

/** Holds exactly one active tool and routes canvas input to it (app-shell.md §5.1). */
export class ToolController {
  tool: Tool = new SelectTool();

  constructor(private ctx: ToolContext) {}

  setTool(spec: ToolSpec): void {
    this.tool.cancel?.(this.ctx);
    this.tool = createTool(spec);
    this.ctx.setHover(undefined);
    this.ctx.invalidateOverlay();
  }

  pointerDown(e: CanvasPointer): void {
    this.tool.onPointerDown?.(e, this.ctx);
  }
  pointerMove(e: CanvasPointer): void {
    this.tool.onPointerMove?.(e, this.ctx);
  }
  pointerUp(e: CanvasPointer): void {
    this.tool.onPointerUp?.(e, this.ctx);
  }

  /** Esc cancels the tool's gesture, then returns to Select. */
  key(e: KeyInput): boolean {
    if (this.tool.onKey?.(e, this.ctx)) return true;
    if (e.key === "Escape") {
      if (this.tool.id === "select") this.tool.cancel?.(this.ctx);
      else this.ctx.setTool({ id: "select" });
      return true;
    }
    return false;
  }

  drawOverlay(g: CanvasRenderingContext2D): void {
    this.tool.drawOverlay?.(g, this.ctx);
  }

  cursor(): string {
    return this.tool.cursor();
  }
}

import type { Point } from "@cs/model";
import type { ToolSpec } from "../app-state";
import type { CanvasPointer, KeyInput, Tool, ToolContext } from "./types";
import { SelectTool } from "./select";
import { PlaceTool } from "./place";
import { WireTool, type KeyboardWireHooks } from "./wire";
import { ProbeTool } from "./probe";
import { LoopTool } from "../law-tools/loop";
import { JunctionTool } from "../law-tools/junction";

export function createTool(spec: ToolSpec): Tool {
  switch (spec.id) {
    case "select":
      return new SelectTool();
    case "place":
      return new PlaceTool(spec.type);
    case "wire":
      return new WireTool();
    case "probe-v":
      return new ProbeTool("voltage");
    case "probe-i":
      return new ProbeTool("current");
    case "probe-p":
      return new ProbeTool("power");
    case "loop":
      return new LoopTool();
    case "junction":
      return new JunctionTool();
  }
}

/** Holds exactly one active tool and routes canvas input to it (app-shell.md §5.1). */
/**
 * Takes a pointer gesture before the active tool when `down` returns true
 * (probe flags: drag, reverse, select; PRB-10). Move and up then go to it.
 */
export interface CanvasInterceptor {
  down(e: CanvasPointer, tool: Tool): boolean;
  move?(e: CanvasPointer): void;
  up?(e: CanvasPointer): void;
}

export class ToolController {
  tool: Tool = new SelectTool();
  readonly interceptors: CanvasInterceptor[] = [];
  private captured: CanvasInterceptor | undefined;
  /** Last pointer position over the canvas (CSS px), so Paste can land at the pointer (EDT-22). */
  lastPointer: Point | undefined;

  constructor(private ctx: ToolContext) {}

  setTool(spec: ToolSpec): void {
    this.tool.cancel?.(this.ctx);
    this.tool = createTool(spec);
    this.ctx.setHover(undefined);
    this.ctx.invalidateOverlay();
  }

  pointerDown(e: CanvasPointer): void {
    this.lastPointer = { x: e.x, y: e.y };
    this.captured = this.interceptors.find((i) => i.down(e, this.tool));
    if (this.captured) return;
    this.tool.onPointerDown?.(e, this.ctx);
  }
  pointerMove(e: CanvasPointer): void {
    this.lastPointer = { x: e.x, y: e.y };
    if (this.captured) return this.captured.move?.(e);
    this.tool.onPointerMove?.(e, this.ctx);
  }
  pointerUp(e: CanvasPointer): void {
    const cap = this.captured;
    this.captured = undefined;
    if (cap) return cap.up?.(e);
    this.tool.onPointerUp?.(e, this.ctx);
  }

  /** Esc cancels the tool's gesture, then returns to Select, then clears the selection (EDT-18). */
  key(e: KeyInput): boolean {
    if (this.tool.onKey?.(e, this.ctx)) return true;
    if (e.key === "Escape") {
      if (this.tool.id !== "select") this.ctx.setTool({ id: "select" });
      else {
        this.tool.cancel?.(this.ctx);
        if (this.ctx.selection().length) this.ctx.select([]);
      }
      return true;
    }
    return false;
  }

  /** Abandon the current pointer gesture (a second finger turned it into pan/zoom). */
  cancelGesture(): void {
    this.tool.cancel?.(this.ctx);
    this.ctx.invalidateOverlay();
  }

  /** ACC-04: start a wire from a terminal with the keyboard. Switches to the Wire tool if needed. */
  startKeyboardWire(from: Point, hooks: KeyboardWireHooks = {}): void {
    if (!(this.tool instanceof WireTool)) this.ctx.setTool({ id: "wire" });
    if (this.tool instanceof WireTool) this.tool.startKeyboard(from, this.ctx, hooks);
  }

  drawOverlay(g: CanvasRenderingContext2D): void {
    this.tool.drawOverlay?.(g, this.ctx);
  }

  cursor(): string {
    return this.tool.cursor();
  }
}

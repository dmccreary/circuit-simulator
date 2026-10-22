import type { CircuitDocument, CompiledCircuit, MessageRef, Part, Point } from "@cs/model";
import type { ElementDescriptor } from "@cs/elements";
import type { HitResult, Theme, ViewTransform } from "@cs/render";
import type { ToolSpec } from "../app-state";

export interface CanvasPointer {
  /** CSS px relative to the canvas host. */
  x: number;
  y: number;
  button: number;
  shiftKey: boolean;
  /** Alt/Option held (quick probe, PRB-02). */
  altKey?: boolean;
  /** ms timestamp, for double-click detection. */
  time: number;
}

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface TxLike {
  update(recipe: (draft: CircuitDocument) => void): void;
  commit(): void;
  cancel(): void;
}

/** Everything a tool may use and nothing else (app-shell.md §5.1). */
export interface ToolContext {
  readonly doc: CircuitDocument;
  begin(label: MessageRef): TxLike;
  hit(screen: Point): HitResult[];
  view: ViewTransform;
  descriptor(type: string): ElementDescriptor | undefined;
  terminals(part: Part): Point[];
  selection(): string[];
  select(ids: string[]): void;
  setTool(t: ToolSpec): void;
  setHover(h: HitResult | undefined): void;
  invalidateView(): void;
  invalidateOverlay(): void;
  newId(prefix: string): string;
  /** Double-click action on a part, such as looking inside a subcircuit; true when it acted. */
  openPart?(part: string): boolean;
  /** Live data for measurement tools (absent in plain editing harnesses). */
  compiled?(): CompiledCircuit | undefined;
  /** Display state being drawn: live, or the scrub position. */
  display?(): ArrayLike<number> | undefined;
  theme?(): Theme;
  /** Hide live numbers (lesson blind prediction). */
  blind?(): boolean;
}

export interface Tool {
  id: ToolSpec["id"];
  cursor(): string;
  onPointerDown?(e: CanvasPointer, ctx: ToolContext): void;
  onPointerMove?(e: CanvasPointer, ctx: ToolContext): void;
  onPointerUp?(e: CanvasPointer, ctx: ToolContext): void;
  onKey?(e: KeyInput, ctx: ToolContext): boolean;
  drawOverlay?(g: CanvasRenderingContext2D, ctx: ToolContext): void;
  cancel?(ctx: ToolContext): void;
}

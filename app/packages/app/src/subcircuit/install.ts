// Hooks subcircuits onto a controller: commands, messages, and the pin
// markers drawn while looking inside a definition.

import type { AppController } from "../controller";
import { addMessages } from "../messages";
import { SUBCIRCUIT_EN } from "./messages-en";
import { subcircuitsOf } from "./session";
import type { DefinitionBundle, Point } from "@cs/model";

export function installSubcircuits(c: AppController): void {
  addMessages(SUBCIRCUIT_EN);
  const s = subcircuitsOf(c);
  const r = c.commands;
  r.register({
    id: "subcircuit.make",
    label: { key: "cmd.makeSubcircuit" },
    when: (ctx) => ctx.selectedParts().length > 0,
    run: () => void s.openMakeDialog(),
  });
  r.register({
    id: "subcircuit.lookInside",
    label: { key: "cmd.lookInside" },
    capability: "edit.values",
    when: () => s.canLookInside(),
    run: (_ctx, id) => void s.lookInside(typeof id === "string" ? id : undefined),
  });
  r.register({
    id: "subcircuit.exit",
    label: { key: "cmd.exitSubcircuit" },
    defaultKeys: ["Escape"],
    capability: "edit.values",
    when: () => s.ui.get().path.length > 0,
    run: () => s.exit(),
  });
  r.register({
    id: "subcircuit.toggleSeal",
    label: { key: "cmd.toggleSeal" },
    when: () => !!s.selectedInstance(),
    run: () => s.toggleSeal(),
  });
  r.register({
    id: "subcircuit.saveToMyParts",
    label: { key: "cmd.saveToMyParts" },
    when: () => !!s.selectedInstance(),
    run: () => {
      const inst = s.selectedInstance();
      if (inst) void s.saveToMyParts(inst.definition);
    },
  });
  c.schematicHooks.add((renderer, host) => {
    renderer.addOverlay((g, view) => drawPins(c, g, view));
    installMyPartsDrop(c, host);
  });
}

export const MY_PART_MIME = "application/x-circuit-simulator-my-part";

/** Drop handling for the canvas: a My parts entry dragged from the palette is placed where it lands. */
export function installMyPartsDrop(c: AppController, host: HTMLElement): () => void {
  const over = (e: globalThis.DragEvent) => {
    if (e.dataTransfer?.types.includes(MY_PART_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const drop = (e: globalThis.DragEvent) => {
    const id = e.dataTransfer?.getData(MY_PART_MIME);
    if (!id || !c.schematic) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = host.getBoundingClientRect();
    placeMyPart(c, id, c.schematic.view.snap({ x: e.clientX - rect.left, y: e.clientY - rect.top }));
  };
  host.addEventListener("dragover", over);
  host.addEventListener("drop", drop);
  return () => {
    host.removeEventListener("dragover", over);
    host.removeEventListener("drop", drop);
  };
}

/** Place a My parts entry from the palette: at a point, or in the middle of the view. */
export function placeMyPart(c: AppController, id: string, at?: Point): string | undefined {
  const s = subcircuitsOf(c);
  const bundle: DefinitionBundle | undefined = s.bundleFor(id);
  if (!bundle) return undefined;
  const where = at ?? (c.schematic ? c.schematic.view.snap({ x: c.schematic.view.width / 2, y: c.schematic.view.height / 2 }) : { x: 0, y: 0 });
  return s.place(bundle, where);
}

/** Pin markers and names on the sheet's edge while looking inside (EDT-36). */
function drawPins(c: AppController, g: CanvasRenderingContext2D, view: { toScreen(p: Point): Point; scale: number }): void {
  const path = subcircuitsOf(c).ui.get().path;
  const def = path.length ? c.edits.doc.subcircuits[path[path.length - 1].definition] : undefined;
  if (!def) return;
  g.save();
  g.font = `${Math.max(10, Math.round(view.scale * 0.7))}px system-ui, sans-serif`;
  g.textBaseline = "middle";
  for (const pin of def.pins) {
    const p = view.toScreen(pin.at);
    const r = Math.max(4, view.scale * 0.35);
    g.fillStyle = "#ef6c00";
    g.beginPath();
    g.moveTo(p.x, p.y - r);
    g.lineTo(p.x + r, p.y);
    g.lineTo(p.x, p.y + r);
    g.lineTo(p.x - r, p.y);
    g.closePath();
    g.fill();
    const left = pin.side === "left" || pin.side === "top";
    g.textAlign = left ? "right" : "left";
    g.fillText(pin.name, p.x + (left ? -r - 3 : r + 3), p.y - (pin.side === "top" || pin.side === "bottom" ? r + 6 : 0));
  }
  g.restore();
}

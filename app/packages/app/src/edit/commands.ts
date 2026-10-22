import type { CircuitDocument, Part } from "@cs/model";
import { newId } from "@cs/model";
import { getDescriptor } from "@cs/elements";
import type { CommandRegistry } from "../commands/registry";
import type { AppController } from "../controller";
import { defaultProps, nextLabel } from "../tools/route";
import { shellOf } from "../settings/install";
import { flipSelection, moveSelection, rotateSelection, terminalsOf } from "./transform";
import { fragmentOrigin, makeFragment, parseFragment, pasteFragment, serializeFragment, type CircuitFragment } from "./clipboard";
import { addSlider, sliderableProps } from "./sliders";

const labelFor = (draft: CircuitDocument, part: Part) => nextLabel(draft, getDescriptor(part.type)?.labelPrefix ?? "");
const sel = (c: AppController) => c.store.get().selection;
const hasSelection = (c: AppController) => sel(c).length > 0;
/** Arrow keys and Enter belong to the canvas only while it has focus. */
const canvasFocused = (c: AppController) => shellOf(c).focus.store.get().canvasFocused;

function transform(c: AppController, key: string, fn: (d: CircuitDocument, ids: string[]) => void): void {
  const ids = sel(c);
  c.edits.edit({ key }, (d) => fn(d, ids));
}

/** Copy to the session clipboard and, where allowed, the system clipboard as JSON. */
function copy(c: AppController): boolean {
  const f = makeFragment(c.edits.doc, sel(c));
  if (!f) return false;
  const text = serializeFragment(f);
  const sh = shellOf(c);
  sh.clipboard.text = text;
  sh.clipboard.pastes = 0;
  void globalThis.navigator?.clipboard?.writeText?.(text).catch(() => undefined);
  return true;
}

/** Where a paste lands: at the pointer when it is over the canvas, else offset from the original. */
function pasteOffset(c: AppController, f: CircuitFragment, n: number): { x: number; y: number } {
  const o = fragmentOrigin(f);
  const ptr = c.tools.lastPointer;
  const view = c.schematic?.view;
  if (ptr && view) {
    const g = view.snap(ptr);
    return { x: g.x - o.x, y: g.y - o.y };
  }
  return { x: 2 * n, y: 2 * n };
}

function insert(c: AppController, f: CircuitFragment, offset: { x: number; y: number }, key: string): void {
  let ids: string[] = [];
  c.edits.edit({ key }, (d) => {
    ids = pasteFragment(d, f, offset, newId, labelFor);
  });
  c.store.set({ selection: ids });
}

async function paste(c: AppController): Promise<void> {
  const sh = shellOf(c);
  let text = sh.clipboard.text;
  if (!text) {
    try {
      text = (await globalThis.navigator?.clipboard?.readText?.()) ?? undefined;
    } catch {
      text = undefined; // permission refused: nothing to paste
    }
  }
  const f = text ? parseFragment(text) : undefined;
  if (!f || (!f.parts.length && !f.wires.length)) return;
  sh.clipboard.pastes += 1;
  insert(c, f, pasteOffset(c, f, sh.clipboard.pastes), "edit.paste");
}

const MOVES = [
  ["Left", -1, 0],
  ["Right", 1, 0],
  ["Up", 0, -1],
  ["Down", 0, 1],
] as const;

/** Spec §7.3/§7.4 editing commands: clipboard, arrange, move, in-place edit, sliders, keyboard placement. */
export function registerEditCommands(r: CommandRegistry<AppController>): void {
  r.register({ id: "edit.copy", label: { key: "cmd.copy" }, defaultKeys: ["Mod+C"], when: hasSelection, run: (c) => void copy(c) });
  r.register({
    id: "edit.cut",
    label: { key: "cmd.cut" },
    defaultKeys: ["Mod+X"],
    when: hasSelection,
    run: (c) => {
      if (copy(c)) c.commands.run("edit.delete");
    },
  });
  r.register({
    id: "edit.paste",
    label: { key: "cmd.paste" },
    defaultKeys: ["Mod+V"],
    when: (c) => !!shellOf(c).clipboard.text || !!globalThis.navigator?.clipboard?.readText,
    run: (c) => paste(c),
  });
  r.register({
    id: "edit.duplicate",
    label: { key: "cmd.duplicate" },
    defaultKeys: ["Mod+D"],
    when: hasSelection,
    run: (c) => {
      const f = makeFragment(c.edits.doc, sel(c));
      if (f) insert(c, f, { x: 2, y: 2 }, "edit.duplicate");
    },
  });
  r.register({
    id: "edit.selectAll",
    label: { key: "cmd.selectAll" },
    defaultKeys: ["Mod+A"],
    when: (c) => Object.keys(c.edits.doc.parts).length + Object.keys(c.edits.doc.wires).length > 0,
    run: (c) => c.store.set({ selection: [...Object.keys(c.edits.doc.parts), ...Object.keys(c.edits.doc.wires)] }),
  });
  r.register({
    id: "edit.rotateCCW",
    label: { key: "cmd.rotateCCW" },
    defaultKeys: ["Shift+R"],
    when: hasSelection,
    run: (c) => transform(c, "edit.rotate", (d, ids) => rotateSelection(d, ids, terminalsOf, false)),
  });
  r.register({
    id: "edit.flipH",
    label: { key: "cmd.flip" },
    defaultKeys: ["X"],
    when: hasSelection,
    run: (c) => transform(c, "edit.flip", (d, ids) => flipSelection(d, ids, terminalsOf, true)),
  });
  r.register({
    id: "edit.flipV",
    label: { key: "cmd.flipV" },
    defaultKeys: ["Y"],
    when: hasSelection,
    run: (c) => transform(c, "edit.flip", (d, ids) => flipSelection(d, ids, terminalsOf, false)),
  });
  // EDT-20: arrows move the selection 1 unit, Shift+arrows 5; with nothing selected they pan.
  for (const [name, dx, dy] of MOVES) {
    for (const far of [false, true]) {
      const step = far ? 5 : 1;
      r.register({
        id: `edit.move${name}${far ? "Far" : ""}`,
        label: { key: `cmd.nudge${name}`, values: { n: step } },
        defaultKeys: [`${far ? "Shift+" : ""}Arrow${name}`],
        capability: "edit.full",
        when: (c) => canvasFocused(c) && (hasSelection(c) || !!c.schematic),
        run: (c) => {
          if (hasSelection(c)) {
            c.edits.edit({ key: "edit.nudge" }, (d) => moveSelection(d, sel(c), dx * step, dy * step), { coalesceKey: "nudge" });
          } else if (c.schematic) {
            const px = c.schematic.view.scale * step;
            c.schematic.view.panBy(-dx * px, -dy * px);
            c.scheduler.invalidateAll();
          }
        },
      });
    }
  }
  r.register({
    id: "edit.label",
    label: { key: "cmd.editLabel" },
    defaultKeys: ["F2"],
    capability: "edit.values",
    when: (c) => !!editTarget(c),
    run: (c) => shellOf(c).ui.set({ editing: editTarget(c) ?? null }),
  });
  r.register({
    id: "edit.addSlider",
    label: { key: "cmd.addSlider" },
    when: (c) => {
      const ids = c.selectedParts();
      return ids.length === 1 && sliderableProps(getDescriptor(c.edits.doc.parts[ids[0]].type)).length > 0;
    },
    run: (c, args) => {
      const a = (args ?? {}) as { part?: string; prop?: string };
      const part = c.edits.doc.parts[a.part ?? c.selectedParts()[0]];
      const spec = sliderableProps(getDescriptor(part?.type ?? "")).find((p) => !a.prop || p.key === a.prop);
      if (!part || !spec) return;
      c.edits.edit({ key: "edit.slider" }, (d) => void addSlider(d, newId("sl"), part, spec));
    },
  });
  r.register({
    id: "edit.removeSlider",
    label: { key: "cmd.removeSlider" },
    run: (c, args) => {
      const id = (args as { slider?: string } | undefined)?.slider;
      if (id && c.edits.doc.sliders[id]) c.edits.edit({ key: "edit.slider" }, (d) => void delete d.sliders[id]);
    },
  });
  // ACC-05: Enter on a palette entry drops the part at the view center, selected, ready for the arrows.
  r.register({
    id: "edit.placeAtCenter",
    label: { key: "cmd.placeAtCenter" },
    run: (c, args) => {
      const type = typeof args === "string" ? args : (args as { type?: string } | undefined)?.type;
      const d = type ? getDescriptor(type) : undefined;
      if (!type || !d) return;
      const v = c.schematic?.view;
      const center = v ? v.snap({ x: v.width / 2, y: v.height / 2 }) : { x: 0, y: 0 };
      const id = newId("p");
      c.edits.edit({ key: "edit.place", values: { type } }, (doc) => {
        doc.parts[id] = {
          id,
          type,
          label: nextLabel(doc, d.labelPrefix),
          at: center,
          orientation: { rot: 0, flip: false },
          ...(d.stretchable ? { length: d.stretchable.default } : {}),
          props: defaultProps(d),
        };
      });
      c.setTool({ id: "select" });
      c.store.set({ selection: [id] });
      shellOf(c).focus.focusPart(id);
    },
  });
}

/** The one selected part, else the part under the keyboard focus. */
function editTarget(c: AppController): string | undefined {
  const parts = c.selectedParts();
  if (parts.length === 1) return parts[0];
  const f = shellOf(c).focus.store.get().focus;
  return f?.kind === "part" ? f.id : f?.kind === "terminal" ? f.part : undefined;
}

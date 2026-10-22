import { CommandRegistry, isTypingTarget } from "../src/commands/registry";
import { chordFromEvent, normalizeChord } from "../src/commands/keymap";

const ev = (key: string, m: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...m,
});

describe("keymap", () => {
  test("Mod resolves per platform and modifiers are ordered", () => {
    expect(normalizeChord("Mod+Shift+z", true)).toBe("Shift+Meta+Z");
    expect(normalizeChord("Shift+Mod+Z", false)).toBe("Ctrl+Shift+Z");
    expect(normalizeChord("Space", false)).toBe("Space");
  });

  test("events map to the same canonical chord", () => {
    expect(chordFromEvent(ev(" "))).toBe("Space");
    expect(chordFromEvent(ev("z", { metaKey: true, shiftKey: true }))).toBe("Shift+Meta+Z");
    expect(chordFromEvent(ev("Delete"))).toBe("Delete");
  });
});

describe("CommandRegistry", () => {
  function setup(mac = false) {
    const ctx = { log: [] as string[], canUndo: false };
    const r = new CommandRegistry(() => ctx, mac);
    r.register({ id: "sim.runPause", label: { key: "x" }, defaultKeys: ["Space"], run: (c) => void c.log.push("run") });
    r.register({ id: "edit.undo", label: { key: "x" }, defaultKeys: ["Mod+Z"], when: (c) => c.canUndo, run: (c) => void c.log.push("undo") });
    r.register({ id: "edit.rotateCW", label: { key: "x" }, defaultKeys: ["R"], run: (c) => void c.log.push("rotate") });
    return { ctx, r };
  }

  test("keyboard dispatch: space, Ctrl+Z (non-Mac), R", () => {
    const { ctx, r } = setup(false);
    expect(r.handleKey(ev(" "))).toBe("sim.runPause");
    expect(r.handleKey(ev("z", { ctrlKey: true }))).toBeUndefined(); // disabled: nothing to undo
    ctx.canUndo = true;
    expect(r.handleKey(ev("z", { ctrlKey: true }))).toBe("edit.undo");
    expect(r.handleKey(ev("z", { metaKey: true }))).toBeUndefined();
    expect(r.handleKey(ev("r"))).toBe("edit.rotateCW");
    expect(r.handleKey(ev("r", { ctrlKey: true }))).toBeUndefined();
    expect(ctx.log).toEqual(["run", "undo", "rotate"]);
  });

  test("Cmd+Z on Mac", () => {
    const { ctx, r } = setup(true);
    ctx.canUndo = true;
    expect(r.handleKey(ev("z", { metaKey: true }))).toBe("edit.undo");
  });

  test("conflicts are reported and run notifies listeners", () => {
    const { r } = setup();
    expect(r.conflicts()).toEqual([]);
    r.bind("Space", "edit.rotateCW");
    expect(r.conflicts()).toEqual([{ chord: "Space", commands: ["sim.runPause", "edit.rotateCW"] }]);
    const seen: string[] = [];
    r.onRun((id) => seen.push(id));
    r.run("sim.runPause");
    expect(seen).toEqual(["sim.runPause"]);
    expect(() => r.register({ id: "sim.runPause", label: { key: "x" }, run() {} })).toThrow();
  });

  test("typing targets swallow shortcuts", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "text" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
  });
});

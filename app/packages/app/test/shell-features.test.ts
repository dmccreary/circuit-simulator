import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { displayStateSize, type CircuitDocument } from "@cs/model";
import { getDescriptor, terminalPositions } from "@cs/elements";
import { getView } from "@cs/elements/views";
import { THEMES, lightTheme, themeCssVars, themeFor } from "@cs/render";
import { AppController } from "../src/controller";
import { rcChargingCircuit } from "../src/demo-circuit";
import type { WorkerPort } from "../src/sim/sim-client";
import { shellOf } from "../src/settings/install";
import { applyKeymap, assignKey, conflictsFor, resetKeys } from "../src/settings/keymap";
import { DEFAULT_LEARNER, LEARNER_KEY, loadLearner, sanitizeLearner, saveLearner, type StorageLike } from "../src/settings/learner";
import { adjustTheme } from "../src/settings/session";
import { cycleTerminal, neighbor, readingOrder, stepPart, type FocusGeometry } from "../src/a11y/focus";
import { describeCircuit } from "../src/a11y/describe";
import { Announcer } from "../src/a11y/announcer";
import { shortcutGroups } from "../src/a11y/shortcut-list";
import { makeFragment, parseFragment, serializeFragment } from "../src/edit/clipboard";
import { sliderPosition, sliderValue } from "../src/edit/sliders";
import { arrangementFor, clampChartFrac, classifyLayout, widthClass } from "../src/layout/classify";
import { TouchGestures } from "../src/tools/gestures";
import { WireTool, jumpTarget } from "../src/tools/wire";
import { currentLocale, loadLocale, setLocale } from "../src/i18n";
import { t } from "../src/messages";

const key = (k: string, m: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...m,
});

function controller(doc: CircuitDocument = rcChargingCircuit()) {
  const port: WorkerPort = { postMessage: () => {}, onmessage: null };
  const c = new AppController(doc, { worker: port });
  return { c, sh: shellOf(c) };
}

const terminals = (p: CircuitDocument["parts"][string]) => {
  const d = getDescriptor(p.type);
  return d ? terminalPositions(p, d) : [];
};

describe("editing commands", () => {
  test("rotate CW / CCW around the selection center, undoable", () => {
    const { c } = controller();
    c.store.set({ selection: ["R1"] });
    expect(c.commands.run("edit.rotateCW")).toBe(true);
    const r = c.edits.doc.parts.R1;
    expect(r.orientation.rot).toBe(90);
    expect(terminals(r)).toEqual([{ x: 10, y: -2 }, { x: 10, y: 2 }]); // turned about its middle (10, 0)
    c.commands.run("edit.rotateCCW");
    expect(c.edits.doc.parts.R1.at).toEqual({ x: 8, y: 0 });
    expect(c.edits.doc.parts.R1.orientation.rot).toBe(0);
    c.edits.undo();
    c.edits.undo();
    expect(c.edits.doc.parts.R1).toEqual(rcChargingCircuit().parts.R1);
  });

  test("flip mirrors positions and orientation about the center", () => {
    const { c } = controller();
    c.store.set({ selection: ["R1"] });
    c.commands.run("edit.flipH");
    const r = c.edits.doc.parts.R1;
    expect(r.orientation).toEqual({ rot: 180, flip: true });
    expect(r.at).toEqual({ x: 12, y: 0 });
    expect(terminals(r)).toEqual([{ x: 12, y: 0 }, { x: 8, y: 0 }]);
    c.store.set({ selection: ["C1"] });
    c.commands.run("edit.flipV");
    expect(terminals(c.edits.doc.parts.C1)).toEqual([{ x: 16, y: 6 }, { x: 16, y: 2 }]);
    c.edits.undo();
    c.edits.undo();
    expect(c.edits.doc.parts.R1).toEqual(rcChargingCircuit().parts.R1);
    expect(c.edits.doc.parts.C1).toEqual(rcChargingCircuit().parts.C1);
  });

  test("wires in the selection move with it", () => {
    const { c } = controller();
    c.store.set({ selection: ["w4"] });
    c.commands.run("edit.flipV"); // w4 spans y 6..10, so it mirrors about y = 8
    expect(c.edits.doc.wires.w4.points).toEqual([{ x: 16, y: 10 }, { x: 16, y: 6 }, { x: 0, y: 6 }]);
  });

  test("copy / paste / duplicate give fresh ids and labels; cut deletes; each is one undo step", async () => {
    const { c, sh } = controller();
    c.store.set({ selection: ["R1", "w2"] });
    expect(c.commands.run("edit.copy")).toBe(true);
    expect(parseFragment(sh.clipboard.text!)?.parts.map((p) => p.label)).toEqual(["R1"]);
    c.commands.run("edit.paste");
    await Promise.resolve();
    const sel = c.store.get().selection;
    expect(sel).toHaveLength(2);
    const pasted = c.edits.doc.parts[sel.find((id) => c.edits.doc.parts[id])!];
    expect(pasted.label).toBe("R2");
    expect(pasted.at).toEqual({ x: 10, y: 2 });
    c.commands.run("edit.duplicate");
    expect(Object.keys(c.edits.doc.parts)).toHaveLength(7);
    c.edits.undo();
    c.edits.undo();
    expect(Object.keys(c.edits.doc.parts)).toHaveLength(5);
    c.store.set({ selection: ["R1"] });
    c.commands.run("edit.cut");
    expect(c.edits.doc.parts.R1).toBeUndefined();
    c.edits.undo();
    expect(c.edits.doc.parts.R1).toBeDefined();
  });

  test("fragments round-trip as JSON and reject other text", () => {
    const f = makeFragment(rcChargingCircuit(), ["R1", "w1"])!;
    expect(parseFragment(serializeFragment(f))).toEqual(f);
    expect(parseFragment("$ 1 0.000005 10")).toBeUndefined();
    expect(parseFragment('{"kind":"other"}')).toBeUndefined();
  });

  test("arrows nudge (Shift = 5) only while the canvas has focus; one coalesced undo step", () => {
    const { c, sh } = controller();
    c.store.set({ selection: ["R1"] });
    expect(c.commands.handleKey(key("ArrowRight"))).toBeUndefined();
    sh.focus.setCanvasFocused(true);
    expect(c.commands.handleKey(key("ArrowRight"))).toBe("edit.moveRight");
    c.commands.handleKey(key("ArrowDown", { shiftKey: true }));
    expect(c.edits.doc.parts.R1.at).toEqual({ x: 9, y: 5 });
    c.edits.undo();
    expect(c.edits.doc.parts.R1.at).toEqual({ x: 8, y: 0 });
  });

  test("select all, Esc clears the selection", () => {
    const { c } = controller();
    expect(c.commands.keysFor("edit.selectAll")[0]).toMatch(/^(Ctrl|Meta)\+A$/);
    c.commands.run("edit.selectAll");
    expect(c.store.get().selection).toHaveLength(10);
    expect(c.tools.key(key("Escape"))).toBe(true);
    expect(c.store.get().selection).toEqual([]);
  });

  test("add slider for the selected part; slider positions map log-scale values", () => {
    const { c } = controller();
    c.store.set({ selection: ["R1"] });
    c.commands.run("edit.addSlider");
    const s = Object.values(c.edits.doc.sliders)[0];
    expect(s).toMatchObject({ part: "R1", prop: "resistance", min: 1e3, max: 1e5, log: true });
    expect(sliderValue(s, 0.5)).toBeCloseTo(1e4);
    expect(sliderPosition(s, 1e4)).toBeCloseTo(0.5);
    c.commands.run("edit.addSlider"); // no duplicates
    expect(Object.keys(c.edits.doc.sliders)).toHaveLength(1);
    c.edits.undo();
    expect(Object.keys(c.edits.doc.sliders)).toHaveLength(0);
  });

  test("F2 opens the in-place editor for the selected part", () => {
    const { c, sh } = controller();
    c.store.set({ selection: ["C1"] });
    c.commands.handleKey(key("F2"));
    expect(sh.ui.get().editing).toBe("C1");
  });
});

describe("key remapping (SET-06)", () => {
  test("conflicts are reported, stealing moves the key, reset restores defaults", () => {
    const { c } = controller();
    const r = c.commands;
    expect(r.conflicts()).toEqual([]);
    expect(conflictsFor(r, "F", "edit.flipH", false)).toEqual(["view.fit"]);
    let map = assignKey(r, {}, "edit.flipH", "F", false, true);
    applyKeymap(r, map);
    expect(r.conflicts()).toEqual([]);
    expect(r.keysFor("view.fit")).toEqual([]);
    c.store.set({ selection: ["R1"] });
    expect(r.handleKey(key("f"))).toBe("edit.flipH");
    // Without stealing, both commands share the chord and the registry flags it.
    map = assignKey(r, {}, "edit.flipH", "F", false, false);
    applyKeymap(r, map);
    expect(r.conflicts()).toEqual([{ chord: "F", commands: ["edit.flipH", "view.fit"].sort((a, b) => (a === "view.fit" ? -1 : b === "view.fit" ? 1 : 0)) }]);
    applyKeymap(r, resetKeys(map));
    expect(r.keysFor("edit.flipH")).toEqual(["X"]);
    expect(r.keysFor("view.fit")).toEqual(["F"]);
  });

  test("learner keymap is applied and persisted", () => {
    const { c, sh } = controller();
    sh.settings.update({ keymap: { "sim.step": ["N"] } });
    expect(c.commands.keysFor("sim.step")).toEqual(["N"]);
    expect(shortcutGroups(c.commands, false).flatMap((g) => g.rows).find((r) => r.id === "sim.step")?.keys).toEqual(["N"]);
  });
});

describe("learner settings", () => {
  function memory(): StorageLike & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  test("round-trip through storage; bad values fall back to defaults", () => {
    const st = memory();
    saveLearner(st, { ...DEFAULT_LEARNER, theme: "high-contrast", keymap: { "sim.step": ["N"] }, layout: { chartFrac: 0.3 } });
    expect(loadLearner(st)).toMatchObject({ theme: "high-contrast", keymap: { "sim.step": ["N"] }, layout: { chartFrac: 0.3 } });
    st.data.set(LEARNER_KEY, "{not json");
    expect(loadLearner(st)).toEqual(DEFAULT_LEARNER);
    expect(sanitizeLearner({ version: 1, theme: "neon", reducedMotion: "on", layout: { chartFrac: 5 } })).toMatchObject({
      theme: "auto",
      reducedMotion: "on",
      layout: { chartFrac: 0.9 },
    });
    expect(sanitizeLearner({ version: 2, theme: "dark" }).theme).toBe("auto");
  });

  test("theme, motion, current display and voltage colors reach the controller", () => {
    const { c, sh } = controller();
    sh.settings.update({ theme: "high-contrast", voltageColors: "blue-orange" });
    expect(c.store.get().theme).toBe("high-contrast");
    expect(c.store.get().dark).toBe(true);
    expect(c.theme().name).toBe("high-contrast");
    expect(c.theme().voltPos).toEqual([230, 159, 0]);
    sh.settings.update({ voltageColors: "off" });
    expect(c.theme().voltPos).toEqual(c.theme().voltZero);
    sh.settings.restoreDefaults();
    expect(sh.settings.get()).toEqual(DEFAULT_LEARNER);
  });

  test("circuit settings are undoable document edits", () => {
    const { c } = controller();
    c.edits.edit({ key: "edit.circuitSettings" }, (d) => void (d.settings.maxTimeStep = 1e-5));
    expect(c.edits.doc.settings.maxTimeStep).toBe(1e-5);
    c.edits.undo();
    expect(c.edits.doc.settings.maxTimeStep).toBeUndefined();
  });
});

describe("canvas focus (ACC-03, ACC-04)", () => {
  const g: FocusGeometry = { doc: rcChargingCircuit(), terminals };

  test("reading order is top-left to bottom-right", () => {
    expect(readingOrder(g)).toEqual(["S1", "R1", "C1", "V1", "G1"]);
    expect(stepPart(g, undefined, 1)).toEqual({ kind: "part", id: "S1" });
    expect(stepPart(g, { kind: "part", id: "G1" }, 1)).toBeUndefined(); // Tab leaves the canvas
    expect(stepPart(g, { kind: "part", id: "S1" }, -1)).toBeUndefined();
  });

  test("Alt+arrows follow connections; [ ] cycle terminals", () => {
    expect(neighbor(g, { kind: "part", id: "R1" }, "right")).toEqual({ kind: "wire", id: "w3" });
    expect(neighbor(g, { kind: "part", id: "R1" }, "left")).toEqual({ kind: "wire", id: "w2" });
    expect(neighbor(g, { kind: "wire", id: "w2" }, "left")).toEqual({ kind: "part", id: "S1" });
    expect(neighbor(g, { kind: "part", id: "R1" }, "up")).toBeUndefined();
    expect(cycleTerminal(g, { kind: "part", id: "R1" }, 1)).toEqual({ kind: "terminal", part: "R1", terminal: 0 });
    expect(cycleTerminal(g, { kind: "terminal", part: "R1", terminal: 1 }, 1)).toEqual({ kind: "terminal", part: "R1", terminal: 0 });
  });

  test("keys drive the focus session only while the canvas is focused; Enter selects", () => {
    const { c, sh } = controller();
    expect(c.commands.handleKey(key("Tab"))).toBeUndefined();
    sh.focus.setCanvasFocused(true);
    c.commands.handleKey(key("Tab"));
    c.commands.handleKey(key("Tab"));
    expect(sh.focus.focus).toEqual({ kind: "part", id: "R1" });
    c.commands.handleKey(key("ArrowRight", { altKey: true }));
    expect(sh.focus.focus).toEqual({ kind: "wire", id: "w3" });
    c.commands.handleKey(key("Tab", { shiftKey: true })); // from the wire back to R1
    c.commands.handleKey(key("Enter"));
    expect(c.store.get().selection).toEqual(["R1"]);
  });

  test("W on a focused terminal draws a wire with arrows and Enter", () => {
    globalThis.requestAnimationFrame ??= (() => 0) as never;
    const { c, sh } = controller();
    sh.focus.setCanvasFocused(true);
    sh.focus.set({ kind: "terminal", part: "S1", terminal: 0 }); // (2, 0)
    c.commands.handleKey(key("w"));
    expect(c.tools.tool).toBeInstanceOf(WireTool);
    expect(c.tools.key(key("ArrowDown"))).toBe(true); // jumps to V1's + terminal at (0, 4)
    expect((c.tools.tool as WireTool).end).toEqual({ x: 0, y: 4 });
    c.tools.key(key("ArrowRight", { shiftKey: true })); // one grid step
    c.tools.key(key("ArrowLeft", { shiftKey: true }));
    const before = Object.keys(c.edits.doc.wires).length;
    c.tools.key(key("Enter"));
    const wires = Object.values(c.edits.doc.wires);
    expect(wires).toHaveLength(before + 1);
    expect(wires.at(-1)!.points[0]).toEqual({ x: 2, y: 0 });
    expect(wires.at(-1)!.points.at(-1)).toEqual({ x: 0, y: 4 });
    expect(jumpTarget({ x: 0, y: 0 }, { x: 1, y: 0 }, [{ x: 0, y: 5 }])).toBeUndefined();
  });
});

describe("circuit description (ACC-06, ACC-07)", () => {
  test("parts in reading order with values, nodes, and live readings", () => {
    const { c } = controller();
    const cc = c.compiled!;
    const src = { doc: c.edits.doc, compiled: cc, getView, getDescriptor, terminals };
    const plain = describeCircuit(src);
    expect(plain.map((d) => d.id)).toEqual(["S1", "R1", "C1", "V1", "G1"]);
    const r1 = plain.find((d) => d.id === "R1")!;
    expect(r1.text).toContain("R1");
    expect(r1.text).toMatch(/10(\.0)? kΩ/);
    expect(r1.nodes).toHaveLength(2);
    expect(r1.text).toContain("connected to");
    expect(r1.live).toEqual([]);
    const display = new Float64Array(displayStateSize(cc.netlist)).fill(0);
    const el = cc.netlist.elements.find((e) => e.id === "R1")!;
    display[el.nodes[0]] = 5;
    const live = describeCircuit({ ...src, display, decimal: "," }).find((d) => d.id === "R1")!;
    expect(live.live.join(" ")).toContain("voltage 5");
    expect(live.text).toContain("current");
  });
});

describe("themes (ACC-11, ACC-12)", () => {
  test("every theme defines every token", () => {
    const tokenKeys = Object.keys(lightTheme.tokens).sort();
    const uiKeys = Object.keys(lightTheme.ui).sort();
    for (const th of Object.values(THEMES)) {
      expect(Object.keys(th.tokens).sort()).toEqual(tokenKeys);
      expect(Object.keys(th.ui).sort()).toEqual(uiKeys);
      for (const v of [...Object.values(th.tokens), ...Object.values(th.ui), ...Object.values(th.chart), th.focus, th.grid, th.selection, th.dot]) {
        expect(v).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(th.probes.length).toBeGreaterThanOrEqual(8);
      expect(new Set(th.probes).size).toBe(th.probes.length);
      expect(th.focus).not.toBe(th.selection); // focus ring distinct from selection (ACC-03)
    }
    expect(themeFor("high-contrast").name).toBe("high-contrast");
    expect(themeFor(true).name).toBe("dark");
  });

  test("CSS variables match the theme tokens in styles.css", () => {
    const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
    const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
    for (const [sel, th] of [
      [":root {", THEMES.light],
      ['.shell[data-theme="dark"] {', THEMES.dark],
      ['.files-layer[data-theme="high-contrast"] {', THEMES["high-contrast"]],
    ] as const) {
      const text = block(sel);
      for (const [k, v] of Object.entries(themeCssVars(th))) {
        if (k === "--focus" && sel !== '.files-layer[data-theme="high-contrast"] {') continue;
        expect(text, `${sel} ${k}`).toContain(`${k}: ${v}`);
      }
    }
  });

  test("color-blind safe voltage scale", () => {
    const th = adjustTheme(lightTheme, { voltageColors: "blue-orange" });
    expect(th.voltNeg).toEqual([0, 114, 178]);
    expect(adjustTheme(lightTheme, { voltageColors: "red-green" })).toBe(lightTheme);
  });
});

describe("layout classes (spec §5)", () => {
  test("width and height breakpoints", () => {
    expect([1600, 1440, 1439, 1024, 1023, 720, 719, 320].map(widthClass)).toEqual([
      "xwide",
      "xwide",
      "wide",
      "wide",
      "medium",
      "medium",
      "narrow",
      "narrow",
    ]);
    expect(classifyLayout(1200, 500, true)).toEqual({ width: "wide", height: "short", pointer: "coarse", arrangement: "side" });
    expect(arrangementFor("wide", 600)).toBe("stacked"); // LAY-10: no room for 360 + 320
    expect(arrangementFor("medium", 1000)).toBe("stacked");
    expect(arrangementFor("narrow", 700)).toBe("single");
  });

  test("chart share respects minimum sizes side by side", () => {
    expect(clampChartFrac(0.05, "stacked", 800)).toBe(0.15);
    expect(clampChartFrac(0.1, "side", 1000)).toBeCloseTo(0.32);
    expect(clampChartFrac(0.9, "side", 1000)).toBeCloseTo(0.64);
  });
});

describe("announcer (ACC-08)", () => {
  test("at most once per kind every two seconds; the last message wins", () => {
    vi.useFakeTimers();
    let now = 0;
    const a = new Announcer(2000, () => now);
    a.say("run", "Running");
    a.say("run", "Paused");
    a.say("run", "Running again");
    a.say("switch", "S1 closed");
    expect(a.store.get().text).toBe("S1 closed");
    now = 2000;
    vi.advanceTimersByTime(2000);
    expect(a.store.get().text).toBe("Running again");
    expect(a.store.get().seq).toBe(3);
    vi.useRealTimers();
  });

  test("switch flips and run state are announced", () => {
    const { c, sh } = controller();
    c.edits.edit({ key: "edit.toggle" }, (d) => void (d.parts.S1.props.closed = true));
    expect(sh.announcer.store.get().text).toBe("S1 closed");
    c.store.set({ runState: "running" });
    expect(sh.announcer.store.get().text).toBe("Simulation running");
  });
});

describe("touch gestures (RSP-14)", () => {
  test("two fingers pan and pinch; the tool gesture is cancelled", () => {
    const calls: string[] = [];
    const view = { panBy: (dx: number, dy: number) => calls.push(`pan ${dx},${dy}`), zoomAbout: (_p: unknown, f: number) => calls.push(`zoom ${f}`) };
    const g = new TouchGestures(() => view, { begin: () => calls.push("begin"), changed: () => {} });
    expect(g.down(1, { x: 0, y: 0 })).toBe(false); // one finger goes to the tool
    expect(g.down(2, { x: 100, y: 0 })).toBe(true);
    expect(calls).toEqual(["begin"]);
    expect(g.move(2, { x: 200, y: 0 })).toBe(true);
    expect(calls).toEqual(["begin", "pan 50,0", "zoom 2"]);
    expect(g.up(2)).toBe(true);
    expect(g.move(1, { x: 5, y: 5 })).toBe(true); // still consumed until every finger lifts
    expect(g.up(1)).toBe(true);
    expect(g.down(3, { x: 0, y: 0 })).toBe(false);
  });
});

describe("i18n", () => {
  test("a locale overlays English; missing keys stay English; failures keep the language", async () => {
    expect(t("cmd.copy")).toBe("Copy");
    expect(await loadLocale("fr", async () => ({ "cmd.copy": "Copier" }))).toBe(true);
    expect(t("cmd.copy")).toBe("Copier");
    expect(t("cmd.paste")).toBe("Paste");
    expect(currentLocale()).toBe("fr");
    expect(await loadLocale("xx", async () => Promise.reject(new Error("404")))).toBe(false);
    expect(currentLocale()).toBe("fr");
    setLocale("en");
    expect(t("cmd.copy")).toBe("Copy");
  });
});

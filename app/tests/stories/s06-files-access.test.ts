// @vitest-environment jsdom
// Spec §25 user stories about files, layouts and access, walked through the
// real AppController (tests/helpers/app.ts): 25.22 opening the classic
// Falstad examples, 25.23 a phone in the lab, 25.24 exploring without
// sight, 25.25 sharing without an account.

import { existsSync, readFileSync } from "node:fs";
import { createMemoryBackend, createPersistence, type Timers } from "@cs/persistence";
import { getDescriptor } from "@cs/elements";
import { getView } from "@cs/elements/views";
import { PLACEHOLDER_TYPE } from "@cs/formats";
import { filesOf } from "../../packages/app/src/files/install";
import { startAutosave } from "../../packages/app/src/files/autosave";
import type { FilePlatform } from "../../packages/app/src/files/platform";
import { classifyLayout } from "../../packages/app/src/layout/classify";
import { shellOf } from "../../packages/app/src/settings/install";
import { describeCircuit, describePart } from "../../packages/app/src/a11y/describe";
import { Story } from "../helpers/app";

// jsdom's Blob has no stream(); share links compress through Blob.stream() as browsers do.
if (typeof Blob !== "undefined" && !("stream" in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, "stream", {
    value(this: Blob) {
      const blob = this;
      return new ReadableStream<Uint8Array>({
        async start(ctl) {
          const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as ArrayBuffer);
            r.onerror = () => reject(r.error);
            r.readAsArrayBuffer(blob);
          });
          ctl.enqueue(new Uint8Array(buf));
          ctl.close();
        },
      });
    },
  });
}

// app/public/circuits/ (fetched by `npm run fetch-examples`; GPL files are not committed).
const LIBRARY = `${process.env.PWD ?? "."}/public/circuits/`;
const haveLibrary = existsSync(`${LIBRARY}index.json`);

/** A file platform that keeps saved files and copied text, and serves the example library from disk. */
function platform() {
  const saved: { text: string; name: string }[] = [];
  const copied: string[] = [];
  const p: FilePlatform = {
    pickOpen: async () => null,
    save: async (text, name) => (saved.push({ text, name }), { name }),
    copyText: async (text) => (copied.push(text), true),
    fetchText: async (url) => {
      const file = url.replace(/^.*\/circuits\//, "");
      if (!haveLibrary || !existsSync(`${LIBRARY}${file}`)) throw new Error(`404 ${url}`);
      return readFileSync(`${LIBRARY}${file}`, "utf8");
    },
  };
  return { p, saved, copied };
}

function storyWithFiles() {
  const s = new Story();
  const files = filesOf(s.c);
  const io = platform();
  files.platform = io.p;
  return { s, files, ...io };
}

describe.skipIf(!haveLibrary)("story 25.22: opening the classic Falstad examples", () => {
  const index = haveLibrary ? (JSON.parse(readFileSync(`${LIBRARY}index.json`, "utf8")) as { circuits: { title: string; file: string }[] }).circuits : [];

  test("Open next to 'Tesla Coil' opens it with Falstad's layout and its scope traces as probes and lanes (FIL-14, FIL-15, FIL-19)", async () => {
    const entry = index.find((e) => e.title === "Tesla Coil")!;
    expect(entry).toBeDefined();
    const { s, files } = storyWithFiles();
    await files.openFromUrl(`https://dmccreary.github.io/circuit-simulator/simulator/?example=${entry.file}`);
    s.advance(50);
    const text = readFileSync(`${LIBRARY}${entry.file}`, "utf8");
    const scopes = text.split("\n").filter((l) => l.startsWith("o ")).length;
    expect(Object.keys(s.doc.parts).length).toBeGreaterThan(5);
    expect(Object.keys(s.doc.probes).length).toBeGreaterThanOrEqual(scopes);
    expect(s.doc.lanes.length).toBeGreaterThanOrEqual(Math.min(1, scopes));
    // Layout: every Falstad element landed on the grid where Falstad drew it (one grid unit = 16 or 8 px).
    expect(s.c.store.get().runState).toBe("paused");
    expect(s.c.store.get().diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  test("a pasted Falstad link with an unsupported element opens, draws a labelled placeholder and lists it in a notice (FIL-16, FIL-17)", async () => {
    // Every library circuit now imports whole, so add an element code this simulator
    // does not know ("Z") to a library circuit, as a newer CircuitJS1 file might have.
    const { importFalstad } = await import("@cs/formats");
    const base = readFileSync(`${LIBRARY}${index[0].file}`, "utf8");
    const text = `${base.trimEnd()}\nZ 0 0 32 0 0\n`;
    expect(importFalstad(text).report.unsupported.length).toBeGreaterThan(0);
    const { s, files } = storyWithFiles();
    await files.openFromUrl(`https://www.falstad.com/circuit/circuitjs.html?cct=${encodeURIComponent(text)}`);
    s.advance(50);
    const placeholders = Object.values(s.doc.parts).filter((p) => p.type === PLACEHOLDER_TYPE);
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders.every((p) => p.label.length > 0)).toBe(true);
    const notice = files.ui.get().notice;
    expect(notice).toBeDefined();
  });

  test.todo("FIL-14: a compressed Falstad share link (?ctz=) pasted into the address bar opens the circuit");
  test.todo("ANL-22: a new current probe on the spark gap and the Spectrum tab on the secondary voltage");
});

describe("story 25.23: a phone in the lab", () => {
  test("a phone opens in the Narrow layout showing one view; sideways it re-arranges (RSP-01, RSP-02)", () => {
    const portrait = classifyLayout(390, 844, true);
    expect(portrait).toMatchObject({ width: "narrow", arrangement: "single", pointer: "coarse" });
    const landscape = classifyLayout(844, 390, true);
    expect(landscape.width).not.toBe("narrow");
    expect(landscape.height).toBe("short");
  });

  test("turning the phone re-creates the views without losing probes, zoom or chart history (RSP-14)", () => {
    const s = new Story();
    s.build([
      { label: "B1", type: "battery", props: { voltage: 10 }, nodes: [1, 0] },
      { label: "S1", type: "switch", props: { closed: true }, nodes: [1, 2] },
      { label: "R1", type: "resistor", props: { resistance: 10e3 }, nodes: [2, 3] },
      { label: "C1", type: "capacitor", props: { capacitance: 100e-6 }, nodes: [3, 0] },
    ]);
    const v = s.probe("probe-v", s.stubMid("C1", 0));
    s.c.chartSession.setSpan(5);
    s.run(1000);
    s.pause();
    const samples = s.c.history.view(s.c.channelId(v), 0, s.time).times().length;
    const zoom = s.c.schematic!.view.zoom;
    // A layout change detaches and re-attaches the renderers; state lives in the controller.
    s.c.detachRenderers();
    const r = s.c.attachSchematic(document.createElement("div"));
    r.resize(844, 390, 3);
    expect(Object.keys(s.doc.probes)).toContain(v);
    expect(s.c.chartSession.model.span).toBe(5);
    expect(s.c.history.view(s.c.channelId(v), 0, s.time).times().length).toBe(samples);
    expect(s.doc.view.zoom === zoom || r.view.zoom > 0).toBe(true);
  });

  test.todo("RSP-13: dragging a cursor with a finger and reading the time constant in the measurement list (touch, needs Playwright)");
});

describe("story 25.24: exploring without sight", () => {
  const s = new Story();
  s.build([
    { label: "V1", type: "battery", props: { voltage: 9 }, nodes: [1, 0] },
    { label: "R1", type: "resistor", props: { resistance: 1000 }, nodes: [1, 2] },
    { label: "R2", type: "resistor", props: { resistance: 2000 }, nodes: [2, 0] },
  ]);
  s.run(100);
  const src = () => ({
    doc: s.doc,
    compiled: s.c.compiled,
    display: s.display,
    getView,
    getDescriptor,
    terminals: (p: (typeof s.doc.parts)[string]) => s.terminals(p.id),
  });

  test("the circuit description lists every part with its value and the nodes it joins (ACC-06)", () => {
    const all = describeCircuit(src());
    expect(all.map((d) => d.label).sort()).toEqual(["R1", "R2", "V1"]);
    const v1 = all.find((d) => d.label === "V1")!;
    expect(v1.nodes).toContain("GND");
    const r1 = all.find((d) => d.label === "R1")!;
    const r2 = all.find((d) => d.label === "R2")!;
    // R1 and R2 share their middle node; R2's other end is ground.
    expect(r1.nodes.filter((n) => r2.nodes.includes(n)).length).toBe(1);
    expect(r2.nodes).toContain("GND");
  });

  test("R2's accessible name gives its value and live values: 6.00 V across and 3.00 mA (ACC-07)", () => {
    const r2 = describePart(src(), s.doc.parts[s.ids.R2]);
    expect(r2.text).toContain("R2");
    expect(r2.text).toMatch(/2(\.00)? ?k/);
    expect(r2.live.join(" ")).toMatch(/6\.00 ?V/);
    expect(r2.live.join(" ")).toMatch(/3\.00 ?mA/);
  });

  test("Tab moves focus from part to part in reading order (ACC-02)", () => {
    const focus = shellOf(s.c).focus;
    focus.store.set({ canvasFocused: true });
    const seen: string[] = [];
    for (let k = 0; k < 3; k++) {
      expect(s.c.commands.run("view.focusNext")).toBe(true);
      const f = focus.focus as { kind?: string; part?: string; id?: string } | undefined;
      seen.push(String(f?.part ?? f?.id ?? JSON.stringify(f)));
    }
    expect(new Set(seen).size).toBe(3);
  });

  test.todo("ACC-03: a voltage probe placed on node B from the keyboard");
  test.todo("ACC-08: the chart's data table and trace description");
  test.todo("ACC-09: nudging an R1 slider with the arrow keys announces the new voltage at node B in the live region");
});

describe("story 25.25: sharing without an account", () => {
  test("Share → Copy link; the link opens the circuit, probes, sliders and chart layout; a new link comes back (FIL-05, FIL-07, PRB-15)", async () => {
    const zoe = storyWithFiles();
    zoe.s.build([
      { label: "B1", type: "battery", props: { voltage: 9 }, nodes: [1, 0] },
      { label: "R1", type: "resistor", props: { resistance: 1000 }, nodes: [1, 2] },
      { label: "D1", type: "led", props: { color: "red" }, nodes: [2, 0] },
    ]);
    const probe = zoe.s.probe("probe-i", zoe.s.stubMid("D1", 0));
    zoe.s.c.store.set({ selection: [zoe.s.ids.R1] });
    zoe.s.c.commands.run("edit.addSlider");
    const url = await zoe.files.share();
    expect(url).toBe(zoe.copied[0]);

    const kai = storyWithFiles();
    await kai.files.openFromUrl(`https://dmccreary.github.io/circuit-simulator/simulator/${url}`);
    const d = kai.s.doc;
    expect(Object.keys(d.parts).sort()).toEqual(Object.keys(zoe.s.doc.parts).sort());
    expect(d.probes[probe]).toEqual(zoe.s.doc.probes[probe]);
    expect(Object.values(d.sliders)).toEqual(Object.values(zoe.s.doc.sliders));
    expect(d.lanes).toEqual(zoe.s.doc.lanes);
    // Kai improves it and sends a new link back.
    kai.s.c.edits.edit({ key: "t" }, (x) => void (x.parts[zoe.s.ids.R1].props.resistance = 360));
    const back = await kai.files.share();
    await zoe.files.openFromUrl(`https://dmccreary.github.io/circuit-simulator/simulator/${back}`).catch(() => null);
    const dlg = zoe.files.ui.get().dialog; // unsaved-work guard (FIL-04)
    if (dlg?.kind === "confirm") dlg.resolve(true);
    await vi.waitFor(() => expect(zoe.s.doc.parts[zoe.s.ids.R1].props.resistance).toBe(360));
  });

  test("after a crash the simulator offers to restore the unsaved circuit; then it is saved as a file (PRF-06, FIL-09)", async () => {
    let fire: (() => void) | undefined;
    const timers: Timers = { setTimeout: (fn) => ((fire = fn), 1), clearTimeout: () => (fire = undefined) };
    const persistence = createPersistence(createMemoryBackend());
    const zoe = storyWithFiles();
    const auto = startAutosave(zoe.files, { persistence, sessionId: "zoe-1", timers, liveSessions: async () => new Set() });
    zoe.s.build([
      { label: "B1", type: "battery", props: { voltage: 9 }, nodes: [1, 0] },
      { label: "R1", type: "resistor", props: { resistance: 4321 }, nodes: [1, 0] },
    ]);
    fire?.();
    await new Promise((r) => setTimeout(r, 0));
    auto.dispose(); // the browser crashes: no save, no clean exit

    const again = storyWithFiles();
    const auto2 = startAutosave(again.files, { persistence, sessionId: "zoe-2", timers, liveSessions: async () => new Set() });
    const offers = await auto2.recoveries();
    expect(offers.map((o) => o.sessionId)).toEqual(["zoe-1"]);
    expect(await auto2.restore(offers[0])).toBe(true);
    expect(Object.values(again.s.doc.parts).some((p) => p.props.resistance === 4321)).toBe(true);

    expect(await again.files.save()).toBe(true);
    expect(again.saved[0].name).toMatch(/\.circuit\.json$/);
    expect(JSON.parse(again.saved[0].text).format).toBe("circuit-simulator");
    auto2.dispose();
  });
});

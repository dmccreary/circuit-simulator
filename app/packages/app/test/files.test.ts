/// <reference types="vite/client" />
import type { Command } from "@cs/worker";
import { createMemoryBackend, createPersistence, type Timers } from "@cs/persistence";
import { AppController } from "../src/controller";
import { rcChargingCircuit } from "../src/demo-circuit";
import type { WorkerPort } from "../src/sim/sim-client";
import { filesOf } from "../src/files/install";
import { parseStartupUrl } from "../src/files/startup-url";
import { readCircuitText } from "../src/files/read-circuit";
import { startAutosave } from "../src/files/autosave";
import { groupExamples } from "../src/files/examples-index";
import type { FilePlatform } from "../src/files/platform";

const LRC = "$ 1 0.000005 10.2 50 5 43\nr 176 80 384 80 0 10\nc 384 80 384 352 0 0.000015 0\nl 176 352 176 80 0 1 0\nw 384 352 176 352 0\n";

function setup() {
  const sent: Command[] = [];
  const port: WorkerPort = { postMessage: (m) => void sent.push(m), onmessage: null };
  const c = new AppController(rcChargingCircuit(), { worker: port });
  const s = filesOf(c);
  const saved: string[] = [];
  const copied: string[] = [];
  const platform: FilePlatform = {
    pickOpen: async () => null,
    save: async (text, name) => {
      saved.push(text);
      return { name };
    },
    copyText: async (text) => {
      copied.push(text);
      return true;
    },
    fetchText: async (url) => {
      const name = url.replace("./circuits/", "");
      if (name === "lrc.txt") return LRC;
      throw new Error("404 Not Found");
    },
  };
  s.platform = platform;
  return { c, s, sent, saved, copied };
}

const editR1 = (c: AppController, value: number) =>
  c.edits.edit({ key: "t" }, (d) => {
    d.parts.R1.props.resistance = value;
  });

describe("startup URL parameters", () => {
  test("native share links in the fragment or the c parameter", () => {
    expect(parseStartupUrl("https://x.org/sim/#c=abc-_1")).toEqual({ kind: "share", payload: "abc-_1" });
    expect(parseStartupUrl("https://x.org/sim/?mode=run&c=xyz")).toEqual({ kind: "share", payload: "xyz" });
  });

  test("library examples, rejecting paths", () => {
    expect(parseStartupUrl("https://x.org/sim/?example=lrc.txt")).toEqual({ kind: "example", file: "lrc.txt" });
    expect(parseStartupUrl("https://x.org/sim/?example=..%2Fsecret.txt")).toBeNull();
    expect(parseStartupUrl("https://x.org/sim/?example=https://evil/x.txt")).toBeNull();
    expect(parseStartupUrl("https://x.org/sim/?startCircuit=diodecurve.txt")).toEqual({ kind: "example", file: "diodecurve.txt" });
  });

  test("Falstad cct text and circuit URLs", () => {
    const r = parseStartupUrl("https://x.org/sim/?cct=" + encodeURIComponent(LRC));
    expect(r).toEqual({ kind: "falstad", text: LRC });
    expect(parseStartupUrl("https://x.org/sim/?circuit=circuits%2Frc.circuit.json")).toEqual({ kind: "url", url: "circuits/rc.circuit.json" });
    expect(parseStartupUrl("https://x.org/sim/?circuit=javascript:alert(1)")).toBeNull();
    expect(parseStartupUrl("https://x.org/sim/")).toBeNull();
    expect(parseStartupUrl("https://x.org/sim/?mode=edit#top")).toBeNull();
  });
});

describe("reading circuit files", () => {
  test("detects native and Falstad text", () => {
    const { c } = setup();
    const native = readCircuitText(filesOf(c).fileText(), { name: "rc.circuit.json" });
    expect(native.format).toBe("native");
    expect(Object.keys(native.doc.parts).sort()).toEqual(Object.keys(c.edits.doc.parts).sort());
    const f = readCircuitText(LRC, { name: "lrc.txt" });
    expect(f.format).toBe("falstad");
    expect(f.doc.meta.title).toBe("lrc");
    expect(() => readCircuitText("   ")).toThrow();
    expect(() => readCircuitText("{\"hello\": 1}")).toThrow();
  });

  test("groups and searches the example index", () => {
    const entries = [
      { category: "Basics", title: "Ohm's Law", file: "ohms.txt" },
      { category: "Basics", title: "LRC Circuit", file: "lrc.txt" },
      { category: "Diodes", title: "Diode", file: "diode.txt" },
    ];
    expect(groupExamples(entries).map((g) => g.entries.length)).toEqual([2, 1]);
    expect(groupExamples(entries, "lrc").flatMap((g) => g.entries.map((e) => e.file))).toEqual(["lrc.txt"]);
    expect(groupExamples(entries, "diodes")[0].name).toBe("Diodes");
  });
});

describe("file round trip through the controller", () => {
  test("save, edit, guard, reopen: loads paused at t = 0 with the saved values", async () => {
    const { c, s, sent, saved } = setup();
    expect(s.dirty).toBe(false);
    editR1(c, 2200);
    expect(s.dirty).toBe(true);
    expect(await s.save()).toBe(true);
    expect(s.dirty).toBe(false);
    expect(s.fileName).toMatch(/\.circuit\.json$/);
    const text = saved[0];
    expect(JSON.parse(text).format).toBe("circuit-simulator");

    editR1(c, 47);
    c.run();
    // The unsaved-work guard asks first (FIL-04); declining keeps the work.
    const declined = s.openText(text, "rc.circuit.json");
    // The file readers load on demand (a separate chunk), so the guard appears asynchronously.
    await vi.waitFor(() => expect(s.ui.get().dialog?.kind).toBe("confirm"));
    const d = s.ui.get().dialog;
    expect(d?.kind).toBe("confirm");
    if (d?.kind === "confirm") d.resolve(false);
    expect(await declined).toBe(false);
    expect(c.edits.doc.parts.R1.props.resistance).toBe(47);

    const accepted = s.openText(text, "rc.circuit.json");
    await vi.waitFor(() => expect(s.ui.get().dialog?.kind).toBe("confirm"));
    const d2 = s.ui.get().dialog;
    if (d2?.kind === "confirm") d2.resolve(true);
    expect(await accepted).toBe(true);
    expect(c.edits.doc.parts.R1.props.resistance).toBe(2200);
    expect(c.store.get().runState).toBe("paused");
    expect(c.edits.canUndo).toBe(false);
    expect(s.dirty).toBe(false);
    const lastReset = sent.map((m) => m.type).lastIndexOf("reset");
    const tail = sent.slice(lastReset);
    expect(tail.map((m) => m.type)).toContain("load");
    expect(tail.some((m) => m.type === "run")).toBe(false);
  });

  test("share link round trip opens a copy", async () => {
    const { c, s, copied } = setup();
    editR1(c, 3300);
    const url = await s.share();
    expect(url).toBe(copied[0]);
    expect(url).toMatch(/^#c=[A-Za-z0-9_-]+$/);

    const other = setup();
    await other.s.openFromUrl("https://x.org/simulator/" + url);
    expect(other.c.edits.doc.parts.R1.props.resistance).toBe(3300);
    expect(other.s.dirty).toBe(false);
  });

  test("?example= opens a Falstad library circuit with its import report", async () => {
    const { c, s } = setup();
    await s.openFromUrl("https://x.org/simulator/?example=lrc.txt");
    expect(c.edits.doc.meta.title).toBe("lrc");
    expect(Object.values(c.edits.doc.parts).some((p) => p.type === "resistor")).toBe(true);
    await s.openFromUrl("https://x.org/simulator/?example=nope.txt");
    expect(s.ui.get().notice?.error).toBe(true);
  });

  test("every library file reads, text and XML alike (acceptance test 20)", () => {
    // Vite inlines the fetched library (app/public/circuits/, see scripts/fetch-examples.mjs); empty when not fetched.
    const files: Record<string, string> = import.meta.glob("../../../public/circuits/*.txt", { query: "?raw", import: "default", eager: true });
    const failures: string[] = [];
    for (const [path, text] of Object.entries(files)) {
      const file = path.split("/").pop()!;
      try {
        readCircuitText(text, { name: file });
      } catch (e) {
        failures.push(`${file}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("autosave and recovery through the controller", () => {
  test("unsaved work reaches recovery after the pause and is restored in a new tab", async () => {
    let fire: (() => void) | undefined;
    const timers: Timers = { setTimeout: (fn) => ((fire = fn), 1), clearTimeout: () => (fire = undefined) };
    const persistence = createPersistence(createMemoryBackend());
    const a = setup();
    const auto = startAutosave(a.s, { persistence, sessionId: "tab-a", timers, liveSessions: async () => new Set() });

    editR1(a.c, 1234);
    expect(await persistence.recovery.get("tab-a")).toBeUndefined();
    fire?.();
    await new Promise((r) => setTimeout(r, 0));
    expect((await persistence.recovery.get("tab-a"))?.text).toContain("1234");

    // Saving clears the entry: only unsaved work is offered back.
    await a.s.save();
    await new Promise((r) => setTimeout(r, 0));
    expect(await persistence.recovery.get("tab-a")).toBeUndefined();
    editR1(a.c, 5678);
    fire?.();
    await new Promise((r) => setTimeout(r, 0));
    auto.dispose();

    const b = setup();
    const autoB = startAutosave(b.s, { persistence, sessionId: "tab-b", timers, liveSessions: async () => new Set() });
    const offers = await autoB.recoveries();
    expect(offers.map((o) => o.sessionId)).toEqual(["tab-a"]);
    expect(await autoB.restore(offers[0])).toBe(true);
    expect(b.c.edits.doc.parts.R1.props.resistance).toBe(5678);
    expect(b.s.dirty).toBe(true);
    expect(await persistence.recovery.get("tab-a")).toBeUndefined();

    // A tab that is still open is never offered.
    const c3 = setup();
    const auto3 = startAutosave(c3.s, { persistence, sessionId: "tab-c", timers, liveSessions: async () => new Set(["tab-b"]) });
    fire?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(await auto3.recoveries()).toEqual([]);
    autoB.dispose();
    auto3.dispose();
  });
});

test("geometry-only Falstad notes are not shown when opening a file", () => {
  // A transformer drawn at a non-default size (from joule-thief.txt): the importer resizes it.
  const text = "$ 1 5e-9 6.45 52 1 66\nT 288 192 336 224 6 4e-7 6 0.00089 -0.089 0.999\n";
  const { notices, report } = readCircuitText(text, { name: "pot.txt" });
  expect(report?.warnings.some((w) => w.message.key === "falstad.lengthChanged")).toBe(true);
  expect(notices.map((n) => n.key)).not.toContain("falstad.lengthChanged");
});

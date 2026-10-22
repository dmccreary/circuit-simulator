import type { Command as WorkerCommand } from "@cs/worker";
import { memoryStorage, XapiReporter, type Scheduler, type Statement } from "@cs/xapi";
import { AppController } from "../src/controller";
import { rcChargingCircuit } from "../src/demo-circuit";
import type { WorkerPort } from "../src/sim/sim-client";
import {
  EmbedRuntime,
  HostBridge,
  PROTOCOL,
  attachXapi,
  capabilitiesFor,
  isTrustedOrigin,
  parseEmbedParams,
  parseEnvelope,
  resolveParentOrigin,
  speedFromSetting,
  type BridgeEnv,
} from "../src/embed";

function controller() {
  const sent: WorkerCommand[] = [];
  const port: WorkerPort = { postMessage: (m) => void sent.push(m), onmessage: null };
  return { c: new AppController(rcChargingCircuit(), { worker: port }), sent };
}

function runtime(query: string, embedded = true) {
  const { c, sent } = controller();
  const cfg = parseEmbedParams(query, "", embedded);
  const opened: string[] = [];
  const rt = new EmbedRuntime(c, cfg, { href: "https://site.example/simulator/" + query, openWindow: (u) => void opened.push(u) });
  return { c, rt, cfg, sent, opened };
}

describe("embed parameters (spec §19.1, EMB-01)", () => {
  test("defaults", () => {
    const p = parseEmbedParams("");
    expect(p.mode).toBe("edit");
    expect(p.panels).toBeUndefined();
    expect(p.theme).toBe("auto");
    expect(p.lock).toEqual([]);
    expect(p.xapi).toBe(false);
    expect(p.warnings).toEqual([]);
    expect(p.id).toMatch(/^embed-/);
  });

  test("valid values", () => {
    const p = parseEmbedParams("?example=lrc.txt&mode=run&panels=chart,status&lock=R1,C1&id=ch3-lrc&xapi=1&theme=dark&speed=50&window=5ms&layout=stacked&allow=https://lms.example.org/path");
    expect(p).toMatchObject({ example: "lrc.txt", mode: "run", panels: ["chart", "status"], lock: ["R1", "C1"], id: "ch3-lrc", xapi: true, theme: "dark", speed: 50, layout: "stacked" });
    expect(p.window).toBeCloseTo(0.005);
    expect(p.allow).toEqual(["https://lms.example.org"]);
    expect(p.warnings).toEqual([]);
  });

  test("unknown parameters are ignored; invalid values fall back with a warning", () => {
    const p = parseEmbedParams("?bogus=1&mode=fly&speed=500&panels=chart,toaster&theme=pink&example=../../etc/passwd&lock=all");
    expect(p.mode).toBe("edit");
    expect(p.speed).toBeUndefined();
    expect(p.panels).toEqual(["chart"]);
    expect(p.theme).toBe("auto");
    expect(p.example).toBeUndefined();
    expect(p.lock).toBe("all");
    expect(p.warnings.length).toBe(5);
  });

  test("share link in the fragment; lz-string ctz keeps its plus signs; lesson falls back to run", () => {
    expect(parseEmbedParams("", "#c=abc").c).toBe("abc");
    expect(parseEmbedParams("?ctz=CQ+AgjA").ctz).toBe("CQ+AgjA");
    const l = parseEmbedParams("?lesson=x.yaml");
    expect(l.mode).toBe("run");
    expect(l.warnings.length).toBe(1);
  });

  test("generated id is stable for the same URL", () => {
    expect(parseEmbedParams("?example=a.txt&mode=run").id).toBe(parseEmbedParams("?mode=run&example=a.txt").id);
    expect(parseEmbedParams("?example=a.txt").id).not.toBe(parseEmbedParams("?example=b.txt").id);
  });

  test("speed setting maps 1..100 onto 1 µs/s .. 10×", () => {
    expect(speedFromSetting(1)).toBeCloseTo(1e-6);
    expect(speedFromSetting(100)).toBeCloseTo(10);
  });
});

describe("capabilities (EMB-02, app-shell §6)", () => {
  test("modes become capability sets narrowed by panels", () => {
    expect(capabilitiesFor({ mode: "edit", lock: [] }).edit).toBe("full");
    const run = capabilitiesFor({ mode: "run", panels: ["chart", "status", "palette"], lock: [] });
    expect(run.edit).toBe("values");
    expect(run.tools).toEqual(["select", "probe-v"]);
    expect(run.panels).toEqual(["chart", "status"]); // run never shows the palette
    const view = capabilitiesFor({ mode: "view", lock: [] });
    expect(view.edit).toBe("none");
    expect(view.panels).not.toContain("inspector");
  });

  test("commands the mode does not grant are hidden and cannot run", () => {
    const { c } = runtime("?mode=run");
    expect(c.commands.allowed("sim.runPause")).toBe(true);
    expect(c.commands.allowed("tool.probe")).toBe(true);
    expect(c.commands.allowed("edit.undo")).toBe(true);
    expect(c.commands.allowed("tool.wire")).toBe(false);
    expect(c.commands.allowed("edit.rotateCW")).toBe(false);
    c.store.set({ selection: ["R1"] });
    expect(c.commands.run("edit.delete")).toBe(false);
    expect(c.edits.doc.parts.R1).toBeDefined();

    const v = runtime("?mode=view");
    expect(v.c.commands.allowed("tool.probe")).toBe(false);
    expect(v.c.commands.allowed("edit.undo")).toBe(false);
    expect(v.c.commands.allowed("sim.runPause")).toBe(true);
    expect(v.c.commands.allowed("embed.resetOriginal")).toBe(true);

    const e = runtime("");
    expect(e.c.commands.allowed("tool.wire")).toBe(true);
  });

  test("document changes outside the capability set are refused", () => {
    const { c, rt } = runtime("?mode=run&lock=C1");
    // A value of an unlocked part: allowed.
    c.edits.edit({ key: "x" }, (d) => void (d.parts.R1.props.resistance = 2200));
    expect(c.edits.doc.parts.R1.props.resistance).toBe(2200);
    // Locked part: refused and reverted.
    c.edits.edit({ key: "x" }, (d) => void (d.parts.C1.props.capacitance = 1e-3));
    expect(c.edits.doc.parts.C1.props.capacitance).toBe(100e-6);
    expect(rt.state.get().notice).toBeDefined();
    // Moving a part (rewiring): refused in run mode.
    c.edits.edit({ key: "x" }, (d) => void (d.parts.R1.at = { x: 9, y: 0 }));
    expect(c.edits.doc.parts.R1.at).toEqual({ x: 8, y: 0 });
    // Flipping a switch operates it: allowed.
    c.edits.edit({ key: "x" }, (d) => void (d.parts.S1.props.closed = true));
    expect(c.edits.doc.parts.S1.props.closed).toBe(true);

    const v = runtime("?mode=view");
    v.c.edits.edit({ key: "x" }, (d) => void (d.parts.S1.props.closed = true));
    expect(v.c.edits.doc.parts.S1.props.closed).toBe(false);
  });

  test("reset to original restores the published circuit as one undoable step (EMB-04)", () => {
    const { c, rt } = runtime("?mode=run");
    c.edits.edit({ key: "x" }, (d) => void (d.parts.R1.props.resistance = 47));
    rt.resetToOriginal();
    expect(c.edits.doc.parts.R1.props.resistance).toBe(10e3);
    c.edits.undo();
    expect(c.edits.doc.parts.R1.props.resistance).toBe(47);
  });

  test("open in full simulator encodes the current circuit in edit mode (EMB-03)", async () => {
    const { rt, c } = runtime("?mode=run&example=lrc.txt");
    c.edits.edit({ key: "x" }, (d) => void (d.parts.R1.props.resistance = 47));
    const url = await rt.fullSimulatorUrl();
    expect(url).toMatch(/^https:\/\/site\.example\/simulator\/\?mode=edit#c=/);
  });
});

// ------------------------------------------------------------------ bridge

function bridgeHarness(query: string, opts: { parentOrigin?: string; allow?: string[]; embedded?: boolean } = {}) {
  const h = runtime(query, opts.embedded ?? true);
  const posted: { msg: any; origin: string }[] = [];
  const parent = { postMessage: (msg: unknown, origin: string) => void posted.push({ msg, origin }) };
  let handler: ((e: { source: unknown; origin: string; data: unknown }) => void) | undefined;
  const env: BridgeEnv = {
    parent,
    parentOrigin: opts.parentOrigin ?? "https://site.example",
    ownOrigin: "https://site.example",
    allow: opts.allow ?? [],
    listen: (fn) => {
      handler = fn;
      return () => (handler = undefined);
    },
  };
  let xapiOn = false;
  const bridge = new HostBridge(h.rt, env, { configureXapi: () => (xapiOn = true) });
  const send = async (data: unknown, from: { source?: unknown; origin?: string } = {}) => {
    handler?.({ source: from.source ?? parent, origin: from.origin ?? env.parentOrigin!, data });
    await new Promise((r) => setTimeout(r, 0));
  };
  const msg = (type: string, payload: unknown = {}, requestId?: string) => ({ protocol: PROTOCOL, version: 1, embedId: h.cfg.id, type, payload, requestId });
  return { ...h, bridge, posted, send, msg, parent, xapi: () => xapiOn, hasListener: () => !!handler };
}

describe("host bridge trust rules (EMB-12)", () => {
  test("parent origin from ancestorOrigins, else the referrer", () => {
    expect(resolveParentOrigin({ ancestorOrigins: { length: 1, 0: "https://a.example" } }, "https://b.example/x")).toBe("https://a.example");
    expect(resolveParentOrigin({}, "https://b.example/page?q")).toBe("https://b.example");
    expect(resolveParentOrigin({}, "")).toBeUndefined();
  });

  test("same origin by default; other origins only through allow", () => {
    expect(isTrustedOrigin("https://site.example", "https://site.example", [])).toBe(true);
    expect(isTrustedOrigin("https://evil.example", "https://site.example", [])).toBe(false);
    expect(isTrustedOrigin("https://lms.example", "https://site.example", ["https://lms.example"])).toBe(true);
    expect(isTrustedOrigin("null", "null", [])).toBe(false);
  });

  test("an untrusted parent gets no listener and no messages", () => {
    const h = bridgeHarness("?mode=run", { parentOrigin: "https://evil.example" });
    expect(h.bridge.trusted).toBe(false);
    expect(h.hasListener()).toBe(false);
    h.bridge.ready();
    expect(h.posted).toEqual([]);
  });

  test("an allow-listed cross-origin parent is trusted", () => {
    const h = bridgeHarness("?mode=run", { parentOrigin: "https://lms.example", allow: ["https://lms.example"] });
    expect(h.bridge.trusted).toBe(true);
    h.bridge.ready();
    expect(h.posted[0].origin).toBe("https://lms.example");
  });

  test("messages from another window or origin, or malformed, are ignored", async () => {
    const h = bridgeHarness("?mode=run");
    await h.send(h.msg("run"), { source: {} });
    await h.send(h.msg("run"), { origin: "https://evil.example" });
    await h.send({ ...h.msg("run"), protocol: "other" });
    await h.send({ ...h.msg("run"), version: 2 });
    await h.send(h.msg("formatDisk"));
    await h.send({ ...h.msg("run"), embedId: "someone-else" });
    await h.send("run");
    await h.send({ ...h.msg("run"), payload: [1] });
    expect(h.c.store.get().runState).toBe("paused");
    expect(h.posted).toEqual([]);
  });

  test("outgoing envelope goes to the recorded origin, never *", () => {
    const h = bridgeHarness("?mode=run&id=demo");
    h.bridge.ready();
    const ready = h.posted.find((p) => p.msg.type === "ready")!;
    expect(ready.origin).toBe("https://site.example");
    expect(ready.msg).toMatchObject({ protocol: "circuit-simulator", version: 1, embedId: "demo", payload: { mode: "run", edit: "values" } });
    const height = h.posted.find((p) => p.msg.type === "preferredHeight")!;
    expect(height.msg.payload.height).toBeGreaterThan(200);
  });

  test("parseEnvelope accepts the '*' broadcast id", () => {
    expect(parseEnvelope({ protocol: PROTOCOL, version: 1, embedId: "*", type: "pause", payload: {} }, "x")?.type).toBe("pause");
  });
});

describe("host bridge commands (EMB-10, EMB-11)", () => {
  test("run, pause and runStateChanged", async () => {
    const h = bridgeHarness("?mode=run");
    await h.send(h.msg("run"));
    expect(h.sent.some((m) => m.type === "run")).toBe(true);
    expect(h.posted.find((p) => p.msg.type === "runStateChanged")?.msg.payload).toEqual({ runState: "running" });
    await h.send(h.msg("pause"));
    expect(h.c.store.get().runState).toBe("paused");
  });

  test("setValue and setSwitch by label, with replies and circuitChanged", async () => {
    const h = bridgeHarness("?mode=run&lock=R1");
    await h.send(h.msg("setValue", { part: "R1", prop: "resistance", value: 4700 }, "r1"));
    expect(h.c.edits.doc.parts.R1.props.resistance).toBe(4700); // the host may drive locked parts
    expect(h.posted.find((p) => p.msg.type === "reply")?.msg).toMatchObject({ requestId: "r1", payload: { ok: true } });
    expect(h.posted.some((p) => p.msg.type === "circuitChanged")).toBe(true);
    await h.send(h.msg("setSwitch", { part: "S1", closed: true }));
    expect(h.c.edits.doc.parts.S1.props.closed).toBe(true);
    await h.send(h.msg("setValue", { part: "R1", prop: "resistance", value: "big" }, "r2"));
    expect(h.posted.find((p) => p.msg.requestId === "r2")?.msg.payload).toMatchObject({ ok: false });
    await h.send(h.msg("setValue", { part: "Q9", prop: "x", value: 1 }, "r3"));
    expect(h.posted.find((p) => p.msg.requestId === "r3")?.msg.payload.error).toMatch(/no part/);
  });

  test("a host cannot make a view embed edit its circuit", async () => {
    const h = bridgeHarness("?mode=view");
    await h.send(h.msg("setValue", { part: "R1", prop: "resistance", value: 1 }, "v1"));
    await h.send(h.msg("addProbe", { part: "R1" }, "v2"));
    expect(h.c.edits.doc.parts.R1.props.resistance).toBe(10e3);
    expect(Object.keys(h.c.edits.doc.probes)).toEqual(["P1"]);
    expect(h.posted.filter((p) => p.msg.type === "reply").every((p) => p.msg.payload.ok === false)).toBe(true);
  });

  test("addProbe and getState", async () => {
    const h = bridgeHarness("?mode=run");
    await h.send(h.msg("addProbe", { part: "R1" }, "a"));
    expect(Object.keys(h.c.edits.doc.probes).length).toBe(2);
    await h.send(h.msg("getState", {}, "s"));
    const st = h.posted.find((p) => p.msg.requestId === "s")!.msg.payload.result;
    expect(st.runState).toBe("paused");
    expect(st.circuit.parts.R1.type).toBe("resistor");
    expect(st.probes.length).toBe(2);
  });

  test("configureXapi is handed to the reporter", async () => {
    const h = bridgeHarness("?mode=run&xapi=1");
    await h.send(h.msg("configureXapi", { transport: "relay" }, "x"));
    expect(h.xapi()).toBe(true);
  });
});

// ------------------------------------------------------------------ xAPI hook

describe("xAPI hook", () => {
  const sched = (): Scheduler & { fire(): void } => {
    const timers: Array<() => void> = [];
    return {
      now: () => 0,
      setTimeout: (fn) => timers.push(fn),
      clearTimeout: () => {},
      fire: () => timers.splice(0).forEach((f) => f()),
    };
  };

  function setup(query = "?mode=edit&xapi=1&example=rc.txt") {
    const h = runtime(query);
    const s = sched();
    const reporter = new XapiReporter({
      allowed: true,
      context: { page: "https://site.example/ch1/", embedId: h.cfg.id, circuitId: h.rt.sourceId, mode: h.cfg.mode },
      relay: () => {},
      scheduler: s,
      storage: memoryStorage(),
      anonymous: () => ({ account: { homePage: "https://site.example", name: "anon" } }),
    });
    attachXapi(h.rt, reporter);
    reporter.configure({ transport: "relay" });
    const verbs = () => reporter.pending().slice(2) as Statement[];
    return { ...h, reporter, s, verbs };
  }

  test("a slider drag (one transaction) is one statement with the old and new values", () => {
    const { c, verbs, s, reporter } = setup();
    const tx = c.edits.begin({ key: "slider" });
    for (const v of [11e3, 12e3, 15e3, 20e3]) tx.update((d) => void (d.parts.R1.props.resistance = v));
    expect(verbs()).toEqual([]); // provisional updates are not reported
    tx.commit();
    s.fire();
    expect(verbs().length).toBe(1);
    const st = verbs()[0];
    expect(st.object.id).toMatch(/#circuit-simulator\/.+\/rc\.txt\/part\/R1\/prop\/resistance$/);
    expect(Object.values(st.result!.extensions!)).toEqual(expect.arrayContaining([10e3, 20e3]));
    reporter.dispose();
  });

  test("parts, switches, probes and simulation commands", () => {
    const { c, verbs, s } = setup();
    c.edits.edit({ key: "x" }, (d) => void (d.parts.S1.props.closed = true));
    c.store.set({ selection: ["R1"] });
    c.commands.run("edit.delete");
    c.commands.run("sim.runPause");
    s.fire();
    const actions = verbs().map((st) => Object.entries(st.result?.extensions ?? {}).find(([k]) => k.endsWith("/action"))?.[1]);
    expect(actions).toEqual(expect.arrayContaining(["flip", "deleted", "run"]));
  });

  test("refused changes are not reported", () => {
    const { c, verbs, s } = setup("?mode=view&xapi=1");
    c.edits.edit({ key: "x" }, (d) => void (d.parts.S1.props.closed = true));
    s.fire();
    expect(verbs()).toEqual([]);
  });
});

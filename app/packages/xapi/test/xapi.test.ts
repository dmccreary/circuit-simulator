import {
  Coalescer,
  SEVEN_DAYS_MS,
  StatementBuilder,
  StatementQueue,
  XapiReporter,
  activityId,
  directTransport,
  memoryStorage,
  parseXapiConfig,
  type Scheduler,
  type Statement,
} from "@cs/xapi";

/** A manual clock: timers fire only when `advance` passes them. */
function fakeScheduler(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const s: Scheduler & { advance(ms: number): void } = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => void timers.delete(h as number),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
  return s;
}

const ctx = {
  actor: { objectType: "Agent" as const, account: { homePage: "https://example.org", name: "learner-1" } },
  page: "https://dmccreary.github.io/circuit-simulator/chapters/03/?x=1#top",
  embedId: "ch3-lrc",
  circuitId: "lrc.txt",
  mode: "run",
  now: () => Date.UTC(2026, 0, 1),
  newId: () => "00000000-0000-4000-8000-000000000000",
};

describe("activity ids (XAP-07)", () => {
  test("stable, without query or fragment", () => {
    const a = activityId(ctx.page, "ch3-lrc", "lrc.txt");
    expect(a).toBe("https://dmccreary.github.io/circuit-simulator/chapters/03/#circuit-simulator/ch3-lrc/lrc.txt");
    expect(activityId("https://dmccreary.github.io/circuit-simulator/chapters/03/", "ch3-lrc", "lrc.txt")).toBe(a);
    expect(activityId(ctx.page, "ch3-lrc", "lrc.txt", "part", "R 1")).toBe(`${a}/part/R%201`);
  });
});

describe("StatementBuilder", () => {
  const b = new StatementBuilder(ctx);

  test("launched statement shape", () => {
    const s = b.launched();
    expect(s.verb.id).toBe("http://adlnet.gov/expapi/verbs/launched");
    expect(s.actor).toEqual(ctx.actor);
    expect(s.object.objectType).toBe("Activity");
    expect(s.object.id).toContain("#circuit-simulator/ch3-lrc/lrc.txt");
    expect(s.timestamp).toBe("2026-01-01T00:00:00.000Z");
    const ext = s.context!.extensions!;
    expect(Object.values(ext)).toEqual(expect.arrayContaining(["ch3-lrc", "run"]));
    expect(s.context!.contextActivities).toBeUndefined();
  });

  test("value change: interacted on the property, old and new values, parent activity", () => {
    const s = b.valueChanged({ id: "R1", label: "R1", type: "resistor" }, "resistance", 1000, 2200);
    expect(s.verb.display["en-US"]).toBe("interacted");
    expect(s.object.id.endsWith("/part/R1/prop/resistance")).toBe(true);
    expect(s.result!.response).toBe("2200");
    const vals = Object.values(s.result!.extensions!);
    expect(vals).toEqual(expect.arrayContaining([1000, 2200, "set-value"]));
    expect(s.context!.contextActivities!.parent![0].id).toBe(b.rootActivity().id);
  });

  test("simulation, analysis and terminated verbs", () => {
    expect(b.simulation("run", 0.5).verb.display["en-US"]).toBe("interacted");
    expect(b.analysis("ac", { points: 10 }).verb.display["en-US"]).toBe("experienced");
    const t = b.terminated(12_340);
    expect(t.verb.display["en-US"]).toBe("terminated");
    expect(t.result!.duration).toBe("PT12.3S");
    expect(b.terminated(1, "suspended").verb.display["en-US"]).toBe("suspended");
  });
});

describe("Coalescer (XAP-08)", () => {
  test("a burst of slider updates becomes one event when it ends", () => {
    const sch = fakeScheduler();
    const out: { from: number; to: number }[] = [];
    const co = new Coalescer<{ from: number; to: number }>((e) => out.push(e), { scheduler: sch });
    const merge = (a: { from: number }, b: { to: number }) => ({ from: a.from, to: b.to });
    for (let v = 1; v <= 20; v++) {
      co.push("R1.resistance", { from: v - 1, to: v }, merge);
      sch.advance(50);
    }
    expect(out).toEqual([]);
    sch.advance(1000);
    expect(out).toEqual([{ from: 0, to: 20 }]);
  });

  test("a never-ending action still emits, at most once per second", () => {
    const sch = fakeScheduler();
    const times: number[] = [];
    const co = new Coalescer<number>(() => times.push(sch.now()), { scheduler: sch, maxWaitMs: 3000 });
    for (let i = 0; i < 200; i++) {
      co.push("drag", i);
      sch.advance(50);
    }
    expect(times.length).toBeGreaterThan(1);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1000);
  });

  test("different keys are independent; flush emits everything", () => {
    const out: string[] = [];
    const co = new Coalescer<string>((e) => out.push(e), { scheduler: fakeScheduler() });
    co.push("a", "a1");
    co.push("b", "b1");
    co.push("a", "a2");
    co.flush();
    expect(out.sort()).toEqual(["a2", "b1"]);
  });
});

describe("StatementQueue (XAP-06)", () => {
  const stmt = (id: string) => ({ ...new StatementBuilder(ctx).launched(), id }) as Statement;

  test("batches, retries with back-off, and persists", async () => {
    const sch = fakeScheduler();
    const storage = memoryStorage();
    let fail = true;
    const sent: string[] = [];
    const q = new StatementQueue({
      scheduler: sch,
      storage,
      transport: async (ss) => {
        if (fail) throw new Error("offline");
        sent.push(...ss.map((s) => s.id));
      },
    });
    q.enqueue(stmt("a"));
    q.enqueue(stmt("b"));
    expect(storage.items.length).toBe(2);
    await q.flush();
    expect(q.length).toBe(2);
    expect(storage.items[0].attempts).toBe(1);
    fail = false;
    sch.advance(2000);
    await Promise.resolve();
    await q.flush();
    expect(sent).toEqual(["a", "b"]);
    expect(q.length).toBe(0);
    expect(storage.items).toEqual([]);
  });

  test("drops statements older than seven days", () => {
    const sch = fakeScheduler(10 * SEVEN_DAYS_MS);
    const storage = memoryStorage();
    storage.items = [
      { statement: stmt("old"), queuedAt: sch.now() - SEVEN_DAYS_MS - 1, attempts: 9 },
      { statement: stmt("new"), queuedAt: sch.now() - 1000, attempts: 1 },
    ];
    const q = new StatementQueue({ scheduler: sch, storage, transport: async () => {} });
    expect(q.pending().map((s) => s.id)).toEqual(["new"]);
    q.dispose();
  });
});

describe("configuration (XAP-01, XAP-02)", () => {
  test("payload validation", () => {
    expect(parseXapiConfig({ transport: "relay" })).toEqual({ transport: "relay" });
    expect(parseXapiConfig({})).toEqual({ transport: "relay" });
    expect(parseXapiConfig({ transport: "direct", endpoint: "https://lrs.example.org/xapi", auth: "Basic x" })?.transport).toBe("direct");
    expect(parseXapiConfig({ transport: "direct", endpoint: "http://lrs.example.org/xapi" })).toBeUndefined();
    expect(parseXapiConfig({ transport: "direct", endpoint: "https://u:p@lrs.example.org/" })).toBeUndefined();
    expect(parseXapiConfig({ transport: "relay", actor: { name: "no ifi" } })).toBeUndefined();
    expect(parseXapiConfig("relay")).toBeUndefined();
  });

  test("reporter is off without xapi=1, and off until configured", () => {
    const relayed: Statement[] = [];
    const base = { context: { page: ctx.page, embedId: "e", circuitId: "c", mode: "run" }, relay: (s: Statement) => void relayed.push(s), scheduler: fakeScheduler(), storage: memoryStorage() };
    const denied = new XapiReporter({ ...base, allowed: false });
    expect(denied.configure({ transport: "relay" })).toBe(false);
    denied.record((b) => b.simulation("run", 0));
    expect(denied.enabled).toBe(false);

    const r = new XapiReporter({ ...base, allowed: true, anonymous: () => ({ account: { homePage: "https://x", name: "anon" } }) });
    r.record((b) => b.simulation("run", 0));
    expect(r.pending()).toEqual([]);
    expect(r.configure({ transport: "relay" })).toBe(true);
    expect(r.pending().map((s) => s.verb.display["en-US"])).toEqual(["launched", "initialized"]);
    expect(r.pending()[0].actor.account!.name).toBe("anon"); // XAP-04
  });

  test("relay delivers through the bridge callback", async () => {
    const relayed: Statement[] = [];
    const r = new XapiReporter({
      allowed: true,
      context: { page: ctx.page, embedId: "e", circuitId: "c", mode: "run" },
      relay: (s) => void relayed.push(s),
      scheduler: fakeScheduler(),
      storage: memoryStorage(),
      anonymous: () => ({ account: { homePage: "https://x", name: "anon" } }),
    });
    r.configure({ transport: "relay", actor: { mbox: "mailto:a@example.org" } });
    r.record((b) => b.simulation("pause", 1));
    await r.flush();
    expect(relayed.map((s) => s.verb.display["en-US"])).toEqual(["launched", "initialized", "interacted"]);
    expect(relayed[0].actor.mbox).toBe("mailto:a@example.org");
  });

  test("direct transport posts xAPI headers to /statements", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const t = directTransport({ endpoint: "https://lrs.example.org/xapi/", auth: "Basic abc" }, async (url, init) => {
      calls.push({ url, headers: init.headers });
      return { ok: true, status: 200 };
    });
    await t([new StatementBuilder(ctx).launched()]);
    expect(calls[0].url).toBe("https://lrs.example.org/xapi/statements");
    expect(calls[0].headers["X-Experience-API-Version"]).toBe("1.0.3");
    expect(calls[0].headers.Authorization).toBe("Basic abc");
    const failing = directTransport({ endpoint: "https://lrs.example.org" }, async () => ({ ok: false, status: 500 }));
    await expect(failing([])).rejects.toThrow();
  });
});

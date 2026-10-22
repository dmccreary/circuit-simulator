import {
  createAutosaver,
  createMemoryBackend,
  createPersistence,
  pickRecoveries,
  type RecoveryRecord,
  type Timers,
} from "@cs/persistence";

/** Manual clock for the debounce tests. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      pending.set(++seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (h) => void pending.delete(h as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at <= now) {
        pending.delete(id);
        t.fn();
      }
    }
  };
  return { timers, advance, count: () => pending.size };
}

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

describe("memory backend", () => {
  test("stores, clones, lists in key order and deletes", async () => {
    const p = createPersistence(createMemoryBackend());
    const rec = { id: "b", name: "B", text: "{}", changedAt: 2 };
    await p.circuits.put("b", rec);
    await p.circuits.put("a", { ...rec, id: "a", name: "A" });
    rec.name = "mutated";
    expect((await p.circuits.get("b"))?.name).toBe("B");
    expect((await p.circuits.entries()).map(([k]) => k)).toEqual(["a", "b"]);
    await p.circuits.delete("a");
    expect(await p.circuits.values()).toHaveLength(1);
    expect(await p.recovery.values()).toEqual([]);
    await p.xapiQueue.put(2, { seq: 2, statement: {}, queuedAt: 0 });
    await p.xapiQueue.put(1, { seq: 1, statement: {}, queuedAt: 0 });
    expect((await p.xapiQueue.values()).map((v) => v.seq)).toEqual([1, 2]);
  });
});

describe("autosave debounce (PRF-06)", () => {
  test("writes once, one second after the last committed change", async () => {
    const t = fakeTimers();
    const write = vi.fn(async () => {});
    const a = createAutosaver({ write, timers: t.timers });
    a.schedule();
    t.advance(600);
    a.schedule();
    t.advance(600);
    a.schedule();
    t.advance(999);
    expect(write).not.toHaveBeenCalled();
    t.advance(1);
    await flushPromises();
    expect(write).toHaveBeenCalledTimes(1);
    expect(a.pending).toBe(false);
  });

  test("flush writes at once when pending, and not otherwise", async () => {
    const t = fakeTimers();
    const write = vi.fn(async () => {});
    const a = createAutosaver({ write, timers: t.timers });
    await a.flush();
    expect(write).not.toHaveBeenCalled();
    a.schedule();
    await a.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(t.count()).toBe(0);
    t.advance(5000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  test("cancel drops the pending write; errors go to onError", async () => {
    const t = fakeTimers();
    const onError = vi.fn();
    const a = createAutosaver({ write: async () => Promise.reject(new Error("quota")), timers: t.timers, onError });
    a.schedule();
    a.cancel();
    t.advance(2000);
    await flushPromises();
    expect(onError).not.toHaveBeenCalled();
    a.schedule();
    t.advance(1000);
    await flushPromises();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("recovery decision (FIL-09)", () => {
  const rec = (sessionId: string, changedAt: number, text = "{}"): RecoveryRecord => ({ sessionId, changedAt, text, title: sessionId });

  test("offers entries from closed tabs only, newest first", () => {
    const entries = [rec("old", 1), rec("mine", 5), rec("live", 9), rec("newer", 3), rec("empty", 4, "")];
    const picked = pickRecoveries(entries, "mine", new Set(["live"]));
    expect(picked.map((e) => e.sessionId)).toEqual(["newer", "old"]);
  });

  test("nothing to offer when every entry is live or ours", () => {
    expect(pickRecoveries([rec("mine", 1), rec("other", 2)], "mine", new Set(["other"]))).toEqual([]);
  });
});

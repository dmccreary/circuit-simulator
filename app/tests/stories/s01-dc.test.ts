// @vitest-environment jsdom
// Spec §25 user stories about DC circuits, walked through the real
// AppController with the in-process engine (tests/helpers/app.ts):
// 25.1 current is not used up, 25.2 a battery is not a current source,
// 25.5 loading a voltage divider, 25.6 Kirchhoff's laws live,
// 25.11 an LED and its resistor.

import { runAnalysisSync, type DcResult } from "@cs/engine";
import { getModelFactory } from "@cs/elements/models";
import { Story } from "../helpers/app";
import { loopSteps, junctionCurrents } from "../../packages/app/src/law-tools/compute";

/** Phase advance of each named stub wire over `seconds` of animation. */
function dotAdvance(s: Story, wires: string[], seconds: number): number[] {
  const a = s.c.schematic!.animator;
  const keys = wires.map((w) => `w:${w}:0`);
  const before = keys.map((k) => a.phaseOf(k));
  for (let i = 0; i < 10; i++) a.tick(seconds / 10, 100 + i * (seconds / 10));
  return keys.map((k, i) => a.phaseOf(k) - before[i]);
}

/** A part's live brightness as the schematic's live layer would draw it (ANI-17). */
function brightness(s: Story, label: string): number | undefined {
  const plan = (s.c.schematic as unknown as { livePlan: { liveParts: { part: { id: string }; live: { get(k: string): number | undefined } }[] } }).livePlan;
  return plan.liveParts.find((lp) => lp.part.id === s.ids[label])?.live.get("brightness");
}

describe("story 25.1: current is not used up", () => {
  const s = new Story();
  s.build([
    { label: "B1", type: "battery", props: { voltage: 6 }, nodes: [1, 0] },
    { label: "L1", type: "lamp", props: { ratedVoltage: 6, ratedPower: 3 }, nodes: [1, 2] },
    { label: "L2", type: "lamp", props: { ratedVoltage: 6, ratedPower: 3 }, nodes: [2, 0] },
  ]);
  // Step 3: press I and click the three wires: before L1, between the bulbs, after L2.
  const where = [s.stubMid("L1", 0), s.stubMid("L1", 1), s.stubMid("L2", 1)];
  const probes = where.map((p) => s.probe("probe-i", p));
  s.run(300);

  test.todo("LES-03/LES-04: a lesson step asks Maya to rank three points by current, then reveals the animation (no ranking step type yet)");

  test("three current traces in one Current lane, three colors, all at 0.25 A (PRB-01, CHT-02, CHT-05)", () => {
    const ps = probes.map((id) => s.doc.probes[id]);
    expect(ps.every((p) => p.quantity === "current")).toBe(true);
    expect(new Set(ps.map((p) => p.lane)).size).toBe(1);
    expect(new Set(ps.map((p) => p.style.color)).size).toBe(3);
    for (const id of probes) expect(Math.abs(s.value(id))).toBeCloseTo(0.25, 6);
  });

  test("dots move at the same speed all the way around the loop (ANI-03, ANI-04)", () => {
    const adv = dotAdvance(s, [s.stubs["L1.0"], s.stubs["L1.1"], s.stubs["L2.1"]], 0.5).map(Math.abs);
    expect(adv[0]).toBeGreaterThan(0);
    expect(adv[1]).toBeCloseTo(adv[0], 9);
    expect(adv[2]).toBeCloseTo(adv[0], 9);
  });

  test("swapping L2 for twice the resistance drops all three traces together and slows every dot equally", () => {
    const before = dotAdvance(s, [s.stubs["L1.0"]], 0.5).map(Math.abs)[0];
    s.setProps(s.ids.L2, { ratedPower: 1.5 }); // 6 V, 1.5 W: 24 Ω
    s.run(300);
    for (const id of probes) expect(Math.abs(s.value(id))).toBeCloseTo(6 / 36, 6);
    const adv = dotAdvance(s, [s.stubs["L1.0"], s.stubs["L1.1"], s.stubs["L2.1"]], 0.5).map(Math.abs);
    expect(adv[1]).toBeCloseTo(adv[0], 9);
    expect(adv[2]).toBeCloseTo(adv[0], 9);
    expect(adv[0] / before).toBeCloseTo(24 / 36, 3);
  });

  test("the higher-resistance bulb glows brighter (ANI-17)", () => {
    const b1 = brightness(s, "L1");
    const b2 = brightness(s, "L2");
    expect(b1).toBeGreaterThan(0);
    expect(b2).toBeGreaterThan(b1!);
  });
});

describe("story 25.2: a battery is not a current source", () => {
  const s = new Story();
  s.build([
    { label: "B1", type: "battery", props: { voltage: 6 }, nodes: [1, 0] },
    { label: "L1", type: "lamp", props: { ratedVoltage: 6, ratedPower: 3 }, nodes: [1, 0] },
  ]);
  const iBat = s.probe("probe-i", s.stubMid("B1", 0));
  s.run(300);
  const single = Math.abs(s.value(iBat));

  test("K keeps a ghost copy of the battery current trace (CHT-17)", () => {
    expect(single).toBeCloseTo(0.5, 6);
    s.c.chartSession.keepTraces();
    const ghosts = s.c.chartSession.ui.get().ghosts;
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].probeId).toBe(iBat);
  });

  test("a second bulb in parallel: the first bulb is unchanged, the battery current doubles (EDT-05)", () => {
    const vL1 = s.probe("probe-v", s.stubMid("L1", 0));
    s.run(100);
    const vBefore = s.value(vL1);
    s.add({ label: "L2", type: "lamp", props: { ratedVoltage: 6, ratedPower: 3 }, nodes: [1, 0] });
    s.run(300);
    expect(s.value(vL1)).toBeCloseTo(vBefore, 9);
    expect(Math.abs(s.value(iBat)) / single).toBeCloseTo(2, 6);
  });

  test("feed-wire dots move twice as fast as each branch's (ANI-05)", () => {
    const [feed, branch1, branch2] = dotAdvance(s, [s.stubs["B1.0"], s.stubs["L1.0"], s.stubs["L2.0"]], 0.4).map(Math.abs);
    expect(feed / branch1).toBeCloseTo(2, 6);
    expect(branch2).toBeCloseTo(branch1, 9);
  });

  // DEFECT (RLM-01, RLM-03): no element model reads settings.realisticParts,
  // so turning on Realistic parts gives the battery no internal resistance
  // and the terminal voltage stays at exactly 6 V with two bulbs.
  test.fails("Realistic parts: the battery terminal voltage sags below 6 V with two bulbs (RLM-01, RLM-03)", () => {
    const vB = s.probe("probe-v", s.stubMid("B1", 0));
    s.c.edits.edit({ key: "settings.realistic" }, (d) => void (d.settings.realisticParts = true));
    s.run(300);
    expect(s.value(vB)).toBeLessThan(5.99);
    expect(s.value(vB)).toBeGreaterThan(5);
  });

  test("the loop around the battery and one bulb sums to 0 V (PRB-16)", () => {
    const cc = s.c.compiled!;
    const n1 = s.node("B1", 0);
    // Up through the battery, back down through a bulb: the two parts between the same two nodes.
    const r = loopSteps({ compiled: cc, display: s.display }, [0, n1, 0]);
    expect(r.closed).toBe(true);
    expect(r.steps[0].element).toBe(s.ids.B1);
    expect([s.ids.L1, s.ids.L2]).toContain(r.steps[1].element);
    expect(r.steps[0].rise).toBeGreaterThan(5);
    expect(Math.abs(r.sum)).toBeLessThan(0.005);
  });
});

describe("story 25.5: loading a voltage divider", () => {
  const s = new Story();
  s.build([
    { label: "V1", type: "battery", props: { voltage: 12 }, nodes: [1, 0] },
    { label: "R1", type: "resistor", props: { resistance: 10e3 }, nodes: [1, 2] },
    { label: "R2", type: "resistor", props: { resistance: 10e3 }, nodes: [2, 0] },
  ]);
  const dc = () => runAnalysisSync({ kind: "dc", netlist: s.c.compiled!.netlist }, getModelFactory) as DcResult;
  const mid = () => dc().nodes.find((n) => n.index === s.node("R1", 1))!.voltage;

  test("the DC tab shows 6.00 V at the middle node (ANL-03)", () => {
    expect(mid()).toBeCloseTo(6, 4);
  });

  test("a 10 kΩ load drops the middle node to 4.00 V (ANL-04)", () => {
    const load = s.add({ label: "RL", type: "resistor", props: { resistance: 10e3 }, nodes: [2, 0] });
    s.advance(50);
    expect(mid()).toBeCloseTo(4, 4);
    // Removing it (Delete, then the dangling stubs) is one undoable change: Undo restores it.
    s.c.store.set({ selection: [load] });
    s.c.commands.run("edit.delete");
    s.advance(50);
    expect(mid()).toBeCloseTo(6, 4);
  });

  test.todo("ANL-04: the DC table highlights the values that changed since the last run");
  test.todo("PRB-19: Find Thévenin and Norton equivalents gives 6.00 V in series with 5.00 kΩ, and Swap in the equivalent reads 4.00 V loaded (tool not built; physics checked in §26 test 3)");
  test.todo("ANI-26: values on the schematic update with the load");
});

describe("story 25.6: Kirchhoff's laws, live", () => {
  const s = new Story();
  s.build([
    { label: "V1", type: "battery", props: { voltage: 9 }, nodes: [1, 0] },
    { label: "R1", type: "resistor", props: { resistance: 1000 }, nodes: [1, 2] },
    { label: "R2", type: "resistor", props: { resistance: 2000 }, nodes: [2, 0] },
    { label: "R3", type: "resistor", props: { resistance: 1500 }, nodes: [2, 3] },
    { label: "V2", type: "battery", props: { voltage: 3 }, nodes: [3, 0] },
  ]);
  s.run(100);
  const src = () => ({ compiled: s.c.compiled!, display: s.display });
  const [n1, n2, n3] = [1, 2, 3].map((k) => (k === 1 ? s.node("V1", 0) : k === 2 ? s.node("R2", 0) : s.node("V2", 0)));

  test("left, right and outer loop sums read 0.00 V; each step is labelled with its part (PRB-16)", () => {
    for (const loop of [[0, n1, n2, 0], [0, n2, n3, 0], [0, n1, n2, n3, 0]]) {
      const r = loopSteps(src(), loop);
      expect(r.closed).toBe(true);
      expect(Math.abs(r.sum)).toBeLessThan(0.005);
      expect(r.steps.every((st) => st.element !== undefined)).toBe(true);
    }
  });

  test("a slider on V2 dragged 0 → 12 V: loops stay 0.00 V, the junction stays 0.00 A, and R2's current reverses (PRB-18, CTL-05, ANI-07)", () => {
    s.c.store.set({ selection: [s.ids.V2] });
    expect(s.c.commands.run("edit.addSlider")).toBe(true);
    const slider = Object.values(s.doc.sliders).find((x) => x.part === s.ids.V2);
    expect(slider?.prop).toBe("voltage");
    const signs = new Set<number>();
    for (const v of [0, 2, 4, 6, 8, 10, 12]) {
      s.setProps(s.ids.V2, { voltage: v });
      s.run(50);
      expect(Math.abs(loopSteps(src(), [0, n1, n2, 0]).sum)).toBeLessThan(0.005);
      expect(Math.abs(loopSteps(src(), [0, n2, n3, 0]).sum)).toBeLessThan(0.005);
      const j = junctionCurrents(src(), n2);
      expect(Math.abs(j.sum)).toBeLessThan(0.0005);
      const r3 = j.branches.find((b) => b.element === s.ids.R3)!;
      if (Math.abs(r3.leaving) > 1e-6) signs.add(Math.sign(r3.leaving));
    }
    expect(signs.size).toBe(2);
  });
});

describe("story 25.11: an LED and its resistor", () => {
  test.todo("RLM-05/RLM-06/RLM-07: with Realistic ratings on, a red LED across 9 V fails with smoke and a message suggesting about 360 Ω");
  test.todo("PRB-21: Explain on the resistor shows I = (9.00 V − 1.82 V) ÷ R");
  test.todo("EDT-28: Nearest standard value: 360 Ω is E24; E12 neighbours 330 Ω (21.8 mA) and 390 Ω (18.4 mA)");

  test("typing 360 Ω for the resistor gives an LED current of about 19.9 mA", () => {
    const s = new Story();
    s.build([
      { label: "B1", type: "battery", props: { voltage: 9 }, nodes: [1, 0] },
      { label: "R1", type: "resistor", props: { resistance: 1000 }, nodes: [1, 2] },
      { label: "D1", type: "led", props: { color: "red" }, nodes: [2, 0] },
    ]);
    const i = s.probe("probe-i", s.stubMid("D1", 1));
    s.setProps(s.ids.R1, { resistance: 360 });
    s.run(200);
    expect(Math.abs(s.value(i))).toBeGreaterThan(0.0189);
    expect(Math.abs(s.value(i))).toBeLessThan(0.0209);
    // E12 neighbours bracket it the way the story says.
    for (const [r, ma] of [[330, 21.8], [390, 18.4]] as const) {
      s.setProps(s.ids.R1, { resistance: r });
      s.run(200);
      expect(Math.abs(s.value(i)) * 1000).toBeCloseTo(ma, 0);
    }
  });
});

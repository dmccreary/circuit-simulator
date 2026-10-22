// A probe added while paused is back-filled from the engine's history ring (§7.4).
import { EngineHost } from "@cs/worker";
import type { SampleBlock } from "@cs/engine";
import { lookup, netlist } from "../../engine/test/fixtures/models";

test("host back-fills channels added while paused", () => {
  const blocks: SampleBlock[] = [];
  let now = 0;
  const tasks: (() => void)[] = [];
  const host = new EngineHost({
    now: () => now,
    schedule: (fn) => tasks.push(fn),
    post: () => {},
    getModelFactory: lookup,
    postBackfill: (b) => blocks.push(b),
  });
  // Run the scheduled ticks once (the host reschedules itself while frames are unacknowledged).
  const flush = () => {
    for (const fn of tasks.splice(0)) fn();
  };
  const rc = netlist(2, [
    ["V1", "vsource", [1, 0], { voltage: 5 }],
    ["R1", "resistor", [1, 2], { resistance: 1000 }],
    ["C1", "capacitor", [2, 0], { capacitance: 1e-6 }],
  ]);
  const vin = { id: "vin", kind: "voltage" as const, a: 1, b: 0 };
  const vc = { id: "vc", kind: "voltage" as const, a: 2, b: 0 };
  host.handle({ type: "load", netlist: rc, channels: [vin] });
  flush();
  for (let i = 0; i < 30; i++) {
    host.handle({ type: "step" });
    flush();
  }
  host.handle({ type: "setChannels", channels: [vin, vc] });
  flush();
  expect(blocks.length).toBe(1);
  const b = blocks[0];
  expect(b.channelIds).toEqual(["vc"]);
  expect(b.times.length).toBe(31); // t = 0 and 30 steps
  expect(b.times[b.times.length - 1]).toBe(host.time);
  for (let i = 1; i < b.times.length; i++) expect(b.samples[i]).toBeGreaterThan(b.samples[i - 1]); // charging
  // Re-sending the same set adds nothing new.
  host.handle({ type: "setChannels", channels: [vin, vc] });
  flush();
  expect(blocks.length).toBe(1);
});

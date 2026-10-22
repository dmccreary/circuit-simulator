import { compile } from "@cs/model";
import { createPartResolver } from "@cs/elements";
import { rcChargingCircuit } from "../src/demo-circuit";

test("built-in RC circuit compiles cleanly with a voltage channel across C1", () => {
  const c = compile(rcChargingCircuit(), createPartResolver());
  expect(c.diagnostics.filter((d) => d.severity !== "info").map((d) => d.id)).toEqual([]);
  const ch = c.channels.P1;
  expect(ch?.kind).toBe("voltage");
  const cap = c.netlist.elements.find((e) => e.id === "C1")!;
  if (ch?.kind === "voltage") expect([ch.a, ch.b].sort()).toEqual([...cap.nodes].sort());
  // Battery, switch, resistor and capacitor in one loop: 3 distinct nodes incl. ground.
  expect(c.netlist.nodeCount).toBe(3);
  expect(c.segments.length).toBeGreaterThan(0);
});

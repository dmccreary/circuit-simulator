import { readFileSync } from "node:fs";
import { createEngine } from "@cs/engine";
import { createPartResolver } from "@cs/elements";
import { getModelFactory } from "@cs/elements/models";
import { importFalstad } from "@cs/formats";
import { compile } from "@cs/model";
const FILES = ["capseries", "cappar", "leadingedge", "synccounter", "conv-cuk", "dram", "delta-pwm", "tesla", "qam-256", "cc2imp"];
test("dbg", async () => {
  for (const f of FILES) {
    try {
      const { doc } = importFalstad(readFileSync(`public/circuits/${f}.txt`, "utf8"));
      const cc = compile(doc, createPartResolver());
      const e = createEngine(cc.netlist, getModelFactory);
      let i = 0;
      while (e.status !== "stopped" && e.time < 1e-3 && i++ < 20000) e.step();
      const d = e.diagnostics.find((x) => x.severity === "error");
      const els = d ? d.elements.map((id) => { const el = cc.netlist.elements.find((x) => x.id === id); return `${doc.parts[id]?.label ?? id}:${el?.type}`; }) : [];
      console.log(f, e.status, e.time.toExponential(2), d ? JSON.stringify(d.message) : "", els.join(" "));
    } catch (err) {
      console.log(f, "THROW", String(err).slice(0, 200));
    }
  }
});

// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Command } from "@cs/worker";
import { AppController } from "../src/controller";
import { App } from "../src/ui/App";
import { rcChargingCircuit } from "../src/demo-circuit";
import type { WorkerPort } from "../src/sim/sim-client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  globalThis.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});

test("shell renders the RC demo, loads it paused, and routes commands to the worker", async () => {
  const sent: Command[] = [];
  const port: WorkerPort = { postMessage: (m) => void sent.push(m), onmessage: null };
  const c = new AppController(rcChargingCircuit(), { worker: port });
  expect(sent[0].type).toBe("load");
  const load = sent[0] as Extract<Command, { type: "load" }>;
  const ids = load.netlist.elements.map((e) => e.id);
  for (const id of ["V1", "S1", "R1", "C1"]) expect(ids).toContain(id);
  expect(load.channels.length).toBe(1);
  expect(sent.some((m) => m.type === "run")).toBe(false); // PAUSED at t = 0

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(App, { controller: c })));
  expect(host.querySelectorAll("canvas").length).toBeGreaterThanOrEqual(6);
  expect(host.textContent).toContain("Run");
  expect(host.textContent).toContain("V(C1)");

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
  });
  expect(sent.at(-1)).toEqual({ type: "run" });
  expect(c.store.get().runState).toBe("running");

  // Select R1 and change its value through the inspector's edit path.
  await act(async () => c.store.set({ selection: ["R1"] }));
  expect(host.querySelector(".inspector")?.textContent).toContain("R1");
  await act(async () =>
    c.edits.edit({ key: "t" }, (d) => {
      d.parts.R1.props.resistance = 2000;
    }),
  );
  expect(sent.at(-1)).toEqual({ type: "setParams", changes: [{ element: "R1", param: "resistance", value: 2000 }] });

  await act(async () => void c.commands.run("edit.undo"));
  expect(c.edits.doc.parts.R1.props.resistance).toBe(10e3);

  await act(async () => root.unmount());
  c.dispose();
});

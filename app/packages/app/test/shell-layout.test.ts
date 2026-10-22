// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppController } from "../src/controller";
import { App } from "../src/ui/App";
import { rcChargingCircuit } from "../src/demo-circuit";
import { shellOf } from "../src/settings/install";
import type { WorkerPort } from "../src/sim/sim-client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let size = { width: 1600, height: 900 };
const observers: Array<() => void> = [];

beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(private cb: () => void) {
      observers.push(() => this.cb());
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  (globalThis as { CSS?: unknown }).CSS ??= { escape: (v: string) => v.replace(/[^\w-]/g, "\\$&") };
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  globalThis.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const w = this.classList.contains("center") ? size.width - 420 : size.width;
    return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: size.height, width: w, height: size.height, toJSON() {} } as DOMRect;
  };
});

beforeEach(() => { try { window.localStorage?.clear(); } catch { /* opaque origin */ } });

async function mount() {
  const port: WorkerPort = { postMessage: () => {}, onmessage: null };
  const c = new AppController(rcChargingCircuit(), { worker: port });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => root.render(createElement(App, { controller: c })));
  const shell = host.querySelector<HTMLElement>(".shell")!;
  const resize = async (width: number, height: number) => {
    size = { width, height };
    await act(async () => observers.forEach((o) => o()));
  };
  return { c, host, shell, root, resize };
}

test("width classes switch arrangement without remounting the canvas (RSP-01, RSP-02)", async () => {
  size = { width: 1600, height: 900 };
  const { c, shell, root, resize } = await mount();
  expect(shell.dataset.width).toBe("xwide");
  expect(shell.dataset.arrangement).toBe("side");
  const canvas = shell.querySelector(".schematic canvas");
  c.store.set({ selection: ["R1"] });

  await resize(800, 600);
  expect(shell.dataset.width).toBe("medium");
  expect(shell.dataset.arrangement).toBe("stacked");

  await resize(400, 480);
  expect(shell.dataset.width).toBe("narrow");
  expect(shell.dataset.height).toBe("short");
  expect(shell.querySelector(".narrow-bar")).not.toBeNull();
  // Same canvas element, same selection: nothing was lost.
  expect(shell.querySelector(".schematic canvas")).toBe(canvas);
  expect(c.store.get().selection).toEqual(["R1"]);

  // Drawer toggle and the Circuit / Chart / Both switch.
  const parts = [...shell.querySelectorAll<HTMLButtonElement>(".narrow-bar button")].find((b) => b.textContent === "Parts")!;
  await act(async () => parts.click());
  expect(shell.dataset.drawer).toBe("palette");
  const chart = [...shell.querySelectorAll<HTMLButtonElement>(".narrow-bar button")].find((b) => b.textContent === "Chart")!;
  await act(async () => chart.click());
  expect(shell.dataset.view).toBe("chart");
  expect(shellOf(c).settings.get().layout.view).toBe("chart");
  await act(async () => root.unmount());
});

test("splitters are focusable separators moved with the keyboard and remembered (LAY-09, LAY-11)", async () => {
  size = { width: 1200, height: 800 };
  const { c, shell, root } = await mount();
  const sep = shell.querySelector<HTMLElement>(".splitter-chart")!;
  expect(sep.getAttribute("role")).toBe("separator");
  expect(sep.getAttribute("aria-valuenow")).toBe("60");
  await act(async () => {
    sep.focus();
    sep.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  });
  expect(sep.getAttribute("aria-valuenow")).toBe("58");
  expect(shell.style.getPropertyValue("--chart-frac")).toBe("0.42");
  await act(async () => sep.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  expect(sep.getAttribute("aria-valuenow")).toBe("60");
  // Theme tokens reach CSS as variables, high contrast included.
  await act(async () => shellOf(c).settings.update({ theme: "high-contrast" }));
  expect(shell.dataset.theme).toBe("high-contrast");
  expect(shell.style.getPropertyValue("--bg")).toBe("#000000");
  await act(async () => root.unmount());
});

test("accessible tree, live region, shortcut sheet and settings dialog", async () => {
  const { c, host, root } = await mount();
  const tree = host.querySelector(".circuit-tree")!;
  const rows = [...tree.querySelectorAll('[role="row"]')].map((r) => r.textContent);
  expect(rows).toHaveLength(5);
  expect(rows[1]).toContain("R1");
  expect(rows[1]).toContain("connected to");

  await act(async () => void c.commands.run("sim.runPause"));
  expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe("Simulation running");

  await act(async () => void c.commands.run("help.shortcuts"));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Keyboard shortcuts");
  expect(dialog.textContent).toContain("Copy");
  await act(async () => void shellOf(c).ui.set({ dialog: "settings" }));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("High contrast");
  await act(async () => void shellOf(c).ui.set({ dialog: null }));

  // In-place editor (EDT-25): change label and value in one undo step.
  await act(async () => void shellOf(c).ui.set({ editing: "R1" }));
  const inputs = host.querySelectorAll<HTMLInputElement>(".inplace-editor input");
  expect(inputs).toHaveLength(2);
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(inputs[1], "4k7");
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => host.querySelector<HTMLFormElement>(".inplace-editor")!.requestSubmit());
  expect(c.edits.doc.parts.R1.props.resistance).toBe(4700);
  expect(shellOf(c).ui.get().editing).toBeNull();
  await act(async () => root.unmount());
});

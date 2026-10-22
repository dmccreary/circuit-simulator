// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { lazyPanel } from "../src/ui/lazy-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("lazyPanel loads on first render, then renders synchronously", async () => {
  let loads = 0;
  let release!: () => void;
  const Hello = ({ name }: { name: string }) => createElement("p", null, `Hello ${name}`);
  const Panel = lazyPanel<{ name: string }>(() => {
    loads++;
    return new Promise((r) => (release = () => r(Hello)));
  }, "loading");
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(createElement(Panel, { name: "Ada" })));
  expect(host.textContent).toBe("loading");
  expect(Panel.loaded).toBe(false);
  await act(async () => release());
  expect(host.textContent).toBe("Hello Ada");
  // Unmount and mount again: no second load, no fallback flash.
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(Panel, { name: "Grace" })));
  expect(host.textContent).toBe("Hello Grace");
  expect(loads).toBe(1);
  await Panel.preload();
  expect(loads).toBe(1);
  await act(async () => root.unmount());
});

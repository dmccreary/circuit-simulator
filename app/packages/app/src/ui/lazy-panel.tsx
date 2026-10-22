// Panels that are not needed at startup load as separate chunks the first
// time they are shown (design/index.md §2 goal 4: a `view` or `run` embed
// must not download code it never uses).
//
// Usage, in place of a static import:
//
//   const ExamplesDialog = lazyPanel(() => import("./ExamplesDialog").then((m) => m.ExamplesDialog));
//   ...
//   {open && <ExamplesDialog session={s} close={close} />}
//
// Until the chunk arrives the panel renders `fallback` (default: nothing);
// once loaded it renders synchronously, so reopening a panel never flickers.
// Call `Panel.preload()` on intent (menu hover, a mode that will need it) to
// start the download early. Unlike React.lazy this needs no Suspense boundary.

import { createElement, useEffect, useState, type ComponentType, type ReactNode } from "react";

export interface LazyPanel<P> {
  (props: P): ReactNode;
  /** Start loading now; resolves with the component. */
  preload(): Promise<ComponentType<P>>;
  /** True once the chunk has loaded. */
  readonly loaded: boolean;
}

export function lazyPanel<P extends object>(load: () => Promise<ComponentType<P>>, fallback: ReactNode = null): LazyPanel<P> {
  let component: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;

  const preload = (): Promise<ComponentType<P>> =>
    (pending ??= load().then(
      (c) => (component = c),
      (err: unknown) => {
        pending = undefined; // a later render retries (offline, flaky network)
        throw err;
      },
    ));

  function Panel(props: P): ReactNode {
    const [, setVersion] = useState(0);
    useEffect(() => {
      if (component) return;
      let live = true;
      preload().then(
        () => live && setVersion((v) => v + 1),
        (err: unknown) => console.error("Could not load panel", err),
      );
      return () => {
        live = false;
      };
    }, []);
    return component ? createElement(component, props) : fallback;
  }

  return Object.defineProperties(Panel, {
    preload: { value: preload },
    loaded: { get: () => component !== undefined },
  }) as unknown as LazyPanel<P>;
}

/**
 * Preload panels once the page is idle, so they open instantly later without
 * delaying start-up. Returns a cancel function (for effects).
 */
export function preloadWhenIdle(...panels: { preload(): Promise<unknown> }[]): () => void {
  const run = () => panels.forEach((p) => void p.preload().catch(() => undefined));
  const g = globalThis as { requestIdleCallback?: (fn: () => void) => number; cancelIdleCallback?: (h: number) => void };
  if (g.requestIdleCallback && g.cancelIdleCallback) {
    const h = g.requestIdleCallback(run);
    return () => g.cancelIdleCallback!(h);
  }
  const h = setTimeout(run, 0);
  return () => clearTimeout(h);
}

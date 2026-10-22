import { useEffect, useRef } from "react";
import { themeCssVars } from "@cs/render";
import { useController } from "../ui/context";
import { useShell } from "./use-shell";
import { classifyLayout, DEFAULT_SIZES, type Layout } from "./classify";

const sameLayout = (a: Layout | null, b: Layout) =>
  !!a && a.width === b.width && a.height === b.height && a.pointer === b.pointer && a.arrangement === b.arrangement;

/**
 * Measures the shell (not the screen, spec §5) and publishes the layout as
 * data attributes and CSS variables, so the arrangement is pure CSS and no
 * panel is remounted when the class changes (RSP-02).
 */
export function LayoutManager() {
  const c = useController();
  const sh = useShell();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const shell = ref.current?.closest<HTMLElement>(".shell");
    if (!shell) return;
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const measure = () => {
      const b = shell.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return; // not laid out (tests, hidden iframe)
      const center = shell.querySelector(".center")?.getBoundingClientRect().width ?? b.width;
      const layout = classifyLayout(b.width, b.height, coarse, center);
      if (!sameLayout(sh.ui.get().layout, layout)) sh.ui.set({ layout });
    };
    const attrs = () => {
      const ui = sh.ui.get();
      const l = ui.layout;
      if (l) {
        shell.dataset.width = l.width;
        shell.dataset.height = l.height;
        shell.dataset.arrangement = l.arrangement;
      }
      shell.dataset.pointer = l?.pointer ?? (coarse ? "coarse" : "fine");
      shell.dataset.view = ui.view;
      if (ui.drawer && l?.width === "narrow") shell.dataset.drawer = ui.drawer;
      else delete shell.dataset.drawer;
      c.scheduler.invalidateAll();
    };
    const sizes = () => {
      const l = sh.settings.get().layout;
      shell.style.setProperty("--chart-frac", String(l.chartFrac ?? DEFAULT_SIZES.chartFrac));
      shell.style.setProperty("--palette-w", `${l.paletteW ?? DEFAULT_SIZES.paletteW}px`);
      shell.style.setProperty("--inspector-w", `${l.inspectorW ?? DEFAULT_SIZES.inspectorW}px`);
    };
    // One token set feeds both CSS and the canvases (ACC-11/12).
    const theme = () => {
      for (const [k, v] of Object.entries(themeCssVars(c.theme()))) shell.style.setProperty(k, v);
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    ro?.observe(shell);
    const center = shell.querySelector(".center");
    if (center) ro?.observe(center);
    measure();
    attrs();
    sizes();
    theme();
    sh.settings.applyKeymap(); // commands registered after the controller was built
    const offs = [sh.ui.subscribe(attrs), sh.settings.store.subscribe(sizes), c.store.subscribe(theme)];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sh.ui.get().drawer) {
        sh.ui.set({ drawer: null });
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      ro?.disconnect();
      offs.forEach((o) => o());
      window.removeEventListener("keydown", onKey, true);
    };
  }, [c, sh]);

  return <span ref={ref} hidden />;
}

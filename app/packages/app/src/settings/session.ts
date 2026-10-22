import type { SchematicRenderer, Theme, ThemeName } from "@cs/render";
import type { AppController } from "../controller";
import { createStore, type Store } from "../store";
import { isMacPlatform } from "../commands/keymap";
import { applyKeymap } from "./keymap";
import {
  DEFAULT_LEARNER,
  loadLearner,
  resolveReducedMotion,
  saveLearner,
  type LearnerSettings,
  type StorageLike,
} from "./learner";

const BLUE: [number, number, number] = [0, 114, 178];
const ORANGE: [number, number, number] = [230, 159, 0];

/** The voltage color scale setting applied to a theme (ACC-12). */
export function adjustTheme(t: Theme, s: Pick<LearnerSettings, "voltageColors">): Theme {
  if (s.voltageColors === "blue-orange") return { ...t, voltNeg: BLUE, voltPos: ORANGE };
  if (s.voltageColors === "off") return { ...t, voltNeg: t.voltZero, voltPos: t.voltZero };
  return t;
}

/** Owns the learner settings and pushes them into the controller and renderers. */
export class SettingsSession {
  readonly store: Store<LearnerSettings>;
  readonly mac = isMacPlatform();
  private appliedTheme: LearnerSettings["theme"] = "auto";
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private c: AppController,
    private storage: StorageLike | undefined,
  ) {
    this.store = createStore<LearnerSettings>(loadLearner(storage));
    c.themeAdjust = (t) => adjustTheme(t, this.store.get());
    c.schematicHooks.add((r) => this.applyRenderer(r));
    this.apply();
  }

  get(): LearnerSettings {
    return this.store.get();
  }

  update(patch: Partial<LearnerSettings>): void {
    this.store.set(patch);
    saveLearner(this.storage, this.store.get());
    this.apply();
  }

  /** Layout sizes change continuously while a splitter drags; save them a moment later. */
  updateLayout(patch: LearnerSettings["layout"]): void {
    this.store.set((s) => ({ layout: { ...s.layout, ...patch } }));
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => saveLearner(this.storage, this.store.get()), 300);
  }

  /** SET-05: every learner setting back to its default (the dialog confirms first). */
  restoreDefaults(): void {
    this.update({ ...DEFAULT_LEARNER, keymap: {}, layout: {} });
  }

  /** Re-apply keys, e.g. after commands registered late. */
  applyKeymap(): void {
    applyKeymap(this.c.commands, this.store.get().keymap);
  }

  private apply(): void {
    const s = this.store.get();
    this.applyKeymap();
    const st = this.c.store.get();
    const current: ThemeName = st.theme ?? (st.dark ? "dark" : "light");
    if (s.theme !== "auto") this.c.setTheme(s.theme);
    else if (this.appliedTheme !== "auto") this.c.setTheme(systemDark() ? "dark" : "light");
    else this.c.setTheme(current); // re-push so a changed voltage scale reaches the canvases
    this.appliedTheme = s.theme;
    if (this.c.schematic) this.applyRenderer(this.c.schematic);
  }

  private applyRenderer(r: SchematicRenderer): void {
    const s = this.store.get();
    r.symbolStyle = s.symbolStyle;
    r.animator.enabled = s.currentDisplay !== "off";
    r.animator.electronFlow = s.currentDisplay === "electron";
    r.animator.reducedMotion = resolveReducedMotion(s);
    this.c.scheduler.invalidateAll();
  }
}

function systemDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

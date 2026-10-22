import { createStore, type Store } from "../store";
import type { Layout, MainView } from "./classify";

/** Shell UI state owned by the shell features (app-shell.md §1: session state, never in the file). */
export interface ShellUi {
  dialog: null | "settings" | "shortcuts";
  /** Part whose label and value are being edited in place (EDT-25). */
  editing: string | null;
  /** Open drawer in the narrow layout. */
  drawer: null | "palette" | "inspector";
  /** Circuit only, chart only, or both (LAY-11, narrow switch). */
  view: MainView;
  /** Measured layout; null until the shell has a size. */
  layout: Layout | null;
}

export const createShellUi = (view: MainView = "both"): Store<ShellUi> =>
  createStore<ShellUi>({ dialog: null, editing: null, drawer: null, view, layout: null });

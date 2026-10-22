import type { Diagnostic } from "@cs/model";
import type { RunState } from "@cs/worker";
import { createStore } from "./store";

export type ToolSpec =
  | { id: "select" }
  | { id: "place"; type: string }
  | { id: "wire" }
  | { id: "probe-v" };

/** Session state (app-shell.md §1): never saved in the circuit file. */
export interface AppState {
  selection: string[];
  tool: ToolSpec;
  runState: RunState;
  simTime: number;
  speed: number | "fit";
  effectiveSpeed: number;
  slowerThanRequested: boolean;
  canUndo: boolean;
  canRedo: boolean;
  dark: boolean;
  diagnostics: Omit<Diagnostic, "fixes">[];
  workerError?: string;
}

export const initialAppState = (dark = false): AppState => ({
  selection: [],
  tool: { id: "select" },
  runState: "paused",
  simTime: 0,
  speed: 1,
  effectiveSpeed: 0,
  slowerThanRequested: false,
  canUndo: false,
  canRedo: false,
  dark,
  diagnostics: [],
});

export const createAppStore = (dark = false) => createStore<AppState>(initialAppState(dark));
export type AppStore = ReturnType<typeof createAppStore>;

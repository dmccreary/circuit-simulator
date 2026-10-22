import { createContext, useContext, useMemo } from "react";
import type { CircuitDocument } from "@cs/model";
import type { AppController } from "../controller";
import type { AppState } from "../app-state";
import { useStore } from "../store";

export const ControllerContext = createContext<AppController | null>(null);

export function useController(): AppController {
  const c = useContext(ControllerContext);
  if (!c) throw new Error("ControllerContext missing");
  return c;
}

/** App-store slice; selector must be stable or cheap (it runs on every store change). */
export function useApp<S>(select: (s: AppState) => S): S {
  return useStore(useController().store, select);
}

/** Document slice, re-rendering only when the selected slice changes identity (structural sharing). */
export function useDocument<S>(select: (d: CircuitDocument) => S): S {
  const c = useController();
  const src = useMemo(() => ({ get: () => c.edits.doc, subscribe: (fn: () => void) => c.edits.onPatches(fn) }), [c]);
  return useStore(src, select);
}

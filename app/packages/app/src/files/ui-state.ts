import type { RecoveryRecord } from "@cs/persistence";
import { createStore, type Store } from "../store";

export type FilesDialog =
  | { kind: "confirm"; title: string; message: string; confirm: string; cancel: string; resolve: (ok: boolean) => void }
  | { kind: "examples" }
  | { kind: "myCircuits" }
  | { kind: "recovery"; entries: RecoveryRecord[] }
  | { kind: "notices"; title: string; lines: string[] }
  | { kind: "link"; url: string };

/** File-layer UI state: one dialog at a time, plus a transient status notice. */
export interface FilesUiState {
  dialog: FilesDialog | null;
  notice: { text: string; error?: boolean } | null;
  dragging: boolean;
}

export type FilesUi = Store<FilesUiState>;

export const createFilesUi = (): FilesUi => createStore<FilesUiState>({ dialog: null, notice: null, dragging: false });

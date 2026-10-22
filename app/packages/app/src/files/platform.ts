// Browser file access (files-and-persistence.md §5.4). The File System Access
// API (Chrome, Edge) lets Save write back to the same file; elsewhere Open
// uses an <input type=file> and Save downloads the file.

export interface OpenedFile {
  name: string;
  text: string;
  /** A FileSystemFileHandle when the File System Access API supplied the file. */
  handle?: unknown;
}

export interface SavedFile {
  name: string;
  handle?: unknown;
}

export interface FilePlatform {
  pickOpen(): Promise<OpenedFile | null>;
  /** Writes to `handle` when given; otherwise asks for a place (or downloads). Null when cancelled. */
  save(text: string, suggestedName: string, handle?: unknown): Promise<SavedFile | null>;
  copyText(text: string): Promise<boolean>;
  fetchText(url: string): Promise<string>;
}

export const CIRCUIT_EXTENSION = ".circuit.json";
const ACCEPT = ".json,.txt,application/json,text/plain";

interface WritableLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (o?: unknown) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (o?: unknown) => Promise<FileHandleLike>;
};

const pickerTypes = [
  { description: "Circuit files", accept: { "application/json": [".json"], "text/plain": [".txt"] } },
];

const isAbort = (e: unknown) => (e as { name?: string })?.name === "AbortError";

function inputPick(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.style.display = "none";
    document.body.appendChild(input);
    const finish = async () => {
      const f = input.files?.[0];
      input.remove();
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.addEventListener("change", () => void finish(), { once: true });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });
}

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function browserPlatform(): FilePlatform {
  const w = window as PickerWindow;
  return {
    async pickOpen() {
      if (w.showOpenFilePicker) {
        try {
          const [h] = await w.showOpenFilePicker({ types: pickerTypes, multiple: false });
          const f = await h.getFile();
          return { name: f.name, text: await f.text(), handle: h };
        } catch (e) {
          if (isAbort(e)) return null;
          // Some embeds forbid the picker; fall back to the input element.
        }
      }
      return inputPick();
    },
    async save(text, suggestedName, handle) {
      let h = handle as FileHandleLike | undefined;
      if (!h && w.showSaveFilePicker) {
        try {
          h = await w.showSaveFilePicker({ suggestedName, types: [pickerTypes[0]] });
        } catch (e) {
          if (isAbort(e)) return null;
          h = undefined;
        }
      }
      if (h) {
        const out = await h.createWritable();
        await out.write(text);
        await out.close();
        return { name: h.name, handle: h };
      }
      download(text, suggestedName);
      return { name: suggestedName };
    },
    async copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    async fetchText(url) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.text();
    },
  };
}

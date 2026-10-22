// Entry point of the live simulation worker (design/index.md §4.1).
// Create with: new Worker(new URL("./live-worker.ts", import.meta.url), { type: "module" })

import { ensureTypes, getModelFactory, typesLoaded } from "@cs/elements/models";
import { EngineHost } from "./host";
import { createModelGate, netlistTypes } from "./model-gate";
import { PROTOCOL_VERSION, type Command, type WorkerMessage } from "./protocol";

interface WorkerScope {
  postMessage(msg: WorkerMessage, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<Command>) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;

// A MessageChannel tick runs sooner than setTimeout(0), which browsers clamp.
const channel = new MessageChannel();
const immediate: (() => void)[] = [];
channel.port1.onmessage = () => immediate.shift()?.();

const host = new EngineHost({
  now: () => performance.now(),
  schedule(fn, delayMs) {
    if (delayMs <= 0) {
      immediate.push(fn);
      channel.port2.postMessage(0);
    } else setTimeout(fn, delayMs);
  },
  post: (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  getModelFactory,
});

// Load the model chunks a netlist needs before the host builds its engine.
const handle = createModelGate<Command>({
  deliver: (cmd) => host.handle(cmd),
  typesOf: netlistTypes,
  typesLoaded,
  ensureTypes,
  onError: (e) => console.error("Could not load part models", e),
});

scope.onmessage = (ev) => handle(ev.data);
scope.postMessage({ type: "ready", protocolVersion: PROTOCOL_VERSION });

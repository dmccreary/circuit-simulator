// Entry point of the live simulation worker (design/index.md §4.1).
// Create with: new Worker(new URL("./live-worker.ts", import.meta.url), { type: "module" })

import { getModelFactory } from "@cs/elements/models";
import { EngineHost } from "./host";
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

scope.onmessage = (ev) => host.handle(ev.data);
scope.postMessage({ type: "ready", protocolVersion: PROTOCOL_VERSION });

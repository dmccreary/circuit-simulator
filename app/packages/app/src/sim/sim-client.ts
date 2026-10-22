import type { ChannelSpec, CircuitDocument, CompiledCircuit, Patch, PatchBatch, PropValue } from "@cs/model";
import type { Command, Frame, WorkerMessage } from "@cs/worker";

export interface WorkerPort {
  postMessage(msg: Command, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror?: ((e: ErrorEvent) => void) | null;
  terminate?(): void;
}

export type ChangeKind = "none" | "params" | "topology";

/** The model and worker functions the client needs, injected so it can be tested without a worker. */
export interface SimDeps {
  compile(doc: CircuitDocument, previous?: CompiledCircuit): CompiledCircuit;
  classify(patches: readonly Patch[]): ChangeKind;
  paramChanges(patches: readonly Patch[], doc: CircuitDocument): { element: string; param: string; value: PropValue }[];
  decodeFrame(buf: ArrayBuffer): Frame;
}

export interface SimEvents {
  compiled(c: CompiledCircuit): void;
  frame(f: Frame): void;
  message(m: WorkerMessage): void;
  error(message: string): void;
}

const touchesChannels = (b: PatchBatch) => b.patches.some((p) => p.path[0] === "probes" || p.path[0] === "lanes");

const sameChannels = (a: ChannelSpec[], b: ChannelSpec[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Main-thread side of the live worker (simulation-engine.md §7): compiles on
 * patches, sends setParams or replaceNetlist, decodes and acks frames.
 */
export class SimClient {
  compiled: CompiledCircuit | undefined;
  private channels: ChannelSpec[] = [];

  constructor(
    private port: WorkerPort,
    private deps: SimDeps,
    private on: Partial<SimEvents>,
  ) {
    port.onmessage = (e) => this.receive(e.data);
    if ("onerror" in port) port.onerror = (e) => this.on.error?.(e.message || "Simulation worker failed to start");
  }

  send(cmd: Command): void {
    this.port.postMessage(cmd);
  }

  /** Compile and load a whole document; the engine starts paused at t = 0. */
  load(doc: CircuitDocument): void {
    this.compiled = this.safeCompile(doc);
    if (!this.compiled) return;
    this.channels = Object.values(this.compiled.channels);
    this.on.compiled?.(this.compiled);
    this.send({ type: "load", netlist: this.compiled.netlist, channels: this.channels });
  }

  /** Feed every PatchBatch from the edit system, in order. */
  applyBatch(batch: PatchBatch, doc: CircuitDocument): void {
    if (batch.source === "load" || !this.compiled) return this.load(doc);
    if (batch.patches.length === 0) return;
    const kind = this.deps.classify(batch.patches);
    if (kind === "topology") {
      const next = this.safeCompile(doc, this.compiled);
      if (!next) return;
      this.compiled = next;
      this.on.compiled?.(next);
      this.send({ type: "replaceNetlist", netlist: next.netlist, identity: next.identity });
      this.syncChannels();
      return;
    }
    if (kind === "params") {
      const changes = this.deps.paramChanges(batch.patches, doc);
      if (changes.length) this.send({ type: "setParams", changes });
      // Recompile so the renderer's view of props (switch contacts, labels) stays current.
      const next = this.safeCompile(doc, this.compiled);
      if (next) {
        this.compiled = next;
        this.on.compiled?.(next);
      }
    }
    if (touchesChannels(batch)) {
      const next = this.safeCompile(doc, this.compiled);
      if (!next) return;
      this.compiled = next;
      this.on.compiled?.(next);
      this.syncChannels();
    }
  }

  dispose(): void {
    this.port.onmessage = null;
    this.port.terminate?.();
  }

  private syncChannels(): void {
    const ch = Object.values(this.compiled?.channels ?? {});
    if (sameChannels(ch, this.channels)) return;
    this.channels = ch;
    this.send({ type: "setChannels", channels: ch });
  }

  private safeCompile(doc: CircuitDocument, prev?: CompiledCircuit): CompiledCircuit | undefined {
    try {
      return this.deps.compile(doc, prev);
    } catch (e) {
      this.on.error?.(`Compile failed: ${(e as Error).message}`);
      return undefined;
    }
  }

  private receive(m: WorkerMessage): void {
    this.on.message?.(m);
    if (m.type !== "frame") return;
    let f: Frame;
    try {
      f = this.deps.decodeFrame(m.buffer);
    } catch (e) {
      this.on.error?.(`Bad frame: ${(e as Error).message}`);
      return;
    }
    this.on.frame?.(f);
    this.send({ type: "ackFrame", frame: f.frame });
  }
}

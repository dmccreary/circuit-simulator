// Part models outside Essentials load on demand (circuit-model.md §5.4).
// The gate delivers worker commands in arrival order, holding a command (and
// everything after it) while the model groups it needs are loading.

export interface ModelGateDeps<C> {
  deliver(cmd: C): void;
  /** Part types a command needs, or null when it needs none. */
  typesOf(cmd: C): Iterable<string> | null;
  typesLoaded(types: Iterable<string>): boolean;
  ensureTypes(types: Iterable<string>): Promise<void>;
  /** A group failed to load (offline): report it; the command is still delivered. */
  onError?(err: unknown): void;
}

export function createModelGate<C>(deps: ModelGateDeps<C>): (cmd: C) => void {
  let queue: Promise<void> | null = null;
  let waiting = 0;
  return (cmd) => {
    const types = deps.typesOf(cmd);
    if (waiting === 0 && (!types || deps.typesLoaded(types))) {
      deps.deliver(cmd); // the common case: synchronous, as before
      return;
    }
    waiting++;
    const ready = types ? deps.ensureTypes(types).catch((e: unknown) => deps.onError?.(e)) : Promise.resolve();
    queue = (queue ?? Promise.resolve())
      .then(() => ready)
      .then(() => deps.deliver(cmd))
      .finally(() => {
        waiting--;
      });
  };
}

/** Types needed by a live-worker command: the netlist's, for load and replaceNetlist. */
export function netlistTypes(cmd: { type: string; netlist?: { elements: { type: string }[] } }): string[] | null {
  return (cmd.type === "load" || cmd.type === "replaceNetlist") && cmd.netlist ? cmd.netlist.elements.map((e) => e.type) : null;
}

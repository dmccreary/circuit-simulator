// A no-op 2-D canvas context for jsdom tests (jsdom has no canvas).

/** A 2-D context that accepts every call and draws nothing; `counts` tallies calls by method name. */
export function stubCanvas(counts?: Map<string, number>): void {
  // Every unknown member is a callable that returns another such object, so
  // gradients, patterns and paths work too (createRadialGradient().addColorStop()).
  const stored: Record<string, unknown> = {};
  const any: unknown = new Proxy(function () {} as unknown as Record<string, unknown>, {
    get: (_t, k) => {
      if (typeof k === "symbol") return k === Symbol.toPrimitive ? () => 0 : undefined;
      if (k in stored) return stored[k];
      if (k === "measureText") return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (k === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === "then") return undefined;
      if (counts) return (..._args: unknown[]) => (counts.set(k, (counts.get(k) ?? 0) + 1), any);
      return any;
    },
    set: (_t, k: string, v) => ((stored[k] = v), true),
    apply: () => any,
  });
  HTMLCanvasElement.prototype.getContext = (() => any) as unknown as HTMLCanvasElement["getContext"];
}

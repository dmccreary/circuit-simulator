import type { Frame } from "@cs/worker";

export type FrameListener = (f: Frame) => void;

/** Fans each decoded frame out to its subscribers (Overview §3.1, component 7). */
export class FrameBus {
  latest: Frame | undefined;
  /** Last sample seen per channel; paused frames carry no samples but values still show. */
  private lastValues = new Map<string, number>();
  private subs = new Set<FrameListener>();

  subscribe(fn: FrameListener): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  publish(f: Frame): void {
    this.latest = f;
    const n = f.times.length;
    if (n > 0) f.channelIds.forEach((id, c) => this.lastValues.set(id, f.samples[c * n + n - 1]));
    for (const s of [...this.subs]) s(f);
  }

  clear(): void {
    this.latest = undefined;
    this.lastValues.clear();
  }

  lastValue(channelId: string): number | undefined {
    return this.lastValues.get(channelId);
  }
}

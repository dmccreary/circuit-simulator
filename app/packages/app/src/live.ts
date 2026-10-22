import { useEffect, useRef, useState } from "react";
import type { Frame } from "@cs/worker";
import type { FrameBus } from "./frame-bus";

export const LIVE_SAMPLE_MS = 100;

/**
 * Read a live value from the latest frame, sampled at most 10 times a second
 * so frame-rate data never drives React renders (Overview §5.2).
 */
export function useLiveValue<T>(bus: FrameBus, read: (f: Frame | undefined) => T): T {
  const readRef = useRef(read);
  readRef.current = read;
  const [value, setValue] = useState(() => read(bus.latest));
  useEffect(() => {
    const id = setInterval(() => {
      const v = readRef.current(bus.latest);
      setValue((old) => (Object.is(old, v) ? old : v));
    }, LIVE_SAMPLE_MS);
    return () => clearInterval(id);
  }, [bus]);
  return value;
}

/** The latest sample of a channel in a frame, if present. */
export function channelValue(f: Frame | undefined, channelId: string): number | undefined {
  if (!f) return undefined;
  const c = f.channelIds.indexOf(channelId);
  const n = f.times.length;
  if (c < 0 || n === 0) return undefined;
  return f.samples[c * n + n - 1];
}

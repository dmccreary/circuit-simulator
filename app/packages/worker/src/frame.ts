// Frame packing (simulation-engine.md §7.3): one ArrayBuffer, transferred.
//
//   header   64 bytes, little-endian (see offsets below)
//   times    Float64Array[n]
//   samples  Float64Array[n * k]   channel-major
//   display  Float64Array[displayLen]
//   discrete Uint8Array[discreteLen] logic state per node (index = NodeIndex):
//            0 low, 1 high, 2 X, 3 Z, 255 analog; empty without logic parts.
//            Read with decodeDiscrete() (Frame has no field for it yet).
//   tail     UTF-8 JSON { channelIds, events }
//
// The Float64 blocks are platform-endian typed-array views (little-endian on
// every browser we support), which lets decode return views without copying.

import type { Frame, RunState } from "./protocol";

const MAGIC = 0x43534631; // "CSF1"
const LAYOUT_VERSION = 1;
const HEADER = 64;
const RUN_STATES: RunState[] = ["paused", "running", "stepping", "stopped"];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeFrame(f: Frame, discrete: Uint8Array = new Uint8Array(0)): ArrayBuffer {
  const n = f.times.length;
  const k = f.channelIds.length;
  if (f.samples.length !== n * k) throw new Error(`frame samples: expected ${n * k}, got ${f.samples.length}`);
  const tail = encoder.encode(JSON.stringify({ channelIds: f.channelIds, events: f.events }));
  const discreteLen = discrete.length;
  const f64Bytes = 8 * (n + n * k + f.display.length);
  const buf = new ArrayBuffer(HEADER + f64Bytes + discreteLen + tail.length);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, LAYOUT_VERSION, true);
  dv.setUint32(8, f.frame, true);
  dv.setUint32(12, n, true);
  dv.setUint32(16, k, true);
  dv.setUint32(20, f.display.length, true);
  dv.setUint32(24, f.slowerThanRequested ? 1 : 0, true);
  dv.setUint32(28, Math.max(0, RUN_STATES.indexOf(f.runState)), true);
  dv.setFloat64(32, f.t0, true);
  dv.setFloat64(40, f.t1, true);
  dv.setFloat64(48, f.effectiveSpeed, true);
  dv.setUint32(56, discreteLen, true);
  dv.setUint32(60, tail.length, true);
  let off = HEADER;
  new Float64Array(buf, off, n).set(f.times);
  off += 8 * n;
  new Float64Array(buf, off, n * k).set(f.samples);
  off += 8 * n * k;
  new Float64Array(buf, off, f.display.length).set(f.display);
  off += 8 * f.display.length;
  new Uint8Array(buf, off, discreteLen).set(discrete);
  off += discreteLen;
  new Uint8Array(buf, off, tail.length).set(tail);
  return buf;
}

export function decodeFrame(buf: ArrayBuffer): Frame {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error("not a simulator frame");
  if (dv.getUint32(4, true) !== LAYOUT_VERSION) throw new Error("unsupported frame layout version");
  const frame = dv.getUint32(8, true);
  const n = dv.getUint32(12, true);
  const k = dv.getUint32(16, true);
  const displayLen = dv.getUint32(20, true);
  const flags = dv.getUint32(24, true);
  const runState = RUN_STATES[dv.getUint32(28, true)] ?? "paused";
  const t0 = dv.getFloat64(32, true);
  const t1 = dv.getFloat64(40, true);
  const effectiveSpeed = dv.getFloat64(48, true);
  const discreteLen = dv.getUint32(56, true);
  const tailLen = dv.getUint32(60, true);
  let off = HEADER;
  const times = new Float64Array(buf, off, n);
  off += 8 * n;
  const samples = new Float64Array(buf, off, n * k);
  off += 8 * n * k;
  const display = new Float64Array(buf, off, displayLen);
  off += 8 * displayLen + discreteLen;
  const tail = JSON.parse(decoder.decode(new Uint8Array(buf, off, tailLen))) as Pick<Frame, "channelIds" | "events">;
  return {
    frame,
    t0,
    t1,
    runState,
    effectiveSpeed,
    slowerThanRequested: (flags & 1) !== 0,
    channelIds: tail.channelIds,
    times,
    samples,
    display,
    events: tail.events,
  };
}

/** The discrete block of an encoded frame: logic state per node (see the layout above). */
export function decodeDiscrete(buf: ArrayBuffer): Uint8Array {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error("not a simulator frame");
  const n = dv.getUint32(12, true);
  const k = dv.getUint32(16, true);
  const displayLen = dv.getUint32(20, true);
  const discreteLen = dv.getUint32(56, true);
  return new Uint8Array(buf, HEADER + 8 * (n + n * k + displayLen), discreteLen);
}

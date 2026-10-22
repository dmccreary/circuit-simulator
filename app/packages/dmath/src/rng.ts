// Seeded xoshiro128** generator (SIM-23): the seed stored in the file
// reproduces every noise source exactly.

import { cos, log, sin } from "./elementary";

export interface Rng {
  /** Uniform in [0, 1) with 53 random bits. */
  next(): number;
  /** Standard normal (mean 0, variance 1), Box–Muller. */
  nextGaussian(): number;
  /** Raw 32-bit unsigned output. */
  nextUint32(): number;
}

const TWO_PI = 6.283185307179586;

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

export function createRng(seed: number): Rng {
  // Fold non-integer or large seeds into 32 bits deterministically.
  const s32 = Math.floor(seed) % 4294967296;
  const sm = splitmix32(s32);
  let s0 = sm() | 0;
  let s1 = sm() | 0;
  let s2 = sm() | 0;
  let s3 = sm() | 0;
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;
  let spare: number | null = null;

  const nextUint32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };

  const next = (): number => {
    const a = nextUint32() >>> 5; // 27 bits
    const b = nextUint32() >>> 6; // 26 bits
    return (a * 67108864 + b) / 9007199254740992;
  };

  const nextGaussian = (): number => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const u1 = 1 - next(); // (0, 1]
    const u2 = next();
    const r = Math.sqrt(-2 * log(u1));
    spare = r * sin(TWO_PI * u2);
    return r * cos(TWO_PI * u2);
  };

  return { next, nextGaussian, nextUint32 };
}

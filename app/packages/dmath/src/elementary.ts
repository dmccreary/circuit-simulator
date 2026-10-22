// Deterministic elementary functions built from IEEE basic arithmetic only
// (design/index.md §5.1). Math.exp/log/sin/cos/pow differ between browsers in
// the last bit; these do not. Accuracy is a few ulp over the usual ranges.

import { frexp1, ldexp } from "./bits";

// fdlibm splits: the *_HI parts have trailing zero bits so k * HI is exact.
const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const SQRT2 = 1.4142135623730951;
const PIO2_1 = 1.57079632673412561417;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_3 = 2.02226624871116645580e-21;
const PIO2_3T = 8.47842766036889956997e-32;
const TWO_OVER_PI = 6.36619772367581382433e-1;

/** 1/k! for k = 0..20, built by exact-order division so every platform agrees. */
const INV_FACT: number[] = (() => {
  const out = [1];
  let f = 1;
  for (let k = 1; k <= 20; k++) {
    f *= k; // exact up to 18!, rounded identically everywhere after
    out.push(1 / f);
  }
  return out;
})();

/** e^r - 1 for |r| <= 0.5 by Taylor series (relative accuracy kept near 0). */
function expm1Small(r: number): number {
  let p = INV_FACT[17];
  for (let k = 16; k >= 2; k--) p = p * r + INV_FACT[k];
  return r + r * r * p;
}

export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019412) return 0;
  if (x === 0) return 1;
  const k = Math.floor(x * INV_LN2 + 0.5);
  const r = x - k * LN2_HI - k * LN2_LO;
  // |r| <= ~0.347: Taylor to degree 14 leaves < 1e-17 relative truncation error.
  let p = INV_FACT[14];
  for (let i = 13; i >= 0; i--) p = p * r + INV_FACT[i];
  return ldexp(p, k);
}

export function expm1(x: number): number {
  if (x !== x) return NaN;
  if (x > -0.5 && x < 0.5) return expm1Small(x);
  return exp(x) - 1;
}

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let { m, e } = frexp1(x);
  if (m > SQRT2) {
    m *= 0.5;
    e += 1;
  }
  // log m = 2 atanh(s), s = (m-1)/(m+1), |s| <= 0.1716
  const f = m - 1;
  const s = f / (m + 1);
  const z = s * s;
  let p = 1 / 25;
  for (let k = 11; k >= 1; k--) p = p * z + 1 / (2 * k + 1);
  // log m = 2s + 2s*z*p, and 2s = f - s*f keeps the exact f as the leading term.
  const logm = f - s * (f - 2 * z * p);
  return e * LN2_HI + (logm + e * LN2_LO);
}

/** Reduce x to r in [-pi/4, pi/4] and quadrant q with x = r + q*pi/2. */
function reduce(x: number): { r: number; q: number } {
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return { r: x, q: 0 };
  const k = Math.floor(x * TWO_OVER_PI + 0.5);
  const r = x - k * PIO2_1 - k * PIO2_2 - k * PIO2_3 - k * PIO2_3T;
  return { r, q: ((k % 4) + 4) % 4 };
}

function sinPoly(r: number): number {
  const z = r * r;
  let p = -INV_FACT[19];
  for (let k = 17; k >= 3; k -= 2) p = ((k - 1) / 2) % 2 === 0 ? p * z + INV_FACT[k] : p * z - INV_FACT[k];
  return r + r * z * p;
}

function cosPoly(r: number): number {
  const z = r * r;
  let p = INV_FACT[20];
  for (let k = 18; k >= 4; k -= 2) p = (k / 2) % 2 === 0 ? p * z + INV_FACT[k] : p * z - INV_FACT[k];
  return 1 - 0.5 * z + z * z * p;
}

export function sin(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const { r, q } = reduce(x);
  switch (q) {
    case 0:
      return sinPoly(r);
    case 1:
      return cosPoly(r);
    case 2:
      return -sinPoly(r);
    default:
      return -cosPoly(r);
  }
}

export function cos(x: number): number {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const { r, q } = reduce(x);
  switch (q) {
    case 0:
      return cosPoly(r);
    case 1:
      return -sinPoly(r);
    case 2:
      return -cosPoly(r);
    default:
      return sinPoly(r);
  }
}

function isInteger(y: number): boolean {
  return Math.floor(y) === y && y !== Infinity && y !== -Infinity;
}

/**
 * x^y. Small integer exponents use repeated squaring; the rest go through
 * exp(y log x), whose relative error grows like |y log x| * 2^-53.
 */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (x === 1) return 1;
  if (isInteger(y) && Math.abs(y) <= 64) {
    let base = y < 0 ? 1 / x : x;
    let n = Math.abs(y);
    let acc = 1;
    while (n > 0) {
      if (n % 2 === 1) acc *= base;
      base *= base;
      n = Math.floor(n / 2);
    }
    return acc;
  }
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    if (!isInteger(y)) return NaN;
    const mag = exp(y * log(-x));
    return Math.floor(y / 2) * 2 === y ? mag : -mag;
  }
  if (x === Infinity) return y > 0 ? Infinity : 0;
  return exp(y * log(x));
}

export function tanh(x: number): number {
  if (x !== x) return NaN;
  const a = Math.abs(x);
  if (a > 22) return x > 0 ? 1 : -1;
  if (a < 3.725290298461914e-9) return x;
  const t = expm1(2 * a);
  const r = t / (t + 2);
  return x < 0 ? -r : r;
}

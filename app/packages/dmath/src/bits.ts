// IEEE 754 bit access through a DataView, so results never depend on platform endianness.

const view = new DataView(new ArrayBuffer(8));

/** 2^k for integer k in [-1022, 1023]. */
export function pow2(k: number): number {
  view.setUint32(0, (k + 1023) << 20);
  view.setUint32(4, 0);
  return view.getFloat64(0);
}

/** x * 2^k for any integer k, without intermediate overflow or premature underflow. */
export function ldexp(x: number, k: number): number {
  while (k > 1023) {
    x *= pow2(1023);
    k -= 1023;
    if (x === Infinity || x === -Infinity) return x;
  }
  while (k < -1022) {
    // Scale in two hops so subnormal results round only once.
    if (k < -1022 - 53) {
      x *= pow2(-1022);
      k += 1022;
      if (x === 0) return x;
    } else {
      x *= pow2(k + 53);
      return x * pow2(-53);
    }
  }
  return x * pow2(k);
}

/** Split a positive finite x into m * 2^e with m in [1, 2). */
export function frexp1(x: number): { m: number; e: number } {
  let adj = 0;
  if (x < pow2(-1022)) {
    x *= pow2(54);
    adj = -54;
  }
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const e = ((hi >>> 20) & 0x7ff) - 1023;
  view.setUint32(0, (hi & 0x800fffff) | (1023 << 20));
  return { m: view.getFloat64(0), e: e + adj };
}

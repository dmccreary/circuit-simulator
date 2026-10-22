// Gate pin layout, following CircuitJS1's GateElm.setPoints(): inputs sit one
// grid unit apart across the axis, skipping the axis itself when the count is
// even; the output sits on the axis at the far end.
// https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/client/GateElm.java

/** Default input-to-output distance, grid units. */
export const GATE_LENGTH = 4;
/** Input counts offered as separate part types (2 is the plain gate; 1 is CircuitJS1's one-input gate, a buffer or inverter). */
export const WIDE_GATE_INPUTS = [1, 3, 4, 5, 6, 7, 8] as const;

/** Offsets of the inputs from the axis, in GateElm order. */
export function inputOffsets(n: number): number[] {
  const out: number[] = [];
  let i0 = -Math.floor(n / 2);
  for (let i = 0; i < n; i++, i0++) {
    if (i0 === 0 && n % 2 === 0) i0++;
    out.push(i0);
  }
  return out;
}

/** Input y positions in the part frame (first input at y = 0) and the axis y. */
export function gateLayout(n: number): { inputs: number[]; axis: number } {
  const off = inputOffsets(n);
  return { inputs: off.map((o) => o - off[0]), axis: -off[0] };
}

/** Number of inputs encoded in a gate type ("and-gate-3" -> 3, "and-gate" -> 2). */
export function gateInputs(type: string): number {
  const m = /-(\d+)$/.exec(type);
  return m ? Number(m[1]) : 2;
}

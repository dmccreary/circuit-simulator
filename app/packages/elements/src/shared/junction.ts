import { exp, log } from "./math";

/** Thermal voltage kT/q at 300 K. */
export const VT = 0.025852;
/** Beyond this exponent the Shockley curve continues as a straight line, so it never overflows. */
const ARG_MAX = 80;

/** Shockley p-n junction, I = Is·(exp(v / (n·Vt)) - 1), with SPICE-style voltage limiting. */
export class Junction {
  private is = 1e-14;
  private nvt = VT;
  private vcrit = 0.6;

  setParams(is: number, n: number): void {
    this.is = Math.max(1e-30, is);
    this.nvt = Math.max(0.1, n) * VT;
    this.vcrit = this.nvt * log(this.nvt / (Math.SQRT2 * this.is));
  }

  /** SPICE's Vcrit: where the curve turns sharply; a good first Newton guess for an "on" junction. */
  criticalVoltage(): number {
    return this.vcrit;
  }

  current(v: number): number {
    const arg = v / this.nvt;
    if (arg > ARG_MAX) return this.is * (exp(ARG_MAX) * (1 + arg - ARG_MAX) - 1);
    return this.is * (exp(arg) - 1);
  }

  conductance(v: number): number {
    const arg = Math.min(v / this.nvt, ARG_MAX);
    return (this.is / this.nvt) * exp(arg);
  }

  /** pnjlim: keep a Newton update of the junction voltage from leaping up the exponential. */
  limit(vnew: number, vold: number): number {
    const vt = this.nvt;
    if (vnew > this.vcrit && Math.abs(vnew - vold) > 2 * vt) {
      if (vold > 0) {
        const arg = 1 + (vnew - vold) / vt;
        return arg > 0 ? vold + vt * log(arg) : this.vcrit;
      }
      return vt * log(vnew / vt);
    }
    return vnew;
  }
}

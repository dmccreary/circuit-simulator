import { cos, sin } from "@cs/dmath";
import type { ModelFactory, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import { num, type Props } from "../shared/props";
import { VoltageSourceModel } from "../shared/voltageSourceModel";

const TWO_PI = 2 * Math.PI;

/**
 * AntennaElm.getVoltage() at time t, with every frequency multiplied by `s`:
 *   Σ sin(2π·fc·t)·(1.3 + sin(2π·fm·t))·3  for (fc, fm) = (3000, 12), (2710, 13), (2433, 14)
 *   + 3·sin(φ), φ' = 2π·(2200 + 100·sin(2π·13·t))
 * CircuitJS1 integrates φ step by step; here it is integrated exactly:
 *   φ(t) = 2π·2200·t + (100/13)·(1 - cos(2π·13·t)).
 */
export function antennaVoltage(t: number, s = 1): number {
  const am = (fc: number, fm: number) => sin(TWO_PI * fc * s * t) * (1.3 + sin(TWO_PI * fm * s * t)) * 3;
  const phi = TWO_PI * 2200 * s * t + (100 / 13) * (1 - cos(TWO_PI * 13 * s * t));
  return am(3000, 12) + am(2710, 13) + am(2433, 14) + 3 * sin(phi);
}

class AntennaModel extends VoltageSourceModel {
  private scale = 1;

  protected override applyProps(props: Props): void {
    super.applyProps(props);
    this.scale = Math.max(1e-9, num(props, "frequency", 3000)) / 3000;
  }

  protected emf(t: number, step: StepInfo): number {
    return step.kind === "ac" ? 0 : antennaVoltage(t, this.scale);
  }
}

export const antennaModel: ModelFactory = (el) => init(new AntennaModel(el), el);

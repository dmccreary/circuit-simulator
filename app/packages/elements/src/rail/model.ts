import type { ModelFactory, StepInfo } from "../api";
import { init } from "../shared/modelKit";
import { bool, num, str, type Props } from "../shared/props";
import { VoltageSourceModel } from "../shared/voltageSourceModel";
import { RAIL_WAVEFORMS, type RailWaveform } from "./descriptor";
import { waveEdges, waveValue, type WaveParams } from "./waveform";

/**
 * A voltage source with a VoltageElm waveform: from the single terminal to
 * ground (rail), or between two terminals (waveform-source).
 */
export class WaveSourceModel extends VoltageSourceModel {
  private p: WaveParams = {
    waveform: "dc",
    voltage: 5,
    offset: 0,
    frequency: 40,
    phaseRad: 0,
    duty: 0.5,
    maxFrequency: 4000,
    sweepTime: 0.5,
    logSweep: true,
  };

  protected override applyProps(props: Props): void {
    super.applyProps(props);
    const w = str(props, "waveform", "dc");
    this.p = {
      waveform: (RAIL_WAVEFORMS as readonly string[]).includes(w) ? (w as RailWaveform) : "dc",
      voltage: num(props, "voltage", 5),
      offset: num(props, "offset", 0),
      frequency: Math.max(0, num(props, "frequency", 40)),
      phaseRad: (num(props, "phase", 0) * Math.PI) / 180,
      duty: Math.min(1, Math.max(0, num(props, "dutyCycle", 50) / 100)),
      maxFrequency: num(props, "maxFrequency", 4000),
      sweepTime: num(props, "sweepTime", 0.5),
      logSweep: bool(props, "logSweep", true),
    };
  }

  protected emf(t: number, step: StepInfo): number {
    if (step.kind === "ac") return this.p.waveform === "dc" ? 0 : this.p.voltage;
    return waveValue(this.p, t);
  }

  breakpoints(t0: number, t1: number, out: number[]): void {
    waveEdges(this.p, t0, t1, out);
  }
}

export const railModel: ModelFactory = (el) => init(new WaveSourceModel(el), el);

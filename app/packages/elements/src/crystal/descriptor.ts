import type { ElementDescriptor } from "../api";
import { STRETCH, twoTerminals, VIP } from "../shared/descriptorKit";

/** CircuitJS1 CrystalElm defaults: Cs = 0.1 pF, L = 2.5 mH, so the series resonance is about 10.07 MHz. */
export const CRYSTAL_DEFAULTS = { seriesCapacitance: 0.1e-12, inductance: 2.5e-3, parallelCapacitance: 28.7e-12, resistance: 6.4 };

/** Series resonant frequency 1 / (2π·sqrt(L·Cs)). */
export const crystalFrequency = (l: number, cs: number): number => 1 / (2 * Math.PI * Math.sqrt(l * cs));

/** Motional inductance for a series resonance `f` with motional capacitance `cs`. */
export const crystalInductance = (f: number, cs: number): number => 1 / ((2 * Math.PI * f) ** 2 * cs);

/**
 * Quartz crystal, as CircuitJS1's CrystalElm (a composite): the holder
 * capacitance Cp in parallel with the motional arm Cs, L, R in series.
 * Specified like a real crystal, by its series resonant frequency; the
 * motional inductance follows from frequency and Cs.
 */
export const crystalDescriptor: ElementDescriptor = {
  type: "crystal",
  category: "passive",
  aliases: ["crystal", "quartz crystal", "xtal", "resonator"],
  labelPrefix: "Y",
  terminals: twoTerminals(),
  stretchable: STRETCH,
  props: [
    {
      key: "frequency",
      unit: "Hz",
      range: [1, 1e10],
      default: crystalFrequency(CRYSTAL_DEFAULTS.inductance, CRYSTAL_DEFAULTS.seriesCapacitance),
      showOnCanvas: true,
    },
    { key: "seriesCapacitance", unit: "F", range: [1e-18, 1e-6], default: CRYSTAL_DEFAULTS.seriesCapacitance },
    { key: "parallelCapacitance", unit: "F", range: [0, 1e-6], default: CRYSTAL_DEFAULTS.parallelCapacitance },
    { key: "resistance", unit: "ohm", range: [0, 1e6], default: CRYSTAL_DEFAULTS.resistance },
  ],
  readouts: [...VIP],
};

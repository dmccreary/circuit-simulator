// Analog parts added for Falstad compatibility (agent "analog2"): tunnel diode,
// varactor, polarized capacitor, spark gap, crystal, SCR, triac, diac, triode,
// unijunction transistor, antenna. Pure data; spread into MORE_DESCRIPTORS.
import type { ElementDescriptor } from "../api";
import { antennaDescriptor } from "../antenna/descriptor";
import { crystalDescriptor } from "../crystal/descriptor";
import { diacDescriptor } from "../diac/descriptor";
import { polarCapacitorDescriptor } from "../polar-capacitor/descriptor";
import { scrDescriptor } from "../scr/descriptor";
import { sparkGapDescriptor } from "../spark-gap/descriptor";
import { triacDescriptor } from "../triac/descriptor";
import { triodeDescriptor } from "../triode/descriptor";
import { tunnelDiodeDescriptor } from "../tunnel-diode/descriptor";
import { unijunctionDescriptor } from "../unijunction/descriptor";
import { varactorDescriptor } from "../varactor/descriptor";

export const ANALOG2_DESCRIPTORS: readonly ElementDescriptor[] = [
  tunnelDiodeDescriptor,
  varactorDescriptor,
  polarCapacitorDescriptor,
  sparkGapDescriptor,
  crystalDescriptor,
  scrDescriptor,
  triacDescriptor,
  diacDescriptor,
  triodeDescriptor,
  unijunctionDescriptor,
  antennaDescriptor,
];

// Parts added for the Falstad library (gyrator, tapped transformer, Darlington,
// OTA, Norton amp, split relay, three-phase motor, VCO, phase comparator,
// Schmitt triggers). Pure data; spread into MORE_DESCRIPTORS.
import type { ElementDescriptor } from "../api";
import { npnDarlingtonDescriptor, pnpDarlingtonDescriptor } from "../darlington/descriptor";
import { gyratorDescriptor } from "../gyrator/descriptor";
import { nortonAmpDescriptor } from "../norton-amp/descriptor";
import { otaDescriptor } from "../ota/descriptor";
import { phaseComparatorDescriptor } from "../phase-comparator/descriptor";
import { relayCoilDescriptor } from "../relay-coil/descriptor";
import { relayContactDescriptor } from "../relay-contact/descriptor";
import { invertingSchmittDescriptor, schmittDescriptor } from "../schmitt-trigger/descriptor";
import { tappedTransformerDescriptor } from "../tapped-transformer/descriptor";
import { threePhaseMotorDescriptor } from "../three-phase-motor/descriptor";
import { vcoDescriptor } from "../vco/descriptor";

export const ANALOGIC_DESCRIPTORS: readonly ElementDescriptor[] = [
  gyratorDescriptor,
  tappedTransformerDescriptor,
  npnDarlingtonDescriptor,
  pnpDarlingtonDescriptor,
  otaDescriptor,
  nortonAmpDescriptor,
  relayCoilDescriptor,
  relayContactDescriptor,
  threePhaseMotorDescriptor,
  vcoDescriptor,
  phaseComparatorDescriptor,
  schmittDescriptor,
  invertingSchmittDescriptor,
];

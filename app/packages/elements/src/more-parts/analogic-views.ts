// Main-thread registry for ./analogic-descriptors.ts. Must not import models.
import type { ElementView } from "../api";
import { npnDarlingtonView, pnpDarlingtonView } from "../darlington/view";
import { gyratorView } from "../gyrator/view";
import { nortonAmpView } from "../norton-amp/view";
import { otaView } from "../ota/view";
import { phaseComparatorView } from "../phase-comparator/view";
import { relayCoilView } from "../relay-coil/view";
import { relayContactView } from "../relay-contact/view";
import { invertingSchmittView, schmittView } from "../schmitt-trigger/view";
import { tappedTransformerView } from "../tapped-transformer/view";
import { threePhaseMotorView } from "../three-phase-motor/view";
import { vcoView } from "../vco/view";

export const ANALOGIC_VIEWS: Record<string, ElementView> = {
  gyrator: gyratorView,
  "tapped-transformer": tappedTransformerView,
  "npn-darlington": npnDarlingtonView,
  "pnp-darlington": pnpDarlingtonView,
  ota: otaView,
  "norton-amp": nortonAmpView,
  "relay-coil": relayCoilView,
  "relay-contact": relayContactView,
  "three-phase-motor": threePhaseMotorView,
  vco: vcoView,
  "phase-comparator": phaseComparatorView,
  "schmitt-trigger": schmittView,
  "inverting-schmitt-trigger": invertingSchmittView,
};

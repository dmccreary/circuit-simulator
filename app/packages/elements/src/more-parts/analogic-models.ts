// Worker-side registry for ./analogic-descriptors.ts. Must not import views.
import type { ModelFactory } from "../api";
import { npnDarlingtonModel, pnpDarlingtonModel } from "../darlington/model";
import { gyratorModel } from "../gyrator/model";
import { nortonAmpModel } from "../norton-amp/model";
import { otaModel } from "../ota/model";
import { phaseComparatorModel } from "../phase-comparator/model";
import { relayCoilModel } from "../relay-coil/model";
import { relayContactModel } from "../relay-contact/model";
import { invertingSchmittModel, schmittModel } from "../schmitt-trigger/model";
import { tappedTransformerModel } from "../tapped-transformer/model";
import { threePhaseMotorModel } from "../three-phase-motor/model";
import { vcoModel } from "../vco/model";

export const ANALOGIC_MODELS: Record<string, ModelFactory> = {
  gyrator: gyratorModel,
  "tapped-transformer": tappedTransformerModel,
  "npn-darlington": npnDarlingtonModel,
  "pnp-darlington": pnpDarlingtonModel,
  ota: otaModel,
  "norton-amp": nortonAmpModel,
  "relay-coil": relayCoilModel,
  "relay-contact": relayContactModel,
  "three-phase-motor": threePhaseMotorModel,
  vco: vcoModel,
  "phase-comparator": phaseComparatorModel,
  "schmitt-trigger": schmittModel,
  "inverting-schmitt-trigger": invertingSchmittModel,
};

// Worker-side registry for ./analog2-descriptors.ts. Must not import views.
import type { ModelFactory } from "../api";
import { antennaModel } from "../antenna/model";
import { crystalModel } from "../crystal/model";
import { diacModel } from "../diac/model";
import { polarCapacitorModel } from "../polar-capacitor/model";
import { scrModel } from "../scr/model";
import { sparkGapModel } from "../spark-gap/model";
import { triacModel } from "../triac/model";
import { triodeModel } from "../triode/model";
import { tunnelDiodeModel } from "../tunnel-diode/model";
import { unijunctionModel } from "../unijunction/model";
import { varactorModel } from "../varactor/model";

export const ANALOG2_MODELS: Record<string, ModelFactory> = {
  "tunnel-diode": tunnelDiodeModel,
  varactor: varactorModel,
  "polar-capacitor": polarCapacitorModel,
  "spark-gap": sparkGapModel,
  crystal: crystalModel,
  scr: scrModel,
  triac: triacModel,
  diac: diacModel,
  triode: triodeModel,
  unijunction: unijunctionModel,
  antenna: antennaModel,
};

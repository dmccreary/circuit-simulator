// Worker-side "advanced" group registry. Must not import views.
import type { ModelFactory } from "../api";
import { npnModel, pnpModel } from "../bjt/model";
import { cccsModel, ccvsModel, vccsModel, vcvsModel } from "../controlled-source/model";
import { nMosfetModel, pMosfetModel } from "../mosfet/model";
import { opAmpModel } from "../op-amp/model";
import { transformerModel } from "../transformer/model";
import { zenerDiodeModel } from "../zener-diode/model";

export const ADVANCED_MODELS: Record<string, ModelFactory> = {
  vcvs: vcvsModel,
  vccs: vccsModel,
  ccvs: ccvsModel,
  cccs: cccsModel,
  transformer: transformerModel,
  "zener-diode": zenerDiodeModel,
  "npn-transistor": npnModel,
  "pnp-transistor": pnpModel,
  "n-mosfet": nMosfetModel,
  "p-mosfet": pMosfetModel,
  "op-amp": opAmpModel,
};

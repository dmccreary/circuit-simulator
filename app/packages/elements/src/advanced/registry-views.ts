// Main-thread "advanced" group registry. Must not import models.
import type { ElementView } from "../api";
import { npnView, pnpView } from "../bjt/view";
import { cccsView, ccvsView, vccsView, vcvsView } from "../controlled-source/view";
import { nMosfetView, pMosfetView } from "../mosfet/view";
import { opAmpView } from "../op-amp/view";
import { transformerView } from "../transformer/view";
import { zenerDiodeView } from "../zener-diode/view";

export const ADVANCED_VIEWS: Record<string, ElementView> = {
  vcvs: vcvsView,
  vccs: vccsView,
  ccvs: ccvsView,
  cccs: cccsView,
  transformer: transformerView,
  "zener-diode": zenerDiodeView,
  "npn-transistor": npnView,
  "pnp-transistor": pnpView,
  "n-mosfet": nMosfetView,
  "p-mosfet": pMosfetView,
  "op-amp": opAmpView,
};

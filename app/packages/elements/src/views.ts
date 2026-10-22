// Main-thread registry. Must not import models.
import type { ElementView } from "./api";
import { acSourceView } from "./ac-source/view";
import { ammeterView } from "./ammeter/view";
import { batteryView } from "./battery/view";
import { capacitorView } from "./capacitor/view";
import { currentSourceView } from "./current-source/view";
import { dcSourceView } from "./dc-source/view";
import { diodeView } from "./diode/view";
import { groundView } from "./ground/view";
import { inductorView } from "./inductor/view";
import { lampView } from "./lamp/view";
import { ledView } from "./led/view";
import { potentiometerView } from "./potentiometer/view";
import { pushButtonView } from "./push-button/view";
import { resistorView } from "./resistor/view";
import { squareSourceView } from "./square-source/view";
import { switchView } from "./switch/view";
import { voltmeterView } from "./voltmeter/view";
import { npnView, pnpView } from "./bjt/view";
import { nMosfetView, pMosfetView } from "./mosfet/view";
import { opAmpView } from "./op-amp/view";
import { zenerDiodeView } from "./zener-diode/view";
import { cccsView, ccvsView, vccsView, vcvsView } from "./controlled-source/view";
import { transformerView } from "./transformer/view";
import { LOGIC_VIEWS } from "./logic/registry-views";

const VIEWS: Record<string, ElementView> = {
  ground: groundView,
  resistor: resistorView,
  capacitor: capacitorView,
  inductor: inductorView,
  battery: batteryView,
  "dc-source": dcSourceView,
  "ac-source": acSourceView,
  "square-source": squareSourceView,
  "current-source": currentSourceView,
  switch: switchView,
  "push-button": pushButtonView,
  potentiometer: potentiometerView,
  diode: diodeView,
  led: ledView,
  lamp: lampView,
  ammeter: ammeterView,
  voltmeter: voltmeterView,
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
  ...LOGIC_VIEWS,
};

export function getView(type: string): ElementView | undefined {
  return Object.prototype.hasOwnProperty.call(VIEWS, type) ? VIEWS[type] : undefined;
}

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
};

export function getView(type: string): ElementView | undefined {
  return Object.prototype.hasOwnProperty.call(VIEWS, type) ? VIEWS[type] : undefined;
}

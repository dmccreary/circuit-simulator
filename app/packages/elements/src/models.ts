// Worker-side registry. Must not import views.
import type { ModelFactory } from "./api";
import { acSourceModel } from "./ac-source/model";
import { ammeterModel } from "./ammeter/model";
import { batteryModel } from "./battery/model";
import { capacitorModel } from "./capacitor/model";
import { currentSourceModel } from "./current-source/model";
import { dcSourceModel } from "./dc-source/model";
import { diodeModel } from "./diode/model";
import { inductorModel } from "./inductor/model";
import { lampModel } from "./lamp/model";
import { ledModel } from "./led/model";
import { potentiometerModel } from "./potentiometer/model";
import { pushButtonModel } from "./push-button/model";
import { resistorModel } from "./resistor/model";
import { squareSourceModel } from "./square-source/model";
import { switchModel } from "./switch/model";
import { voltmeterModel } from "./voltmeter/model";

// "ground" has no model: it only names its net.
const FACTORIES: Record<string, ModelFactory> = {
  resistor: resistorModel,
  capacitor: capacitorModel,
  inductor: inductorModel,
  battery: batteryModel,
  "dc-source": dcSourceModel,
  "ac-source": acSourceModel,
  "square-source": squareSourceModel,
  "current-source": currentSourceModel,
  switch: switchModel,
  "push-button": pushButtonModel,
  potentiometer: potentiometerModel,
  diode: diodeModel,
  led: ledModel,
  lamp: lampModel,
  ammeter: ammeterModel,
  voltmeter: voltmeterModel,
};

export function getModelFactory(type: string): ModelFactory | undefined {
  return Object.prototype.hasOwnProperty.call(FACTORIES, type) ? FACTORIES[type] : undefined;
}

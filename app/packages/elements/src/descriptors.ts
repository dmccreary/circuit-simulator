import type { ElementDescriptor } from "./api";
import { acSourceDescriptor } from "./ac-source/descriptor";
import { ammeterDescriptor } from "./ammeter/descriptor";
import { batteryDescriptor } from "./battery/descriptor";
import { capacitorDescriptor } from "./capacitor/descriptor";
import { currentSourceDescriptor } from "./current-source/descriptor";
import { dcSourceDescriptor } from "./dc-source/descriptor";
import { diodeDescriptor } from "./diode/descriptor";
import { groundDescriptor } from "./ground/descriptor";
import { inductorDescriptor } from "./inductor/descriptor";
import { lampDescriptor } from "./lamp/descriptor";
import { ledDescriptor } from "./led/descriptor";
import { potentiometerDescriptor } from "./potentiometer/descriptor";
import { pushButtonDescriptor } from "./push-button/descriptor";
import { resistorDescriptor } from "./resistor/descriptor";
import { squareSourceDescriptor } from "./square-source/descriptor";
import { switchDescriptor } from "./switch/descriptor";
import { voltmeterDescriptor } from "./voltmeter/descriptor";

/** In palette order (CMP-02 Essentials order). */
export const DESCRIPTORS: readonly ElementDescriptor[] = [
  groundDescriptor,
  batteryDescriptor,
  dcSourceDescriptor,
  acSourceDescriptor,
  resistorDescriptor,
  potentiometerDescriptor,
  capacitorDescriptor,
  inductorDescriptor,
  switchDescriptor,
  pushButtonDescriptor,
  lampDescriptor,
  ledDescriptor,
  diodeDescriptor,
  voltmeterDescriptor,
  ammeterDescriptor,
  squareSourceDescriptor,
  currentSourceDescriptor,
];

const BY_TYPE = new Map(DESCRIPTORS.map((d) => [d.type, d]));

export function allDescriptors(): ElementDescriptor[] {
  return [...DESCRIPTORS];
}

export function getDescriptor(type: string): ElementDescriptor | undefined {
  return BY_TYPE.get(type);
}

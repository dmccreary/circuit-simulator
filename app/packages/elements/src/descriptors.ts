// ┌──────────────────────────────────────────────────────────────────────┐
// │ HOW TO REGISTER A PART                                               │
// │                                                                      │
// │ 1. Write <part>/descriptor.ts, model.ts and view.ts as usual.        │
// │ 2. Add it to ONE group, in all three of that group's registries:     │
// │      descriptor -> <group>/registry.ts        (e.g. MORE_DESCRIPTORS) │
// │      model      -> <group>/registry-models.ts (e.g. MORE_MODELS)      │
// │      view       -> <group>/registry-views.ts  (e.g. MORE_VIEWS)       │
// │    Groups: Essentials (the lists in this file, models.ts, views.ts;  │
// │    bundled), advanced/, logic/, more-parts/ (lazy chunks).           │
// │ 3. A NEW group: add its id to groups.ts, its descriptors to GROUPS   │
// │    below, and one loader line to LOADERS in models.ts and views.ts.  │
// │                                                                      │
// │ Descriptors are always loaded. getModelFactory()/getView() return a  │
// │ lazy group's parts only after ensureTypes() (models.ts / views.ts)   │
// │ has loaded the group. Tests preload everything (tests/setup).        │
// └──────────────────────────────────────────────────────────────────────┘

import type { ElementDescriptor } from "./api";
import type { PartGroup } from "./groups";
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
import { ADVANCED_DESCRIPTORS } from "./advanced/registry";
import { LOGIC_DESCRIPTORS } from "./logic/registry";
import { MORE_DESCRIPTORS } from "./more-parts/descriptors";
import { subcircuitDescriptor } from "./subcircuit/descriptor";

/** The Essentials group, in palette order (CMP-02). Bundled with the app. */
const ESSENTIAL_DESCRIPTORS: readonly ElementDescriptor[] = [
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

/** Every group's descriptors, in palette order. */
const GROUPS: readonly { id: PartGroup; descriptors: readonly ElementDescriptor[] }[] = [
  { id: "essentials", descriptors: ESSENTIAL_DESCRIPTORS },
  // Analog parts beyond Essentials.
  { id: "advanced", descriptors: ADVANCED_DESCRIPTORS },
  { id: "logic", descriptors: LOGIC_DESCRIPTORS },
  // Parts added for Falstad compatibility.
  { id: "more", descriptors: MORE_DESCRIPTORS },
];

/** In palette order (CMP-02 Essentials order). */
export const DESCRIPTORS: readonly ElementDescriptor[] = GROUPS.flatMap((g) => g.descriptors);

const BY_TYPE = new Map(DESCRIPTORS.map((d) => [d.type, d]));
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.descriptors.map((d) => [d.type, g.id] as const)));

export function allDescriptors(): ElementDescriptor[] {
  return [...DESCRIPTORS];
}

export function getDescriptor(type: string): ElementDescriptor | undefined {
  // Subcircuit instances are not a palette part (no group, no model): looked up here only.
  return BY_TYPE.get(type) ?? (type === subcircuitDescriptor.type ? subcircuitDescriptor : undefined);
}

/** The group a part type belongs to (undefined for unknown types). */
export function groupOf(type: string): PartGroup | undefined {
  return GROUP_OF.get(type);
}

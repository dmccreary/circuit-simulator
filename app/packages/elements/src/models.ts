// Worker-side registry. Must not import views.
// Essentials are bundled; other groups load on demand: call ensureTypes()
// before building an engine for a netlist (see descriptors.ts, "HOW TO
// REGISTER A PART").
import type { ModelFactory } from "./api";
import type { LazyGroup } from "./groups";
import { LazyRegistry } from "./lazy-registry";
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

// Essentials. "ground" has no model: it only names its net.
const ESSENTIAL_MODELS: Record<string, ModelFactory> = {
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

/** One code chunk per lazy group. */
const LOADERS: Record<LazyGroup, () => Promise<Record<string, ModelFactory>>> = {
  advanced: () => import("./advanced/registry-models").then((m) => m.ADVANCED_MODELS),
  logic: () => import("./logic/registry-models").then((m) => m.LOGIC_MODELS),
  more: () => import("./more-parts/models").then((m) => m.MORE_MODELS),
};

const registry = new LazyRegistry(ESSENTIAL_MODELS, LOADERS);

/** The model factory of a loaded part type (Essentials, or a group already ensured). */
export function getModelFactory(type: string): ModelFactory | undefined {
  return registry.get(type);
}

/** Load the model groups these part types need; resolves at once when all are loaded. */
export function ensureTypes(types: Iterable<string>): Promise<void> {
  return registry.ensure(types);
}

/** True when getModelFactory() already covers these types. */
export function typesLoaded(types: Iterable<string>): boolean {
  return registry.missing(types).length === 0;
}

/** Load every group (headless tools and tests). */
export function loadAllModels(): Promise<void> {
  return registry.loadAll();
}

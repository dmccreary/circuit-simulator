// Main-thread registry. Must not import models.
// Essentials are bundled; other groups load on demand: ensureTypes() before
// drawing a circuit, or let the renderer request missing views itself (see
// descriptors.ts, "HOW TO REGISTER A PART").
import type { ElementView } from "./api";
import type { LazyGroup } from "./groups";
import { LazyRegistry } from "./lazy-registry";
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

const ESSENTIAL_VIEWS: Record<string, ElementView> = {
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

/** One code chunk per lazy group. */
const LOADERS: Record<LazyGroup, () => Promise<Record<string, ElementView>>> = {
  advanced: () => import("./advanced/registry-views").then((m) => m.ADVANCED_VIEWS),
  logic: () => import("./logic/registry-views").then((m) => m.LOGIC_VIEWS),
  more: () => import("./more-parts/views").then((m) => m.MORE_VIEWS),
};

const registry = new LazyRegistry(ESSENTIAL_VIEWS, LOADERS);

/** The view of a loaded part type (Essentials, or a group already ensured). */
export function getView(type: string): ElementView | undefined {
  return registry.get(type);
}

/** Load the view groups these part types need; resolves at once when all are loaded. */
export function ensureTypes(types: Iterable<string>): Promise<void> {
  return registry.ensure(types);
}

/** True when getView() already covers these types. */
export function typesLoaded(types: Iterable<string>): boolean {
  return registry.missing(types).length === 0;
}

/** Load every view group (the palette prefetches them while idle; tests preload). */
export function loadAllViews(): Promise<void> {
  return registry.loadAll();
}

/** Called with the newly available types whenever a view group finishes loading. */
export function onViewsLoaded(fn: (types: string[]) => void): () => void {
  return registry.onLoaded(fn);
}

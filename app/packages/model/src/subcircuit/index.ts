// Subcircuit definitions and instances (EDT-34–38, circuit-model.md §6).
export * from "./layout";
export { makeSubcircuit, targets as probeTargetIds, SUBCIRCUIT_TYPE, type MakeOptions, type MakeResult } from "./make";
export {
  definitionOf,
  instancesOf,
  separateInstance,
  syncInstances,
  setSealed,
  bundleDefinition,
  insertBundle,
  instancePart,
  unusedDefinitions,
  type DefinitionBundle,
} from "./edits";
export { definitionAt, wireAt } from "../compile/subcircuit-probes";
export { UnionFind } from "../compile/nodes";

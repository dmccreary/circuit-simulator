// Pure data entry point: descriptors, geometry, resolver. No models or views.
export * from "./api";
export { allDescriptors, getDescriptor, groupOf } from "./descriptors";
export type { PartGroup } from "./groups";
export { localToDocument, localTerminals, terminalPositions } from "./geometry";
export { createPartResolver } from "./resolver";
export { isClosed } from "./shared/switchState";
export * from "./realism";

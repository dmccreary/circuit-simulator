// Part groups (circuit-model.md §5.4). Essentials are bundled with the app;
// every other group is a separate code chunk, loaded the first time a
// circuit or the palette needs one of its parts. A group is three registry
// modules, one per layer, so the worker never loads views and the main
// thread never loads models:
//
//   <group>/registry.ts         descriptors (pure data, always bundled)
//   <group>/registry-models.ts  model factories (worker; lazy)
//   <group>/registry-views.ts   views (main thread; lazy)
//
// See descriptors.ts for how to register a part or a new group.

export type PartGroup = "essentials" | "advanced" | "logic" | "more";

/** The groups loaded on demand, in palette order. */
export const LAZY_GROUPS = ["advanced", "logic", "more"] as const satisfies readonly PartGroup[];
export type LazyGroup = (typeof LAZY_GROUPS)[number];

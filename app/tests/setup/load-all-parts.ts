// Vitest setup: tests look parts up synchronously, so load every lazy part
// group (circuit-model.md §5.4) before any test runs.
import { loadAllModels } from "@cs/elements/models";
import { loadAllViews } from "@cs/elements/views";

await Promise.all([loadAllModels(), loadAllViews()]);

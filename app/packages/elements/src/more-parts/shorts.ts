// Compiler shorts (PartTraits.shorts) for multi-throw switches: the common
// terminal merges with the selected throw. Pure; used by the resolver.
import type { PropValue } from "@cs/model";
import { spdtSelected } from "../spdt-switch/descriptor";

export const MORE_SHORTS: Record<string, (props: Record<string, PropValue>) => [number, number][]> = {
  "spdt-switch": (props) => [[0, spdtSelected(props)]],
};

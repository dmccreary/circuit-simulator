import { useContext } from "react";
import { useStore } from "../store";
import { EmbedContext } from "./ui";
import type { EmbedState } from "./runtime";

const noStore = { get: () => undefined, subscribe: () => () => {} };
const selectPalette = (s: EmbedState | undefined) => s?.caps.palette;

/** Whether the capability set offers a part type in the palette (lessons, embeds). */
export function usePaletteFilter(): (type: string) => boolean {
  const rt = useContext(EmbedContext);
  const palette = useStore<EmbedState | undefined, EmbedState["caps"]["palette"] | undefined>(rt?.state ?? noStore, selectPalette);
  return (type) => !palette || palette === "all" || palette.includes(type);
}

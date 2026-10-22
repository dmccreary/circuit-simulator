import type { ElementDescriptor } from "../api";

/**
 * A subcircuit instance (EDT-34). Its terminals come from the part's own
 * `pinLayout` prop (see geometry.ts), not from this list, and it has no
 * engine model: the compiler flattens it into its definition's parts. It is
 * not in the palette groups; definitions are placed from My parts.
 */
export const subcircuitDescriptor: ElementDescriptor = {
  type: "subcircuit",
  category: "basic",
  aliases: ["subcircuit", "block", "chip"],
  labelPrefix: "U",
  terminals: [],
  props: [
    { key: "definition", unit: "", kind: "text", default: "" },
    { key: "pinLayout", unit: "", kind: "text", default: "" },
    { key: "name", unit: "", kind: "text", default: "" },
  ],
  readouts: [],
};

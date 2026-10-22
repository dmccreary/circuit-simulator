/** File name without the circuit extensions: "rc.circuit.json" -> "rc". */
export const baseName = (name: string): string => name.replace(/\.(circuit\.json|json|txt)$/i, "");

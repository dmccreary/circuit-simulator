import type { ElementDescriptor } from "../api";

/** Distance between the two terminal columns, grid units (144 px in CircuitJS1's example). */
export const MOTOR_LENGTH = 9;

/**
 * Three-phase induction motor after CircuitJS1's ThreePhaseMotorElm: the
 * stator windings U, V, W run from U1, V1, W1 (left column, two units apart)
 * to U2, V2, W2 (right column, in reverse order). Two rotor windings are
 * internal; the rotor speed is a mechanical state with inertia and friction.
 */
export const threePhaseMotorDescriptor: ElementDescriptor = {
  type: "three-phase-motor",
  category: "outputs",
  aliases: ["three-phase motor", "3-phase motor", "induction motor", "ac motor"],
  labelPrefix: "M",
  terminals: [
    { name: "U1", at: { x: 0, y: 0 } },
    { name: "U2", at: { x: MOTOR_LENGTH, y: 4 } },
    { name: "V1", at: { x: 0, y: 2 } },
    { name: "V2", at: { x: MOTOR_LENGTH, y: 2 } },
    { name: "W1", at: { x: 0, y: 4 } },
    { name: "W2", at: { x: MOTOR_LENGTH, y: 0 } },
  ],
  stretchable: { min: 4, default: MOTOR_LENGTH, terminals: [1, 3, 5] },
  props: [
    { key: "statorResistance", unit: "ohm", range: [1e-6, 1e3], default: 0.435 },
    { key: "rotorResistance", unit: "ohm", range: [1e-6, 1e3], default: 0.816 },
    { key: "statorInductance", unit: "H", range: [1e-6, 10], default: 0.0294 },
    { key: "rotorInductance", unit: "H", range: [1e-6, 10], default: 0.0297 },
    { key: "mutualInductance", unit: "H", range: [1e-6, 10], default: 0.0287 },
    { key: "friction", unit: "", range: [0, 100], default: 0.05 },
    { key: "inertia", unit: "", range: [1e-6, 1e3], default: 1 },
  ],
  readouts: [
    { key: "speed", unit: "" },
    { key: "torque", unit: "" },
    { key: "angle", unit: "" },
  ],
};

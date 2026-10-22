// Shared contract: messages between the main thread and the live simulation
// worker (design/simulation-engine.md §7). Frames travel as a transferred
// ArrayBuffer; see frame.ts for the packing.
// Changing this file affects every package; coordinate before editing.

import type { ChannelSpec, Diagnostic, ElementId, IdentityMap, Netlist, PropValue } from "@cs/model";

export const PROTOCOL_VERSION = 1;

export type RunState = "paused" | "running" | "stepping" | "stopped";

export interface PauseCondition {
  id: string;
  channel: string; // channel id
  op: "rises-above" | "falls-below";
  level: number;
}

export type Command =
  | { type: "load"; netlist: Netlist; channels: ChannelSpec[] }
  | { type: "replaceNetlist"; netlist: Netlist; identity: IdentityMap }
  | { type: "setParams"; changes: { element: ElementId; param: string; value: PropValue }[] }
  | { type: "setChannels"; channels: ChannelSpec[] }
  | { type: "run" }
  | { type: "pause" }
  | { type: "step" }
  | { type: "stepToEvent" }
  | { type: "reset"; start?: "zero" | "steady" }
  | { type: "setSpeed"; speed: number | "fit" } // simulated seconds per real second
  | { type: "setPauseConditions"; conditions: PauseCondition[] }
  | { type: "getStateAt"; t: number; requestId: number }
  | { type: "restartFrom"; t: number }
  | { type: "setVisibility"; visible: boolean }
  | { type: "ackFrame"; frame: number };

export interface TimeScales {
  fastest: number;
  dominant: number;
  sourcePeriods: number[];
  kind: "transient" | "periodic" | "static";
}

export interface SimEvent {
  t: number;
  kind: "paramChanged" | "topologyChanged" | "partFailed" | "pauseCondition" | "reset" | "error";
  element?: ElementId;
  detail?: string;
}

export type WorkerMessage =
  | { type: "frame"; buffer: ArrayBuffer } // decode with decodeFrame()
  | { type: "stateAt"; requestId: number; t: number; display: Float32Array | null }
  | { type: "diagnostics"; diagnostics: Omit<Diagnostic, "fixes">[] }
  | { type: "timeScales"; timeScales: TimeScales }
  | { type: "ready"; protocolVersion: number };

/** A decoded frame (design/simulation-engine.md §7.3). */
export interface Frame {
  frame: number;
  t0: number;
  t1: number;
  runState: RunState;
  effectiveSpeed: number;
  slowerThanRequested: boolean;
  channelIds: string[]; // order of the samples block
  times: Float64Array; // n sample times
  samples: Float64Array; // channel-major: samples[c * n + i]
  display: Float64Array; // layout: see displayStateSize() in @cs/model
  events: SimEvent[];
}

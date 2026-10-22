import type { Verb } from "./types";

const adl = (name: string): Verb => ({ id: `http://adlnet.gov/expapi/verbs/${name}`, display: { "en-US": name } });

/** The verbs of spec Section 21.2. */
export const VERBS = {
  launched: adl("launched"),
  initialized: adl("initialized"),
  interacted: adl("interacted"),
  experienced: adl("experienced"),
  answered: adl("answered"),
  attempted: adl("attempted"),
  passed: adl("passed"),
  failed: adl("failed"),
  progressed: adl("progressed"),
  completed: adl("completed"),
  terminated: adl("terminated"),
  suspended: adl("suspended"),
} as const;

export type VerbName = keyof typeof VERBS;

/** Activity types and extension keys used in definitions, results and context. */
export const ACTIVITY_TYPE = {
  simulation: "http://adlnet.gov/expapi/activities/simulation",
  interaction: "http://adlnet.gov/expapi/activities/interaction",
  lesson: "http://adlnet.gov/expapi/activities/lesson",
} as const;

export const EXT_BASE = "https://dmccreary.github.io/circuit-simulator/xapi/ext/";
export const ext = (name: string): string => EXT_BASE + name;

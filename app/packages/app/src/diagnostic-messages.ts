// English text for the structural (compiler) and numerical (engine) diagnostics.
import { addMessages } from "./messages";

addMessages({
  "diag.noGround": "No ground: node {node} is used as the 0 V reference. Add a ground symbol.",
  "diag.floatingSection": "{count} part(s) are not connected to the rest of the circuit.",
  "diag.danglingWireEnd": "A wire end is not connected to anything.",
  "diag.openTerminal": "Terminal {terminal} of this part is not connected.",
  "diag.sourcesInParallel": "Voltage sources are connected directly in parallel or in a loop.",
  "diag.currentSourceNoPath": "A current source has no path for its current.",
  "diag.shortAcrossSource": "A wire shorts out a voltage source.",
  "diag.overlappingParts": "Two parts are placed on top of each other.",
  "diag.ammeterInParallel": "An ammeter is connected in parallel; ammeters go in series.",
  "diag.voltmeterInSeries": "A voltmeter is connected in series; voltmeters go in parallel.",
  "fix.addGround": "Add ground",
  "engine.noConvergence": "Could not find a solution at t = {t} s.",
  "engine.singular.node": "Node {node} has no defined voltage (singular matrix).",
  "engine.singular.branch": "The current through {element} is not defined (singular matrix).",
  "engine.stepTooLarge": "The maximum time step {maxStep} s is larger than this circuit's limit of {limit} s.",
  "engine.digitalOscillation": "Logic gates with zero delay oscillate forever at t = {t} s. Give a gate a delay.",
});

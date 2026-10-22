// Hooks realism (Section 16) and the live views (Section 11) onto a controller
// with one call from its constructor: failure handling, repair commands, the
// warning badges and smoke, the power view and the lifelike view toggle.

import type { AppController } from "../controller";
import type { CommandRegistry } from "../commands/registry";
import { addMessages } from "../messages";
import { shellOf } from "../settings/install";
import { drawRealismOverlay } from "./badges";
import { REALISM_EN } from "./messages-en";
import { failedParts, repairParts } from "./repair";
import { RealismSession } from "./session";
import { getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import { getView } from "@cs/elements/views";
import type { ElementAccess } from "@cs/render";

const access: ElementAccess = { getView, getDescriptor, terminalPositions, localToDocument };

const sessions = new WeakMap<AppController, RealismSession>();

export function realismOf(c: AppController): RealismSession {
  const s = sessions.get(c);
  if (!s) throw new Error("Realism not installed on this controller");
  return s;
}

export function installRealism(c: AppController): RealismSession {
  addMessages(REALISM_EN);
  const say = (text: string) => {
    try {
      shellOf(c).announcer.say("failure", text);
    } catch {
      /* headless controller without the shell */
    }
  };
  const s = new RealismSession(c, say);
  sessions.set(c, s);
  c.diagnosticSources.add(() => s.diagnostics());
  c.bus.subscribe((f) => s.onFrame(f));
  c.edits.onPatches((b) => s.onPatches(b));
  let ticking = false;
  c.schematicHooks.add((r) => {
    r.liveMode = s.powerView ? "power" : "voltage";
    // Keep the overlay drawing while smoke is in the air (registered once a canvas exists).
    if (!ticking) {
      ticking = true;
      c.scheduler.addTicker(() => {
        if (!c.schematic || !s.activeSmokes().length) return false;
        c.scheduler.invalidate("overlay");
        return true;
      });
    }
    r.addOverlay((ctx, view, theme) =>
      drawRealismOverlay(ctx, {
        doc: c.edits.doc,
        access,
        live: r.live,
        view,
        theme,
        smokes: s.activeSmokes(),
        now: performance.now() / 1000,
        reducedMotion: r.animator.reducedMotion,
        idealHints: s.idealHints,
      }),
    );
  });
  registerRealismCommands(c.commands, s);
  return s;
}

function registerRealismCommands(r: CommandRegistry<AppController>, s: RealismSession): void {
  r.register({
    id: "edit.repair",
    label: { key: "cmd.repair" },
    capability: "edit.values",
    when: (c) => c.selectedParts().some((id) => failedParts(c.edits.doc).includes(id)),
    run: (c) => c.edits.edit({ key: "realism.repairEdit" }, (d) => void repairParts(d, c.selectedParts())),
  });
  r.register({
    id: "edit.repairAll",
    label: { key: "cmd.repairAll" },
    capability: "edit.values",
    when: (c) => failedParts(c.edits.doc).length > 0,
    run: (c) => c.edits.edit({ key: "realism.repairEdit" }, (d) => void repairParts(d)),
  });
  r.register({
    id: "view.powerView",
    label: { key: "cmd.powerView" },
    run: (c) => {
      s.powerView = !s.powerView;
      if (c.schematic) c.schematic.liveMode = s.powerView ? "power" : "voltage";
      c.scheduler.invalidate("live");
    },
  });
  r.register({
    id: "view.lifelike",
    label: { key: "cmd.lifelike" },
    run: (c) => {
      const settings = shellOf(c).settings;
      const now = settings.get().symbolStyle;
      settings.update({ symbolStyle: now === "lifelike" ? "ansi" : "lifelike" });
    },
  });
}

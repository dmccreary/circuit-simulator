// Hooks the shell features (settings, keyboard focus, announcer, editing commands,
// layout state, touch gestures) onto a controller with one call from its constructor.

import type { AppController } from "../controller";
import type { Store } from "../store";
import { Announcer, announceEvents } from "../a11y/announcer";
import { FocusSession } from "../a11y/focus-session";
import { registerAccessCommands } from "../a11y/commands";
import { registerEditCommands } from "../edit/commands";
import { createShellUi, type ShellUi } from "../layout/ui-store";
import { installTouchGestures } from "../tools/gestures";
import { browserStorage, type StorageLike } from "./learner";
import { SettingsSession } from "./session";

export interface ShellFeatures {
  settings: SettingsSession;
  ui: Store<ShellUi>;
  focus: FocusSession;
  announcer: Announcer;
  /** Session clipboard; the system clipboard gets a copy when the browser allows it. */
  clipboard: { text?: string; pastes: number };
}

const features = new WeakMap<AppController, ShellFeatures>();

export function installShellFeatures(c: AppController, opts: { storage?: StorageLike | null } = {}): ShellFeatures {
  const storage = opts.storage === null ? undefined : (opts.storage ?? browserStorage());
  const announcer = new Announcer();
  const settings = new SettingsSession(c, storage);
  const f: ShellFeatures = {
    settings,
    ui: createShellUi(settings.get().layout.view ?? "both"),
    focus: new FocusSession(c, announcer, () => settings.get().decimalSeparator),
    announcer,
    clipboard: { pastes: 0 },
  };
  features.set(c, f);
  registerEditCommands(c.commands);
  registerAccessCommands(c.commands);
  settings.applyKeymap();
  announceEvents(c, announcer);
  c.schematicHooks.add((_r, host) =>
    installTouchGestures(host, () => c.schematic?.view, {
      begin: () => c.tools.cancelGesture(),
      changed: () => c.scheduler.invalidateAll(),
    }),
  );
  return f;
}

export function shellOf(c: AppController): ShellFeatures {
  const f = features.get(c);
  if (!f) throw new Error("Shell features not installed on this controller");
  return f;
}

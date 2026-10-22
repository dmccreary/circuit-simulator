// Hooks the file layer onto a controller with one call from its constructor.

import type { AppController } from "../controller";
import { addMessages } from "../messages";
import { registerFileCommands } from "../commands/file-commands";
import { FILES_EN } from "./messages-en";
import { browserPlatform, type FilePlatform } from "./platform";
import { FileSession } from "./session";
import { installMyCircuits } from "../my-circuits/install";

const sessions = new WeakMap<AppController, FileSession>();

const unavailable = (): never => {
  throw new Error("No file access in this environment");
};
const nullPlatform: FilePlatform = {
  pickOpen: async () => null,
  save: async () => unavailable(),
  copyText: async () => false,
  fetchText: async () => unavailable(),
};

export function installFiles(c: AppController, platform?: FilePlatform): FileSession {
  addMessages(FILES_EN);
  const s = new FileSession(c, platform ?? (typeof window !== "undefined" && typeof document !== "undefined" ? browserPlatform() : nullPlatform));
  sessions.set(c, s);
  registerFileCommands(c.commands);
  installMyCircuits(c);
  return s;
}

export function filesOf(c: AppController): FileSession {
  const s = sessions.get(c);
  if (!s) throw new Error("File layer not installed on this controller");
  return s;
}

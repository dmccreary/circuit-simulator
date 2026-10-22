export { filesOf, installFiles } from "./install";
export { FileSession, EXAMPLES_BASE, type OpenOptions } from "./session";
export { parseStartupUrl, isExampleFileName, type StartupRequest } from "./startup-url";
// readCircuitText is not re-exported: it pulls in every file reader, so it is
// loaded on demand with import("./read-circuit") (design/index.md §2 goal 4).
export type { ReadResult } from "./read-circuit";
export type { FilePlatform } from "./platform";

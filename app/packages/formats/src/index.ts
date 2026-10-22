export { CURRENT_FORMAT_VERSION, FormatError, defaultSettings, emptyDocument, makeLane, makeProbe } from "./document";

export {
  parseCircuit,
  parseCircuitObject,
  serializeCircuit,
  serializeCircuitCompact,
  type ParseOptions,
  type SerializeOptions,
} from "./native/circuitFile";
export { FORMAT_NAME, UNKNOWN_PLACEHOLDER, type CircuitFileV1, type FilePart, type FileWire } from "./native/fileShape";
export { MIGRATIONS, runMigrations, type Migration, type RawFile } from "./native/migrations";

export {
  SHARE_LINK_WARN_LENGTH,
  decodeShareLink,
  encodeShareLink,
  isShareLinkTooLong,
  shareLinkFragment,
} from "./share/shareLink";
export { base64urlDecode, base64urlEncode } from "./share/base64url";

export {
  parseFalstadText,
  unescapeFalstad,
  type FalstadCircuit,
  type FalstadElement,
  type FalstadHint,
  type FalstadScope,
  type FalstadSettings,
  type FalstadSlider,
} from "./falstad/text";
export { importFalstad, mapFalstadCircuit, type FalstadImportReport } from "./falstad/mapper";
export { FALSTAD_PARTS, LABEL_PREFIX, PLACEHOLDER_TYPE, type PartMapping } from "./falstad/mapping";
export { decompressLz } from "./falstad/lz";
export { readFalstadLink, type FalstadLinkContent } from "./falstad/link";

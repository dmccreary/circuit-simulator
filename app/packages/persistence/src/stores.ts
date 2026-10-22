import type { StorageBackend, StoreKey, StoreName } from "./backend";

/** Typed view of one store. */
export class RecordStore<T> {
  constructor(
    private backend: StorageBackend,
    readonly name: StoreName,
  ) {}
  get(key: StoreKey): Promise<T | undefined> {
    return this.backend.get<T>(this.name, key);
  }
  put(key: StoreKey, value: T): Promise<void> {
    return this.backend.put(this.name, key, value);
  }
  delete(key: StoreKey): Promise<void> {
    return this.backend.delete(this.name, key);
  }
  entries(): Promise<Array<[StoreKey, T]>> {
    return this.backend.entries<T>(this.name);
  }
  async values(): Promise<T[]> {
    return (await this.entries()).map(([, v]) => v);
  }
}

/** A My circuits entry (FIL-08). `text` is the compact native file. */
export interface CircuitRecord {
  id: string;
  name: string;
  text: string;
  thumbnail?: Blob;
  changedAt: number;
}

/** The latest unsaved document of one tab (FIL-09, PRF-06). */
export interface RecoveryRecord {
  sessionId: string;
  /** Compact native file text. */
  text: string;
  title: string;
  fileName?: string;
  changedAt: number;
}

/** A reader's changes to an embedded circuit (PRF-06); keyed by page + embed id + original-circuit hash. */
export interface EmbedRecord {
  key: string;
  text: string;
  changedAt: number;
}

export interface SubcircuitRecord {
  id: string;
  name: string;
  definition: unknown;
  changedAt: number;
}

export interface LessonRecord {
  key: string;
  progress: unknown;
  changedAt: number;
}

export interface XapiQueueRecord {
  seq: number;
  statement: unknown;
  queuedAt: number;
}

export interface Persistence {
  backend: StorageBackend;
  circuits: RecordStore<CircuitRecord>;
  recovery: RecordStore<RecoveryRecord>;
  embeds: RecordStore<EmbedRecord>;
  subcircuits: RecordStore<SubcircuitRecord>;
  lessons: RecordStore<LessonRecord>;
  xapiQueue: RecordStore<XapiQueueRecord>;
}

export function createPersistence(backend: StorageBackend): Persistence {
  return {
    backend,
    circuits: new RecordStore(backend, "circuits"),
    recovery: new RecordStore(backend, "recovery"),
    embeds: new RecordStore(backend, "embeds"),
    subcircuits: new RecordStore(backend, "subcircuits"),
    lessons: new RecordStore(backend, "lessons"),
    xapiQueue: new RecordStore(backend, "xapiQueue"),
  };
}

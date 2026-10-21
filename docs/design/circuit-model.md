---
title: Circuit Model Design
description: Design of the circuit document, the edit and undo system, the netlist compiler, the element plug-in interface, and subcircuits.
---

# Circuit Model

The circuit model is the single source of truth for everything the student
builds. It lives on the main thread and contains no physics. The engine
never sees it directly: the **netlist compiler** translates it into the
netlist the engine solves.

## 1. Responsibilities

| Component | Responsibility |
|---|---|
| Circuit Document | Holds every saved thing: parts, wires, net labels, annotations, probes, chart lanes, sliders, scheduled actions, subcircuit definitions, circuit settings, title, and description (FIL-02) |
| Edit and Undo System | Turns gestures into transactions, keeps the undo and redo stacks, and broadcasts patches (EDT-31–33) |
| Netlist Compiler | Works out which points are connected, names the nodes, flattens subcircuits, checks the circuit, and produces the netlist (CAN-10–12, EDT-14, EDT-39) |
| Element Registry | Holds one plug-in per part type and loads rarely used ones on demand (Section 9) |

## 2. The circuit document

### 2.1 Entities

The document is a normalized collection of entities, each with a stable
**identifier** that never changes and is never shown to the student.
The student-visible **label** (`R1`, `V2`) is an ordinary property that
can be renamed. Keeping the two apart is what lets probes, sliders,
lesson checks, and the engine's state re-mapping survive renaming and
rewiring.

```ts
type Id = string;                 // short random identifier, unique in the document

interface CircuitDocument {
  formatVersion: number;
  meta: { title: string; description: string };      // FIL-10
  settings: CircuitSettings;                          // SET-02
  parts: Record<Id, Part>;
  wires: Record<Id, Wire>;
  netLabels: Record<Id, NetLabel>;                    // EDT-14; ground is a net label "GND"
  annotations: Record<Id, Annotation>;                // CAN-13
  probes: Record<Id, Probe>;                          // Section 13
  lanes: Lane[];                                      // CHT-01–04, in display order
  mathTraces: Record<Id, MathTrace>;                  // CHT-33
  sliders: Record<Id, Slider>;                        // CTL-05
  subcircuits: Record<Id, SubcircuitDefinition>;      // EDT-34–38
  analyses: AnalysisSettings;                         // ANL settings saved with the file
  view: { center: Point; zoom: number };              // FIL-02
}

interface Part {
  id: Id;
  type: string;                    // element type, such as "resistor" or "falstad:placeholder"
  label: string;                   // "R1"
  at: Point;                       // grid coordinates of the first terminal
  orientation: Orientation;        // rotation and flip (EDT-02, EDT-21)
  length?: number;                 // two-terminal parts, in grid units (EDT-07)
  props: Record<string, PropValue>;// values as numbers in SI units, plus enums and text
  labelOffset?: Point;             // student-dragged label (CAN-08)
  locked?: boolean;                // EMB `lock`, lessons
  savedState?: number[];           // capacitor voltage and the like, written on save
}

interface Wire {
  id: Id;
  points: Point[];                 // grid points; right-angled segments (EDT-09, EDT-10)
}
```

All geometry is in **integer grid units** (CAN-02). Pixels appear only in
the renderer. Falstad's 16-pixel grid maps to one unit on import (FIL-17).

### 2.2 Probes refer to places, not nodes

A node is not a stable thing: joining two wires merges two nodes, and
deleting a wire can split one. A probe therefore never stores a node
name. It stores the **place** the student clicked, and the compiler
resolves the place to a node every time it runs:

```ts
type ProbeTarget =
  | { kind: "point"; wire: Id; segment: number; t: number }    // a spot on a wire
  | { kind: "terminal"; part: Id; terminal: number }
  | { kind: "across"; part: Id }                               // voltage across a part
  | { kind: "between"; a: ProbeTarget; b: ProbeTarget }        // differential (red, black)
  | { kind: "through"; part: Id; terminal?: number; reversed: boolean } // PRB-06, PRB-07
  | { kind: "segment"; wire: Id; segment: number; reversed: boolean };

interface Probe {
  id: Id;
  name: string;                    // "V1", renameable (CHT-06)
  quantity: "voltage" | "current" | "power" | "logic";
  target: ProbeTarget;
  style: TraceStyle;               // color, width, dash, marker (CHT-15)
  lane: Id;
  flag: { offset: Point; showValue: boolean };   // PRB-09, PRB-10
  measurements: MeasurementSpec[]; // CHT-30
}
```

If the thing a target refers to is deleted, the probe is removed in the
same transaction and the student sees "Probe I2 removed with R3" with
Undo (PRB-12).

## 3. Edits, transactions, and undo

### 3.1 Options considered

| Option | Description | Verdict |
|---|---|---|
| A. Command objects | Each action is a class with `do()` and `undo()`. | Rejected. Every one of the hundreds of editing actions needs hand-written, hand-tested undo code, and bugs in it silently corrupt circuits. |
| B. Full snapshots | Save a copy of the whole document before each change. | Rejected. Simple and safe, but costly for large circuits with no undo limit (EDT-31), and it says nothing about *what* changed, which the netlist compiler, autosave, and xAPI reporter all need. |
| **C. Transactions of patches** | Every change is expressed as small patches ("set `parts.R7.props.resistance` to 2200"). The system records each patch with its inverse. | **Chosen.** |

Patches give undo for free (apply the inverses in reverse order), and the
same patch stream tells every other component exactly what changed:

- the **netlist compiler** decides whether a recompile is needed;
- the **persistence service** autosaves (PRF-06);
- the **xAPI reporter** describes the change (Section 21);
- the **lesson engine** re-evaluates only the checks the patch affects
  (LES-08).

The document is stored as plain immutable objects with structural
sharing, so a patch replaces only the objects along its path. React
components and renderers can detect changes by identity comparison.

### 3.2 Transactions and gestures

```ts
interface EditSystem {
  /** Start a gesture. Edits made until commit or cancel become one undo step (EDT-32). */
  begin(label: MessageRef, options?: { coalesceKey?: string }): Transaction;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  onPatches(listener: (p: PatchBatch) => void): Unsubscribe;
}

interface Transaction {
  update(recipe: (draft: CircuitDocument) => void): void;   // may be called many times
  commit(): void;
  cancel(): void;                                           // reverts every update
}
```

- **One gesture, one step.** A drag, a whole slider movement, or a paste
  is one transaction, however many updates it makes along the way. The
  patches inside an open transaction still flow to the engine as they
  happen, so the circuit responds continuously (CTL-06), but the undo
  stack records only the net change on commit.
- **Normalization runs inside the transaction.** Merging straight wire
  runs, removing zero-length wires (EDT-13), splitting a wire when a part
  is dropped onto it (EDT-06), and assigning the next free label
  (EDT-08) happen in a `normalize` pass before commit, so the undo step
  includes them.
- **Undo never touches time.** Undoing sends the inverse patches through
  the same path as any other edit. The engine applies them live (EDT-33);
  running, pausing, and the passage of time are never recorded.
- **Lesson snapshots.** Reset Step (LES-12) and Reset to original
  (EMB-04) restore a saved document snapshot as one transaction, which
  is itself undoable.

## 4. The netlist compiler

The compiler is a pure function from document to netlist, run whenever a
patch could change connectivity. It runs on the main thread because it
needs the document and the element views' terminal positions, and because
its diagnostics are shown immediately on the canvas.

```ts
interface NetlistCompiler {
  compile(doc: CircuitDocument, previous?: CompiledCircuit): CompiledCircuit;
  classify(patches: PatchBatch): "none" | "params" | "topology";
}

interface CompiledCircuit {
  netlist: Netlist;                  // what the engine receives
  nodes: NodeTable;                  // node id, display name, member points, digital or analog
  pointToNode: SpatialIndex<NodeId>; // for hover (CAN-11) and probe placement
  segments: SegmentTable;            // every drawn wire segment and part path, for dots
  channels: ChannelTable;            // probe targets resolved to engine channels
  identity: IdentityMap;             // old element ids to new, for state re-mapping (SIM-19)
  diagnostics: Diagnostic[];         // structural checks (EDT-39)
}
```

### 4.1 Stages

1. **Collect connection points.** Every terminal position, every wire
   end, and every wire bend becomes a point. A terminal or wire end that
   lands on the *middle* of another wire splits that wire there
   (EDT-11). Crossing wires without a shared point do **not** connect
   (CAN-10).
2. **Union the points into nodes** with a disjoint-set structure: points
   joined by a wire segment, points at the same grid location, and all
   net labels with the same name (EDT-14). Ground symbols are net labels
   named `GND` (CAN-12).
3. **Name the nodes.** Labelled nets take their label. Others get `N1`,
   `N2`, …, chosen so the **same node keeps the same name across edits**:
   each node's name is anchored to the oldest terminal it contains and is
   reused while that terminal stays on it. Names that jump around would
   make probe legends and lesson text confusing.
4. **Flatten subcircuits** ([§6](#6-subcircuits)).
5. **Classify each node** as analog, digital, or mixed (digital bridges,
   [Engine §4](simulation-engine.md#4-mixed-signal-the-digital-event-kernel)).
6. **Check the circuit** and produce diagnostics: no ground, floating
   sections, dangling ends, sources in parallel, an ideal current source
   with no path, shorts across sources, overlapping parts, ammeters in
   parallel, voltmeters in series (EDT-39), and Falstad placeholders
   (FIL-16). Most checks are graph searches on the node graph (for
   example, a loop of voltage sources and wires is a cycle that contains
   no other element).
7. **Resolve channels.** Every probe, meter, tool, lesson check, and pause
   condition target is resolved to an engine channel (a node pair, a
   branch, or a segment).
8. **Build the identity map** from the previous compilation, so the engine
   can carry state across (SIM-19).

### 4.2 Incremental work

Recompiling a 500-part circuit takes a few milliseconds, which is fast
enough to recompile on every topology change without optimization.
What matters more is *not* recompiling when nothing structural changed:
`classify` sends value changes (the common case while dragging a slider)
straight to the engine as `setParams` without running stages 1–8.

## 5. The element plug-in interface

Each part type in Section 9 is a folder in the `elements` package with
three parts, split so that the worker never loads drawing code and the
interface never loads physics code:

```text
elements/resistor/
  descriptor.ts   pure data, loaded everywhere
  model.ts        ElementModel, loaded only in workers
  view.ts         ElementView, loaded only on the main thread
  help.md         the help card (CMP-08)
```

### 5.1 The descriptor

```ts
interface ElementDescriptor {
  type: string;                      // "resistor"
  category: CategoryId;              // CMP-01
  essentials?: boolean;              // shown to new learners (CMP-02)
  aliases: string[];                 // quick-add search (EDT-03): "res", "ohm"
  hotkey?: string;                   // EDT-04
  labelPrefix: string;               // "R" (EDT-08)
  terminals: TerminalSpec[];         // names, positions in the symbol frame, first-terminal mark (CMP-05)
  stretchable?: { min: number; default: number };   // EDT-07
  props: PropSpec[];                 // see below
  models?: NamedModel[];             // CMP-07: "1N4148", "LM741", plus Custom
  ratings?: RatingSpec[];            // RLM-04
  readouts: ReadoutSpec[];           // what the hover card shows (CAN-17)
  falstad?: FalstadMapping;          // how to import and export (FIL-17)
}

interface PropSpec {
  key: string;                       // "resistance"
  unit: Unit;                        // "ohm"; drives parsing (EDT-26) and display
  range: [number, number];           // EDT-27, CMP-06
  default: PropValue;
  realisticDefault?: PropValue;      // used when Realistic parts is on (RLM-01)
  sliderable?: boolean;              // EDT-30
  standardSeries?: boolean;          // EDT-28
  showOnCanvas?: boolean;            // the main value next to the symbol (CAN-08)
}
```

The descriptor alone is enough to build the palette, the quick-add
search, the inspector's form, the Falstad importer, and the help card.
Most of the user interface for a new part therefore comes for free.

### 5.2 The model

The engine half, defined in [Simulation Engine §5](simulation-engine.md#5-the-element-model-interface).

### 5.3 The view

```ts
interface ElementView {
  /** Draw the symbol in its local frame. Called rarely; the result is cached. */
  drawSymbol(g: SymbolGraphics, part: Part, style: "ansi" | "iec" | "lifelike"): void;

  /** Draw state that changes while running: glow, charge marks, wiper, contacts. */
  drawLive?(g: LiveGraphics, part: Part, live: LiveReadouts): void;

  /** The paths current takes through the part, for the dots (ANI-01). */
  currentPaths(part: Part): Polyline[];

  /** Regions that react to clicks while running: a switch lever, a pot wiper (CTL-01–04). */
  controls?(part: Part): ControlRegion[];

  /** Hit area for selection and hover, slightly larger on touch (RSP-13). */
  hitShape(part: Part): Shape;

  /** Accessible description (ACC-07). */
  describe(part: Part, live?: LiveReadouts): MessageRef;
}
```

### 5.4 The registry and lazy loading

The **registry** maps type names to plug-ins. The Essentials parts are
bundled with the application. Every other category is a separate code
chunk loaded the first time a circuit or the palette needs it. A chapter
embed of an RC circuit therefore never downloads the 74181 arithmetic
logic unit (design goal 4).

## 6. Subcircuits

A **subcircuit definition** is a small circuit document of its own
(parts and wires) plus a list of **pins**, each tied to a node inside and
placed on the edge of the block symbol (EDT-34). Definitions are stored
in the document (`subcircuits`), so a file is self-contained, and are
also kept in browser storage for the **My parts** palette (EDT-35).

- **Instances** are ordinary parts of type `subcircuit` whose `props`
  name the definition.
- **Flattening.** The compiler copies each instance's contents into the
  netlist with hierarchical identifiers (`U1/R3`, `U1/N2`), connecting
  pins to the outer nodes. The engine never sees hierarchy.
- **Looking inside** (EDT-36) opens a nested view of the same definition.
  Probes placed inside store a path (`U1/…`) in their target, so their
  traces appear on the main chart.
- **Black boxes** (EDT-37) set a `sealed` flag on the definition. A sealed
  definition cannot be opened, and its hover card shows only pin values.
- **Built-in subcircuits** such as the 555 timer's inside view are
  definitions shipped with the element library and marked read-only.
- **Editing one copy or all** (EDT-38) is a document operation: "all"
  edits the definition; "this one" copies the definition under a new
  identifier and repoints the instance, both in one transaction.

## 7. Open questions

1. **Sharing subcircuits between circuits.** If a student edits a **My
   parts** definition, should circuits that already contain an older copy
   be offered the update? This design keeps each file's copy unchanged
   unless the student asks, which is safer but can leave several versions
   with one name.

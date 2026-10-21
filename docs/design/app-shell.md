---
title: Application Shell Design
description: Design of the simulator's user interface shell — stores, the command registry, responsive layout, tools and input handling, accessibility, and settings.
---

# Application Shell

The application shell is everything the student touches that is not a
canvas: the top bar, palette, inspector, chart panel chrome, menus,
dialogs, lesson panel, and status bar. It also hosts the **tool
controller**, which interprets pointer and keyboard input on the canvas.
It is built with React and React Aria Components
([Overview §5.2](index.md#52-why-react-with-react-aria)).

## 1. Stores

The shell reads from three stores, matching the three kinds of state in
the [overview](index.md#33-three-kinds-of-state):

| Store | Holds | Updated by | Read by React? |
|---|---|---|---|
| **Document store** | The current `CircuitDocument` | The [Edit System](circuit-model.md#3-edits-transactions-and-undo) only | Yes, with selectors so a component re-renders only when its slice changes |
| **App store** | Session state: selection, active tool, open panels, layout, chart cursors, run state, diagnostics, capabilities, learner settings | Shell actions; worker run-state messages | Yes |
| **Live values** | The latest frame | The Frame Bus, up to 60 times a second | Only through `useLiveValue(channel)`, which samples at most 10 times a second |

The third row is the performance rule from the overview in practice: a
hover card or the legend shows live numbers without the whole tree
re-rendering every frame.

## 2. The command registry

Every action the student can take — Run, Undo, Rotate, Add slider, Plot
voltage, Open, Fit — is registered once as a **command**:

```ts
interface Command {
  id: CommandId;                         // "sim.run", "edit.rotateCW", "probe.plotVoltage"
  label: MessageRef;
  icon?: IconName;
  defaultKeys?: KeyChord[];              // Section 8
  when?: (ctx: CommandContext) => boolean;      // visible and enabled
  capability?: Capability;               // required permission (§6)
  run(ctx: CommandContext, args?: unknown): void | Promise<void>;
}
```

| Option | Verdict |
|---|---|
| Each menu, toolbar, and shortcut wires its own handler | Rejected: shortcuts drift from menus, remapping (SET-06) has nothing to remap, and lessons cannot hide features in one place. |
| **A central command registry** | **Chosen.** |

The registry is then the one place that feeds:

- the **menus, toolbars, and context menus** (built from command lists);
- the **keyboard map**, remappable with conflict detection (SET-06),
  and the `?` shortcut list generated from it (Section 8);
- **permissions**: a command whose capability is not granted by the embed
  mode or lesson is hidden (§6);
- the **xAPI reporter**, which listens for executed commands it reports
  (Section 21);
- **lesson spotlights**, which can point at any command's control by id
  (LES-09).

## 3. Layout and responsiveness

### 3.1 Choosing a layout

The shell measures its own root element with a `ResizeObserver` and
derives a **width class** (extra wide, wide, medium, narrow) and a
**height class** (normal or short, below 520 px) from Section 5. It does
not use the device's screen size, so an iframe in a narrow column of a
chapter page gets the narrow layout even on a large monitor (Section 5,
first paragraph).

```ts
type Layout = {
  width: "xwide" | "wide" | "medium" | "narrow";
  height: "normal" | "short";
  pointer: "fine" | "coarse";            // from the pointer media query (RSP-13)
  arrangement: "side" | "stacked" | "single";
  narrowView?: "circuit" | "chart" | "both";   // the Narrow segmented switch
};
```

| Class | Arrangement | Palette | Inspector | Dialogs |
|---|---|---|---|---|
| Extra wide | Side by side, 60/40 | Labelled list | Docked below the canvas | Centered |
| Wide | Side by side | Icon rail with fly-outs | Docked | Centered |
| Medium | Stacked, 60/40 by height | Icon rail | Bottom sheet | Bottom sheet |
| Narrow | One view at a time, or Both | Full-height drawer | Bottom sheet | Full screen |
| Short (any width) | As above, compact top bar | — | Pop-over | — |

### 3.2 Keeping state across layouts

RSP-02 says changing class must lose nothing. The design guarantees it
structurally: **no component keeps important state of its own.** The
selection, zoom and pan, chart cursors, panel sizes, and run state all
live in the stores, so a panel can be unmounted in one layout and
remounted in another without losing anything. The canvases are not
recreated when the layout changes; they are moved and resized.

### 3.3 Panels and splitters

The main area is a small tree of split panes (schematic and chart, then
schematic and inspector). Splitters are React Aria focusable separators
with arrow-key movement (LAY-09), double-click reset to 60/40, minimum
sizes (LAY-10), and collapse to a labelled tab (LAY-12). Layout sizes are
remembered per browser (LAY-11).

## 4. The main panels

| Panel | Built from | Notes |
|---|---|---|
| Top bar | Commands | Run/Pause, Step, Reset, time readout (SIM-05), speed control with ratio in words (SIM-09), realism badge (RLM-03), lesson progress (LAY-01) |
| Palette | Element descriptors | Categories in CMP-01 order, Essentials-first (CMP-02), search over names and aliases (EDT-03), filtered by capabilities |
| Inspector | Element descriptors' `PropSpec` lists | One generated form for every part type; number fields use the `units` parser (EDT-26) and refuse out-of-range values with the range (EDT-27); several parts of one kind show "mixed" (EDT-29) |
| Chart panel chrome | Document lanes, chart model | Legend chips, lane titles, analysis tabs (ANL-01), measurement table; the plot areas are canvases ([Rendering §5](rendering.md#5-the-chart-renderer)) |
| Slider panel | Document sliders | CTL-05 |
| Status bar | App store | Run state with icon (SIM-06), warning count opening the diagnostics list, hover readout (LAY-06), slower-than-requested notice (PRF-09), recording indicator (XAP-03) |
| Lesson panel | Lesson engine | [Embedding §4](embedding-lessons-xapi.md#4-the-lesson-engine) |

## 5. Tools and input

### 5.1 The tool controller

Canvas input is handled by a **tool controller** that holds exactly one
active tool. Each tool is a small state machine:

```ts
interface Tool {
  id: ToolId;                 // "select", "place", "wire", "probe-v", "probe-i", "probe-p",
                              // "loop", "junction", "annotate", "pan"
  cursor(ctx: ToolContext): CursorShape;            // PRB-05: probe tip, clamp, thermometer
  onPointerDown?(e: CanvasPointer, ctx: ToolContext): void;
  onPointerMove?(e: CanvasPointer, ctx: ToolContext): void;
  onPointerUp?(e: CanvasPointer, ctx: ToolContext): void;
  onKey?(e: KeyChord, ctx: ToolContext): boolean;   // true if handled
  drawOverlay?(g: OverlayGraphics, ctx: ToolContext): void;   // previews (PRB-04, EDT-05, EDT-06)
  cancel?(ctx: ToolContext): void;                   // Esc
}
```

`ToolContext` gives a tool everything it may use and nothing else: hit
testing on the compiled circuit, the edit system (to open transactions),
the live values (for previews such as PRB-04), the app store, and the
view transform. Tools never touch the engine directly; everything they
change goes through document edits or control commands.

### 5.2 Input normalization

All input arrives as **Pointer Events**, so mouse, pen, and touch share
one path. A gesture layer in front of the tools recognizes:

- two-finger pan and pinch zoom (RSP-14);
- tap-and-hold, which shows the hover card for touch (RSP-15);
- middle-drag and Space-drag panning (CAN-04);
- wheel behavior that depends on embedding: zoom in the full app, scroll
  the page in an embed unless Ctrl is held or the simulator has been
  clicked (EMB-05).

### 5.3 Controls while running

Switches, push buttons, potentiometer wipers, and logic inputs are
operated in the Select tool by clicking their **control regions**
(provided by each element view). Operating a control is not a selection
(CTL-01). A push button holds while the pointer or Space is held
(CTL-02). Control changes go through the edit system like any other
value change, so the engine, undo, xAPI, and lesson checks all see them
in the same way.

### 5.4 Keyboard operation of the canvas

Keyboard-only editing (ACC-02–05) is a **focus cursor** on the canvas,
separate from the selection (ACC-03):

- Tab and Shift+Tab move between parts in reading order; Alt+arrow moves
  to the connected neighbor in that direction.
- `[` and `]` cycle the focused part's terminals; `W` starts a wire from
  the focused terminal; arrows then jump between candidate terminals and
  wire ends; Enter connects (ACC-04).
- Placing from the palette or quick-add with Enter drops the part at the
  view center, selected, ready to move with the arrows (ACC-05).

Every one of these is a command in the registry, so they are remappable
and appear in the shortcut list.

## 6. Capabilities

Embed modes (EMB-02), lesson permissions (LES-01), locked parts, and the
learner's own choices all reduce to one **capability set** held in the
app store:

```ts
interface Capabilities {
  edit: "full" | "values" | "none";      // edit, run, view modes
  palette: "all" | string[];             // allowed part types (CMP-02, LES-01)
  tools: ToolId[];
  panels: PanelId[];                     // embed `panels` parameter
  analyses: AnalysisKind[] | "none";
  chartVisible: boolean;
  lockedParts: Id[];                     // EMB `lock`, lessons
  hidden?: { readouts: boolean; traces: boolean; animation: boolean };   // LES-03 blind prediction
}
```

The capability set is the **only** thing the shell consults to decide
what to show. Commands, tools, palette entries, and panels each check it.
Embed parameters and lessons merely compute a capability set; neither
reaches into the interface directly.

## 7. Accessibility

Section 22 is a constraint on every component, but four pieces belong to
the shell:

| Piece | Design |
|---|---|
| **The accessible circuit tree** (ACC-06, ACC-07) | The canvas is paired with a visually hidden, structured DOM list of parts, wires, nodes, and probes, generated from the compiled circuit. Each item's accessible name comes from its element view's `describe`, with live values from the live-values store. The canvas focus cursor and this list are kept in step, so a screen reader announces the focused part. |
| **Announcer** (ACC-08) | One polite live region with a rate limit of one announcement per kind of event every two seconds; diagnostics, failures, lesson feedback, and check results all go through it. |
| **Chart alternatives** (ACC-09) | A data table view and generated text descriptions of each trace, built from the History Store and the measurement library. |
| **Sonification** (ACC-10) | A Web Audio oscillator whose pitch follows the selected trace, sharing the audio path with speakers (ANI-20). |

React Aria provides keyboard behavior, focus management, and ARIA roles
for menus, dialogs, tabs, sliders, tables, and the color and number
fields, which covers most of the remaining WCAG 2.2 AA work (ACC-01).

## 8. Settings

Settings resolve in layers, each overriding the one before:

```text
built-in defaults  <  learner settings (browser)  <  embed parameters  <  lesson
```

- **Learner settings** (SET-01) are a small, versioned JSON object in
  `localStorage`, read synchronously at startup so the first frame
  already has the right theme and symbol style. They are never written
  into circuit files (SET-04).
- **Circuit settings** (SET-02) live in the document and are undoable.
- **Embed parameters** may override a learner setting for one embed only
  (SET-04) and are never saved back.
- **Interface scale** (SET-03) sets the root font size, which every panel
  size is expressed in, and multiplies the canvases' device-pixel ratio
  so the schematic and chart stay sharp.

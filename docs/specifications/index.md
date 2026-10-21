---
title: Circuit Simulator Specification
description: A detailed functional specification for a new browser-based educational circuit simulator, with an animated schematic, a live time-series chart, probes, analyses, lesson mode, and textbook embedding.
---

# Circuit Simulator Specification

| | |
|---|---|
| Status | Draft 1 for author review |
| Date | 2026-10-21 |
| Audience of this document | The book author, designers, developers, testers, and lesson writers |
| Primary learners | High school physics students and first-year college circuits students |

This document specifies, in detail, **what** a new browser-based circuit
simulator must do and how it must behave for the person using it. It does
not say how the program should be written. The only technical assumptions
are that it runs in a modern web browser and that the person using it has
a mouse and a keyboard. Every screen must also be responsive, adapting to
any window size from a wide desktop monitor down to a phone.

The specification draws on a feature-by-feature study of Paul Falstad's
circuit simulator and a survey of other educational and professional
simulators. Those sources are listed in [Sources](#sources) at the end.
The book's [List of Circuits](../list-of-circuits.md) is the library of
example circuits the new simulator must be able to open.

## 1. How to Read This Specification

### 1.1 Requirement language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY**
are used as defined in RFC 2119:

- **MUST** and **MUST NOT** are absolute requirements. A build that fails
  one is not complete.
- **SHOULD** and **SHOULD NOT** are strong recommendations. Leaving one out
  needs a written reason.
- **MAY** marks an optional feature that is welcome but not required for a
  first release.

### 1.2 Requirement identifiers

Every requirement has a short identifier, such as [PRB-04](#131-probe-kinds), so testers,
lesson writers, and the user stories in [Section 25](#25-user-stories)
can refer to it. The prefix names the section:

| Prefix | Section |
|---|---|
| PRN | Design principles |
| LAY | Screen layout |
| RSP | Responsive behavior |
| CAN | Schematic canvas |
| EDT | Building and editing circuits |
| CMP | Component library |
| SIM | Simulation behavior |
| ANI | Current animation and visual feedback |
| PRB | Probes and measurement tools |
| CHT | The time-series chart |
| ANL | Analysis views |
| CTL | Interactive controls while running |
| RLM | Realism, ratings, and failures |
| DIG | Digital logic and mixed signal |
| FIL | Files, sharing, and Falstad compatibility |
| EMB | Embedding in textbook pages |
| LES | Guided lesson mode |
| XAP | xAPI learning events |
| ACC | Accessibility |
| PRF | Performance and reliability |
| SET | Settings |

### 1.3 Decisions already made

The book author settled these scope questions before this draft was
written. The rest of the document follows them:

| Question | Decision |
|---|---|
| Primary learners | High school physics and first-year college circuits |
| Analyses beyond the live chart | DC operating point table, frequency response (Bode plot), parameter sweep, and spectrum (FFT) |
| Digital logic | Full analog and digital library, so mixed-signal circuits work |
| Textbook integration | Open Falstad circuit files, embed in textbook pages, guided lesson mode, and xAPI learning events |
| Current animation convention | Conventional current by default, with electron flow as an option |
| Ratings and failures | Ideal parts by default; parts can fail only when a "realistic ratings" option is on |
| Saving and sharing | No accounts: files, shareable links, and browser storage only |
| Screen sizes | Every user interface surface must be responsive |

## 2. Purpose and Scope

### 2.1 Purpose

The simulator exists to help students **see** what happens inside a
circuit. Textbook diagrams are frozen. Lab equipment shows one number at a
time. A good simulator shows every wire's voltage, every branch's current,
and how both change over time, all at once and in step with each other.

The core experience has three parts that are always visible together:

1. **An animated schematic** on the left. Moving dots show current flowing
   in every wire and through every component, and the color of each wire
   shows its voltage.
2. **A live time-series chart** on the right. Time runs along the x-axis,
   and the chart plots the voltages and currents the student has chosen to
   watch.
3. **Probe tools** that connect the two. The student drops a voltage probe
   on a wire or a current probe on a component, and a matching trace
   appears on the chart at once, in the same color as the probe's flag.

### 2.2 Goals

- **G1 — Insight first.** Every feature is judged by whether it helps a
  student build a correct mental model of how circuits behave.
- **G2 — Two clicks to any waveform.** Any voltage or current in the
  circuit can be on the chart within two clicks of deciding to look.
- **G3 — Predict, observe, explain.** The tool supports the learning cycle
  of making a prediction, testing it, and explaining the difference.
- **G4 — Faithful enough.** Results match textbook theory closely for the
  circuits in the course (see [Section 26](#26-acceptance-test-circuits)),
  while staying fast enough to animate smoothly.
- **G5 — Works in the textbook.** Simulations embed in MkDocs pages, open
  the existing Falstad example library, run guided lessons, and report
  learning events.
- **G6 — Works everywhere.** Any modern browser, any window size, no
  installation, no account.

### 2.3 Misconceptions the simulator must address

Physics education research has catalogued the wrong ideas students most
often hold about circuits. The simulator's features are chosen to confront
each one with something the student can see. Research also warns that
animation alone does not fix misconceptions: in one controlled study,
students learned equally well with and without the moving-electron
display ([Keller and others, 2006](#sources)). What helps is animation
combined with a prediction the student has committed to, which is why
lesson mode hides the animation until a prediction is made
([LES-03](#202-step-types)).

| Misconception | What the simulator shows instead | Main features |
|---|---|---|
| Current is used up by each bulb | Probes before and after every part read the same current; dots move at one speed all around a series loop; a separate power view shows what *is* used: energy | [PRB-01](#131-probe-kinds), [ANI-03](#111-current-dots), [ANI-16](#113-power-heat-light-and-motion), story [25.1](#251-current-is-not-used-up) |
| A battery always delivers the same current | The battery's current trace jumps when a parallel load is added while its voltage stays put | [CHT-17](#124-trace-display), story [25.2](#252-a-battery-is-not-a-current-source) |
| Sequential reasoning: a change only affects parts "downstream" | Every part's current starts and changes in the same instant; all meters and traces move together | [ANI-02](#111-current-dots), [PRN-02](#3-design-principles) |
| Local reasoning: current always splits equally at a junction | Branch dot speeds and the Junction tool show unequal splits that depend on the whole circuit | [ANI-05](#111-current-dots), [PRB-18](#134-tools-for-seeing-the-circuit-laws) |
| Voltage is a property of current, or exists only where current flows | Wire colors show potential everywhere, including across an open switch carrying no current; voltage probes always measure between two points | [ANI-12](#112-voltage-color), [PRB-01](#131-probe-kinds) |
| "The voltage at a point" without a reference | Ground is marked; differential probes are drawn with red and black leads | [CAN-12](#62-how-parts-and-wires-look), [PRB-01](#131-probe-kinds) |
| Brightness depends on current alone | Brightness follows power; power probes and the Power view | [ANI-17](#113-power-heat-light-and-motion), [ANI-16](#113-power-heat-light-and-motion) |
| Current flows through a capacitor's insulator | Charge builds up on the plates while the current trace decays | [ANI-18](#113-power-heat-light-and-motion), story [25.3](#253-watching-a-capacitor-charge) |
| Misreading graphs: confusing slope with height | Cursor readouts give both the value and the slope; derivative math traces | [CHT-26](#126-measurements), [CHT-33](#127-math-traces) |
| Meters can go anywhere | Realistic meters that load the circuit, warnings for wrongly placed meters, a fuse that blows | [PRB-22](#135-instruments-that-behave-like-real-meters), [PRB-23](#135-instruments-that-behave-like-real-meters), [PRB-24](#135-instruments-that-behave-like-real-meters), [EDT-39](#77-checking-the-circuit) |

### 2.4 What changes from Falstad's simulator

Falstad's simulator is the starting point and the source of the example
library. This specification keeps its strengths (it is always live, it
animates current, it colors wires by voltage) and changes the things that
get in a student's way. The left column describes Falstad's simulator as
of October 2026 ([Sources](#sources)).

| Falstad's simulator today | This specification |
|---|---|
| Charts sit in a strip below the circuit, 20% of its height by default | Circuit on the left, chart on the right, 60/40, adjustable, responsive ([Section 4](#4-screen-layout)) |
| Each chart keeps one screen of history, as per-pixel minimum and maximum; changing the time scale erases it | Full-resolution history that can be scrolled, zoomed, and scrubbed, with the schematic replaying the past ([CHT-22](#125-time-navigation-and-history)) |
| Charting a voltage between two nodes takes about six actions, and the meter used loads the circuit with 10 MΩ | Two actions, with an ideal probe ([PRB-01](#131-probe-kinds)) |
| Charts have no legend; colors are fixed; readouts and the trigger use only the first plot | A legend matched to probe flags, chosen colors, and measurements on every trace ([CHT-05](#121-lanes-and-legend), [CHT-30](#126-measurements)) |
| Signs follow the direction each part was drawn, shown only while highlighted | Every probe shows its sign convention; every part marks its reference terminal ([PRB-06](#131-probe-kinds), [CMP-05](#91-how-the-library-is-organized)) |
| Errors are one line of text, such as "Singular matrix!", often with no part highlighted | A plain-language explanation, the parts highlighted, a suggested fix, and automatic resume ([SIM-14](#104-when-a-circuit-cannot-be-solved)) |
| Mistyped values are silently ignored; unit symbols are rejected | Units accepted, mistakes explained ([EDT-26](#74-editing-values)) |
| Undo resets the simulation | Undo applies to the running circuit ([EDT-33](#75-undo-and-history)) |
| No visible grid; no voltage color legend | Grid and legend ([CAN-02](#61-space-grid-and-view), [ANI-14](#112-voltage-color)) |
| Transient analysis and a DC operating point only | Adds DC tables, frequency response, sweeps, and a windowed spectrum ([Section 14](#14-analysis-views)) |
| Described by its users as unusable on phones and tablets; no keyboard navigation of the circuit | Responsive at every size, keyboard-operable, screen-reader friendly ([Section 5](#5-responsive-behavior), [Section 22](#22-accessibility)) |
| Speed control has no units; the real-time ratio is hidden below 0.1× | Speed stated in words, with Fit to circuit ([SIM-09](#102-time-step-and-speed)) |

### 2.5 Out of scope

- How the program is written: languages, frameworks, numerical methods,
  and internal data structures.
- Printed-circuit-board layout, part ordering, and bills of materials.
- Sign-off-grade accuracy for professional design. The simulator is a
  learning tool, not a replacement for SPICE in industry.
- Electromagnetic field simulation, antennas, and radio-frequency layout
  effects beyond the transmission-line elements listed in
  [Section 9](#9-component-library).
- User accounts, cloud storage, and class rosters.
- Microcontroller code emulation (for example, running Arduino programs).
  This is a possible future extension; see [Section 27](#27-open-questions-and-future-work).

## 3. Design Principles

- **PRN-01 — Show, then tell.** The simulator MUST make behavior visible
  (motion, color, brightness, waveforms) before asking the student to read
  numbers. Numbers MUST always be one hover or one click away.
- **PRN-02 — Everything is live.** While the simulation runs, every edit
  (changing a value, flipping a switch, adding a probe, even adding or
  deleting a part) MUST take effect without a separate "run" step.
- **PRN-03 — One color per signal.** A probe, its flag on the schematic,
  its trace on the chart, its row in the legend, and its readouts MUST all
  share one color, so the eye can match them instantly.
- **PRN-04 — Time is shared.** The schematic and the chart MUST always
  describe the same moment. When the student pauses and scrubs back in
  time on the chart, the schematic MUST show the circuit as it was at that
  moment.
- **PRN-05 — Forgiving editing.** Every action MUST be undoable. The
  simulator MUST never discard work without asking.
- **PRN-06 — Helpful errors.** When a circuit cannot be simulated (for
  example, two ideal voltage sources in parallel), the simulator MUST say
  why in plain language, highlight the parts involved, and suggest a fix.
- **PRN-07 — Ideal by default, real on request.** Parts behave ideally
  unless the student turns on realistic ratings. The student MUST always be
  able to tell which mode is active.
- **PRN-08 — Progressive disclosure.** A beginner sees a short palette of
  common parts and simple controls. Advanced parts, options, and analyses
  are one step away and never in the way.
- **PRN-09 — Same circuit, same result.** Running the same circuit with the
  same inputs MUST give the same results every time (including random
  noise sources, which use a stored seed).
- **PRN-10 — No dead ends on any screen.** At every window size every
  feature MUST remain reachable (see [Section 5](#5-responsive-behavior)).
- **PRN-11 — No artificial limits.** There MUST be no cap on the number of
  parts in a circuit, the number of circuits a student keeps, or the
  features available. (Several commercial tools cap free circuits at five
  to 25 parts.)
- **PRN-12 — Open and durable.** Circuits MUST be saved in an open,
  documented format, and the simulator MUST keep working offline, so
  students' work survives even if a hosting service closes. (Multisim
  Live closed on 2026-09-15 without guaranteeing access to saved designs.)
- **PRN-13 — Prediction before animation.** The animation is a means, not
  an end. The design MUST make it easy to hide the answer and ask for a
  prediction first ([Section 2.3](#23-misconceptions-the-simulator-must-address)).

## 4. Screen Layout

### 4.1 Regions

The main window has seven regions. The wireframe shows the wide layout:

```text
+--------------------------------------------------------------------------+
| [=] File Edit View Analyze Help   RC Charging     [>Run] [|>Step] [Reset] |  top bar
|                                     t = 3.218 ms   Speed [----o-----]     |
+------+-------------------------------------+-----------------------------+
| Parts|                                     | Probes: (V1) (V2) (I1) [+]  |
| -----|                                     +-----------------------------+
| Basic|        S C H E M A T I C            |  V   V1 ___/~~~~~~~~        |
|  R   |                                     |      V2 ~~~\_______         |
|  C   |    animated dots in the wires,      +-----------------------------+
|  L   |    wire colors show voltage,        |  A   I1 \________           |
|  Batt|    probe flags in probe colors      +-----------------------------+
|  ... |                                     |  0    1 ms   2 ms   3 ms  t  |
|      +-------------------------------------+  [roll|sweep|trigger] 5 ms   |
|      | Inspector: R1  Resistance [1 k]  ...|  cursors  measurements      |
+------+-------------------------------------+-----------------------------+
| Status: Running · 1 warning · hover: wire N3  2.84 V  1.16 mA              |  status bar
+--------------------------------------------------------------------------+
```

- **LAY-01 — Top bar.** The top bar MUST contain the main menu, the circuit
  title (click to rename), the run controls (Run/Pause, Step, Reset), the
  simulation-time readout, and the simulation speed control. In lesson
  mode it MUST also show the lesson title and progress.
- **LAY-02 — Component palette.** A palette on the left MUST list
  components by category with a search box at the top (see
  [Section 7.1](#71-placing-components)).
- **LAY-03 — Schematic canvas.** The canvas MUST occupy the left part of
  the main area and show the circuit (see [Section 6](#6-the-schematic-canvas)).
- **LAY-04 — Chart panel.** The chart panel MUST occupy the right part of
  the main area and show the probe legend, the chart lanes, and the time
  controls (see [Section 12](#12-the-time-series-chart)).
- **LAY-05 — Inspector.** The inspector shows the properties of the
  selected item. It MUST dock along the bottom of the schematic region and
  MUST be collapsible to a one-line summary.
- **LAY-06 — Status bar.** A status bar along the bottom MUST show the
  simulation state (Running, Paused, Stopped with error), a count of
  warnings (click to list them), and a live hover readout for whatever is
  under the pointer.
- **LAY-07 — Lesson panel.** In lesson mode, a lesson panel MUST appear on
  the left in place of (or above) the palette, holding the current step's
  instructions, prediction inputs, hints, and the Next button (see
  [Section 20](#20-guided-lesson-mode)).

### 4.2 Proportions and splitters

- **LAY-08** — On first open the schematic region MUST take 60% and the
  chart panel 40% of the main area's width.
- **LAY-09** — A splitter between the schematic and the chart MUST be
  draggable. Double-clicking the splitter MUST reset it to 60/40.
  Keyboard users MUST be able to focus the splitter and move it with the
  arrow keys.
- **LAY-10** — The schematic region MUST NOT shrink below 360 px wide and
  the chart panel MUST NOT shrink below 320 px wide while side by side. If
  the window cannot fit both, the responsive rules in
  [Section 5](#5-responsive-behavior) apply.
- **LAY-11** — The student MUST be able to collapse the chart panel
  (circuit only) or maximize it (chart only) from the View menu and with
  keyboard shortcuts. The last layout MUST be remembered per browser.
- **LAY-12** — The palette, inspector, and chart panel MUST each have a
  visible collapse control. Collapsed regions leave a thin labelled tab
  that restores them.

## 5. Responsive Behavior

Every user interface surface MUST be responsive. This covers the main
window, menus, dialogs, the inspector, the chart, the analysis views, the
lesson panel, the multimeter, and embedded mode. Layout decisions MUST be
based on the size of the simulator's own viewport (the iframe when
embedded), not the size of the device's screen.

### 5.1 Width classes

| Class | Viewport width | Arrangement |
|---|---|---|
| Extra wide | 1440 px and up | Labelled palette (about 220 px), schematic and chart side by side |
| Wide | 1024–1439 px | Palette shrinks to an icon rail (56 px) with fly-out categories; schematic and chart side by side |
| Medium | 720–1023 px | Schematic on top, chart below, with a horizontal splitter (default 60/40 by height); icon-rail palette; inspector opens as a bottom sheet |
| Narrow | Below 720 px | One main view at a time, chosen with a segmented switch: **Circuit**, **Chart**, or **Both** (circuit above a compact chart of at least 35% of the height); palette opens as a full-height drawer; top bar condenses to Run/Pause, sim time, and an overflow menu |

- **RSP-01** — The simulator MUST pick the width class automatically and
  re-evaluate it whenever the viewport is resized or rotated.
- **RSP-02** — Changing width class MUST NOT lose any state: the circuit,
  selection, probes, zoom, pan, chart history, and run state all persist.
- **RSP-03** — The page MUST never scroll horizontally. No control may be
  cut off at any width from 320 px up.
- **RSP-04** — In the Medium and Narrow classes, dialogs MUST open as
  full-width bottom sheets or full-screen panels with a visible Close
  button, never as a box wider than the viewport.
- **RSP-05** — Menus MUST stay inside the viewport. A menu that would run
  off the edge MUST open in the other direction or become a scrollable
  sheet.
- **RSP-06** — Wide tables (the DC operating point table, the measurement
  table, the warning list) MUST either scroll inside their own container
  with a sticky header row or reflow into one card per row below 720 px.
- **RSP-07** — Text MUST remain at least 12 px at all widths. The student
  MUST be able to scale the whole interface from 80% to 200% (see
  [SET-03](#24-settings)) without breaking the layout.

### 5.2 Height classes

- **RSP-08** — When the viewport is shorter than 520 px (common for
  embedded simulations), the top bar MUST collapse into a single compact
  row, the inspector MUST become a pop-over, and chart lanes MUST compress
  to a minimum of 64 px each.
- **RSP-09** — If the chart has more lanes than fit, the chart panel MUST
  scroll vertically inside itself while keeping the time axis visible.

### 5.3 The canvas and chart at small sizes

- **RSP-10** — When the canvas size changes, the view MUST keep the same
  point of the circuit at the center and the same zoom, unless the circuit
  no longer fits and the student has not zoomed manually. In that case the
  view MUST zoom to fit.
- **RSP-11** — The chart's tick labels, legend, and measurement readouts
  MUST adapt to the panel width: fewer ticks, a legend of compact color
  chips (tap or hover for the full name), and measurements that wrap.
- **RSP-12** — Component labels and value text on the schematic MUST
  remain legible at any zoom level where they are shown. Below a readable
  size they MUST hide and reappear on hover rather than overlap.

### 5.4 Touch and pointer types

The primary inputs are a mouse and a keyboard. Responsive layouts will
also be used on tablets and phones in class, so:

- **RSP-13** — When the device reports a coarse pointer, every tap target
  MUST be at least 44 × 44 px, and terminals MUST have enlarged hit areas.
- **RSP-14** — On touch devices the student MUST at least be able to open
  a circuit, run and pause it, flip switches, drag sliders and
  potentiometers, pan and zoom (two-finger gestures), place and remove
  probes, and read the chart with a finger-dragged cursor.
- **RSP-15** — Editing with touch (placing parts, drawing wires) SHOULD be
  supported with tap-to-place and drag-to-wire. Where a mouse feature has
  no touch equivalent (hover readouts), a tap-and-hold MUST show the same
  information.

## 6. The Schematic Canvas

### 6.1 Space, grid, and view

- **CAN-01 — Unbounded canvas.** The canvas MUST extend without limit in
  every direction. A circuit can be built anywhere on it.
- **CAN-02 — Grid.** Part terminals and wire corners MUST snap to a square
  grid. The grid MUST be shown as faint dots that can be turned off
  (View → Show Grid, `G`). Holding Alt while dragging MUST temporarily
  disable snapping for labels and annotations only; terminals always snap.
- **CAN-03 — Zoom.** The view MUST zoom from 10% to 800%. The mouse wheel
  (or Ctrl+wheel when embedded, [EMB-05](#193-living-on-a-page)) MUST zoom
  around the pointer. Ctrl+`=` and Ctrl+`-` MUST zoom around the view
  center. **Fit** (`F`, or Ctrl+0) MUST frame the whole circuit with a
  margin, and **Actual size** (Ctrl+1) MUST return to 100%.
- **CAN-04 — Pan.** The student MUST be able to pan by dragging empty
  canvas with the middle mouse button, by holding Space and dragging with
  the left button, with two-finger touchpad scrolling, and with the arrow
  keys when nothing is selected.
- **CAN-05 — Zoom to selection.** **Zoom to selection** (`Z`) MUST frame the
  selected parts.
- **CAN-06** — The grid MUST fade out below 40% zoom so it never turns into
  visual noise.

### 6.2 How parts and wires look

- **CAN-07 — Symbols.** Parts MUST be drawn with standard schematic symbols.
  The default style MUST be ANSI/IEEE (zig-zag resistor), with an IEC
  option (rectangular resistor) in settings. Polarized parts (diodes,
  electrolytic capacitors, batteries, sources) MUST show their polarity
  clearly: `+` marks, a cathode bar, an arrow.
- **CAN-08 — Labels and values.** Every part MUST show a label (such as `R1`)
  and its main value (such as `4.7 kΩ`) next to its symbol. Labels MUST be
  placed automatically so they do not overlap the symbol or its wires, and
  the student MUST be able to drag a label to another position.
- **CAN-09 — Terminals.** Unconnected terminals MUST be drawn as small open
  circles. A terminal that stays unconnected while the circuit runs MUST
  turn the warning color and add a warning ([EDT-39](#77-checking-the-circuit)).
- **CAN-10 — Junctions.** Wherever three or more wire ends or terminals meet,
  a filled junction dot MUST be drawn. Wires that cross without a junction
  dot MUST NOT be connected, and the crossing MUST be drawn so that this
  is obvious (a small gap or hop in the lower wire).
- **CAN-11 — Whole-node highlight.** Hovering over any wire MUST highlight
  every wire and terminal on the same node (the same electrical
  connection point), and show the node's name and voltage in the hover
  readout. This makes the idea of a node visible: everything highlighted
  is at one voltage.
- **CAN-12 — Node names.** Every node MUST have a name. Nodes get automatic
  names (`N1`, `N2`, ...) unless the student names them with a net label
  ([EDT-14](#72-wiring)). Ground is always named `GND`.
- **CAN-13 — Annotations.** The student MUST be able to add free text,
  rectangles, and arrows to the canvas, to label parts of a circuit
  ("input stage", "filter"). Annotations are never electrical.
- **CAN-14 — Lifelike view.** The simulator SHOULD offer a **Lifelike**
  view (View → Lifelike, toggled back with the same command) that draws the
  same circuit, in the same positions, with realistic pictures of the parts
  instead of symbols: bulbs with filaments, batteries, resistors with color
  bands matching their value, capacitors as cans and discs, switches as
  toggles. Wires become flexible leads. Everything else (animation, probes,
  chart) works the same. Moving between the views helps beginners connect
  a schematic symbol to the object on the lab bench.
- **CAN-15 — Themes.** The canvas MUST follow the color theme (light, dark,
  high contrast). Voltage colors and probe colors MUST be tuned for each
  theme so they keep enough contrast.

### 6.3 Hover readouts

- **CAN-16** — Hovering over a **wire** MUST show its node name, its voltage
  relative to ground, and the current in that wire segment with an arrow
  showing direction.
- **CAN-17** — Hovering over a **part** MUST show a small card with its
  label, type, main value, the voltage across it, the current through it,
  the power it is absorbing or delivering, and the quantities special to
  that part (for example, a capacitor's charge and stored energy, an
  inductor's flux and stored energy, a diode's forward voltage, a
  transistor's operating region). [Section 9](#9-component-library) lists
  the readouts for each part.
- **CAN-18** — Hover cards MUST update live while the simulation runs, and
  MUST show the values at the scrub position when the student scrubs back
  in time ([CHT-22](#125-time-navigation-and-history)).
- **CAN-19** — Pinning: clicking the pin icon on a hover card MUST keep it
  open as a small floating meter that the student can drag anywhere. Pinned
  cards follow their part when the view pans or zooms.

## 7. Building and Editing Circuits

### 7.1 Placing components

- **EDT-01 — From the palette.** Clicking a part in the palette MUST attach a
  faint preview of it to the pointer. Clicking on the canvas places it.
  The student can place several copies in a row; Esc or right-click ends
  placing. Dragging a part from the palette onto the canvas MUST also
  place it.
- **EDT-02 — Rotate while placing.** While a preview is attached, `R` MUST
  rotate it 90° clockwise and Shift+`R` counter-clockwise; `X` and `Y`
  MUST flip it horizontally and vertically.
- **EDT-03 — Quick add.** Pressing `A` or `/` MUST open a quick-add box at
  the pointer. Typing filters every part by name, alias, and category
  (typing "pot" finds Potentiometer, "npn" finds NPN Transistor, "cap"
  finds every capacitor). Enter attaches the top match to the pointer.
- **EDT-04 — Hotkeys.** The most common parts MUST have single-key hotkeys,
  shown in the palette tooltips: `W` wire, `R` resistor, `C` capacitor, `L` inductor, `V` DC voltage source, `B`
  battery, `D` diode, `S` switch, `T` ground (think "terminal"), `P`
  voltage probe, `I` current probe. Because `R`, `X`, and `Y` also rotate
  and flip ([EDT-21](#73-selecting-and-arranging)), a part hotkey MUST act
  only when nothing is selected and nothing is being placed. Hotkeys MUST
  be remappable ([SET-06](#24-settings)).
- **EDT-05 — Drop to connect.** When a part is dropped so that one of its
  terminals lands on a wire end, a terminal, or anywhere along a wire, it
  MUST connect there. Before release, the terminals that will connect
  MUST light up.
- **EDT-06 — Drop to insert.** When a two-terminal part is dropped lying
  along a straight wire, the wire MUST be split and the part inserted in
  series, so "put an ammeter in series with the lamp" is one drag. A
  preview MUST show the split before release, and holding Alt MUST
  prevent it.
- **EDT-07 — Stretching.** Two-terminal parts MUST have a default length
  of four grid units. Dragging either terminal of a selected part MUST
  stretch or shorten it in steps of one grid unit, down to two units.
- **EDT-08 — Automatic labels.** Each new part MUST get the next free label
  for its kind (`R1`, `R2`, `C1`, `Q1`, `U1`, ...). Labels MUST be
  unique within a circuit; the inspector MUST refuse a duplicate.

### 7.2 Wiring

- **EDT-09 — Draw a wire.** Pressing on a terminal or wire end and dragging
  MUST draw a wire. The wire MUST follow a right-angled path with one bend
  that tracks the pointer. Pressing Space while dragging MUST flip which
  way the bend goes.
- **EDT-10 — Bend points.** Clicking (instead of releasing) during a drag
  MUST fix a bend point and continue the wire from there, so wires can
  take any right-angled path.
- **EDT-11 — Ending a wire.** Releasing on a terminal, on a wire end, or on
  the middle of a wire MUST connect there (a connection on the middle of a
  wire creates a junction). Releasing on empty canvas MUST leave a
  dangling end, shown as an open circle, that can be connected later.
- **EDT-12 — Branching.** Holding Alt and dragging from the middle of a wire
  MUST start a new wire branching from that point.
- **EDT-13 — Tidy wires.** Straight runs made of several segments MUST merge
  into one wire. Zero-length wires MUST be removed. Moving a junction
  MUST drag all its wires with it.
- **EDT-14 — Net labels.** A net label is a small flag with a name, such as
  `Vout`, attached to a wire. All wires carrying the same net label MUST be
  connected even with no wire drawn between them, and hovering one MUST
  highlight all of them ([CAN-11](#62-how-parts-and-wires-look)).
  Ground symbols MUST behave as net labels named `GND`.
- **EDT-15 — Rubber-banding.** When parts are moved, the wires attached to
  them MUST stay attached and re-route with right angles, keeping existing
  bend points where possible.
- **EDT-16 — Disconnect.** Holding Ctrl while dragging a part MUST pull it
  away from its wires instead of rubber-banding them.
- **EDT-17 — Wire mode.** A dedicated Wire tool (`W`) MUST let the student
  start a wire anywhere on the grid, not only at a terminal, for drawing
  the wiring first and dropping parts onto it afterward.

### 7.3 Selecting and arranging

- **EDT-18** — Clicking a part, wire, probe, or annotation MUST select it;
  Shift+click MUST add to or remove from the selection; Ctrl+A MUST select
  everything; Esc MUST clear the selection.
- **EDT-19 — Box select.** Dragging on empty canvas (with the left button,
  in the default Select tool) MUST draw a selection box. A box dragged left
  to right MUST select items entirely inside it. A box dragged right to
  left MUST select items it touches. The box style MUST show which rule
  applies (solid versus dashed outline).
- **EDT-20 — Moving.** Selected items MUST move by dragging, by one grid unit
  with the arrow keys, and by five units with Shift+arrow.
- **EDT-21 — Rotate and flip.** `R` and Shift+`R` MUST rotate the selection
  90° around its center; `X` and `Y` MUST flip it.
- **EDT-22 — Clipboard.** Ctrl+C, Ctrl+X, and Ctrl+V MUST copy, cut, and
  paste. Pasted items MUST arrive at the pointer, selected and keeping
  their internal connections. Ctrl+D MUST duplicate the selection with a
  small offset. Copied circuits MUST paste into another tab or another
  embedded simulator.
- **EDT-23 — Paste Falstad text.** Pasting Falstad circuit text (the format
  Falstad's **Export As Text** produces) onto the canvas MUST import it as
  if opened from a file ([Section 18.3](#183-falstad-compatibility)).
- **EDT-24 — Delete.** Delete or Backspace MUST delete the selection. Deleting
  a part MUST leave its wires in place, with dangling ends, so the student
  can drop a different part into the gap.

### 7.4 Editing values

- **EDT-25 — Where values are edited.** Double-clicking a part, or pressing
  Enter with it selected, MUST open its properties in the inspector with
  the main value focused. Double-clicking the value text on the canvas
  MUST edit it in place.
- **EDT-26 — Number entry.** Every numeric field MUST accept:

    - plain and scientific numbers: `4700`, `4.7e3`, `-1.5`;
    - metric prefixes: `f`, `p`, `n`, `u` or `µ`, `m`, `k`, `M` or `meg`,
      `G`, `T` (with `m` meaning milli and `M` meaning mega);
    - an optional unit symbol after the prefix, ignored if it matches the
      field (`4.7kΩ`, `100nF`, `5V`) and rejected with a message if it does
      not (`5A` typed into a voltage field);
    - the "R notation" used on parts, where the letter replaces the decimal
      point: `4k7` means 4.7 kΩ, `2R2` means 2.2 Ω.

    Values MUST be displayed in engineering notation with three significant
    figures by default (`4.70 kΩ`, `33.0 nF`).

- **EDT-27 — Ranges.** Each property has an allowed range
  ([Section 9](#9-component-library)). An out-of-range value MUST be refused
  with a message that states the range; the field keeps the old value.
- **EDT-28 — Standard values.** Resistance, capacitance, and inductance
  fields MUST offer a **Nearest standard value** helper with E6, E12, and
  E24 series, and a setting to snap typed values to the chosen series.
- **EDT-29 — Several at once.** With several parts of the same kind
  selected, the inspector MUST edit their shared properties together,
  showing "mixed" where they differ.
- **EDT-30 — Sliders.** Any numeric property MUST have an **Add slider**
  action that puts a labelled slider in the slider panel
  ([Section 15](#15-interactive-controls-while-running)).

### 7.5 Undo and history

- **EDT-31** — Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z or Ctrl+Y) MUST cover
  every change to the circuit, its probes, its sliders, and its chart
  settings, with no fixed limit within a session.
- **EDT-32** — One gesture MUST be one undo step: a whole drag, a whole
  slider movement, a whole paste.
- **EDT-33** — Running, pausing, and the passage of simulation time MUST NOT
  be undo steps. Undoing a change while running MUST apply immediately to
  the running simulation.

### 7.6 Subcircuits

- **EDT-34 — Making a subcircuit.** Selecting part of a circuit and choosing
  **Make subcircuit** MUST replace it with a single block. The student
  chooses which wires become the block's pins, names each pin, and names
  the block. The block's symbol is a rectangle with the pins on its edges,
  which the student can rearrange.
- **EDT-35 — Reusing it.** Each subcircuit MUST appear in a **My parts**
  palette category, saved in browser storage and inside every circuit file
  that uses it, and MUST be placeable any number of times.
- **EDT-36 — Looking inside.** Double-clicking a subcircuit block (or an
  integrated part that has an inside view, such as the 555 timer) MUST open
  its inside as a nested view with a breadcrumb trail ("Circuit › U1 555
  timer"). The inside MUST run live, with animation, hover readouts, and
  probes; probes placed inside appear on the main chart, named with the
  path (`U1/V3`). Esc or the breadcrumb returns to the outer circuit.
- **EDT-37 — Black boxes.** A subcircuit MUST be lockable as a **black
  box**, whose inside cannot be opened or seen. Students then work out what
  is inside by measuring at its pins. A lesson can lock a black box
  ([Section 20](#20-guided-lesson-mode)).
- **EDT-38 — Editing the definition.** Editing inside a subcircuit MUST
  ask whether to change every copy or only this one (which then becomes a
  new subcircuit).

### 7.7 Checking the circuit

The simulator MUST continuously check the circuit and list problems in the
warning list (opened from the status bar). Each warning MUST name the parts
involved, highlight them on the canvas when selected, and offer a fix where
one is obvious.

- **EDT-39** — The checks MUST include at least:

    | Problem | Message (example) | Offered fix |
    |---|---|---|
    | No ground | "This circuit has no ground, so voltages are measured from node N1." | Add ground at the battery's negative terminal |
    | Floating part or section | "C2 is not connected to the rest of the circuit." | Show it |
    | Dangling wire end or open terminal | "One end of R3 is not connected." | Show it |
    | Ideal voltage sources in a loop with nothing else | "V1 and V2 are connected directly in parallel. Ideal sources cannot both set the same voltage." | Add a small resistor between them |
    | Ideal current source with no path | "I1 has nowhere for its current to go." | Show it |
    | Short circuit across a source | "V1 is shorted by a wire. Its current would be infinite." | Show the wire |
    | Overlapping parts | "R1 and R2 are on top of each other." | Separate them |
    | Ammeter in parallel | "Ammeter A1 is connected in parallel with the lamp. Ammeters go in series." | Show me how |
    | Voltmeter in series | "Voltmeter V1 is in series with the circuit, so almost no current can flow." | Show me how |

- **EDT-40** — Warnings MUST NOT stop the simulation unless the circuit
  truly cannot be solved ([SIM-14](#104-when-a-circuit-cannot-be-solved)).

## 8. Keyboard and Mouse Reference

This table collects every default shortcut defined elsewhere in this
specification. On macOS, Cmd replaces Ctrl. Shortcuts act only when the
simulator has focus ([EMB-06](#193-living-on-a-page)), and part hotkeys act
only when nothing is selected or being placed ([EDT-04](#71-placing-components)).

### 8.1 Keyboard

| Keys | Action |
|---|---|
| `Space` (tap) | Run or pause |
| `.` / Shift+`.` | Step one time step / step to the next event |
| Ctrl+Backspace | Reset simulation |
| `A` or `/` | Quick add a part |
| `W` | Wire tool |
| `R`, `C`, `L`, `V`, `B`, `D`, `S`, `T` | Place resistor, capacitor, inductor, DC voltage source, battery, diode, switch, ground |
| `P` / `I` / Shift+`P` | Voltage probe / current probe / power probe tool |
| `R` / Shift+`R` | Rotate selection or placement preview 90° clockwise / counter-clockwise |
| `X` / `Y` | Flip horizontally / vertically |
| `[` / `]` | Previous / next terminal of the focused part (keyboard wiring) |
| Enter | Edit the selected part's main value |
| Delete or Backspace | Delete selection |
| Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y | Undo / redo |
| Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D | Copy / cut / paste / duplicate |
| Ctrl+A / Esc | Select all / cancel or clear selection |
| Arrow keys / Shift+arrow | Move selection by 1 / 5 grid units; pan when nothing is selected |
| Tab / Shift+Tab | Focus next / previous part |
| `F` or Ctrl+0 / Ctrl+1 | Fit circuit / 100% zoom |
| Ctrl+`=` / Ctrl+`-` | Zoom in / out |
| `Z` | Zoom to selection |
| `G` | Show or hide grid |
| `K` | Keep ghost copies of all traces |
| `C` (chart focused) | Show or hide chart cursors |
| Left / Right (chart focused, paused) | Move the playhead one time step |
| Ctrl+S / Ctrl+O | Save / open circuit file |
| `M` | Mute or unmute sound |
| `?` | Show this shortcut list |

### 8.2 Mouse

| Gesture | Action |
|---|---|
| Click part in palette, then click canvas | Place part (repeatable until Esc) |
| Drag from terminal | Draw wire; click to add bend; Space flips the bend |
| Alt+drag from a wire's middle | Start a branch wire |
| Click a switch, button, or logic input | Operate it |
| Double-click a part | Edit its properties |
| Double-click a subcircuit | Open its inside |
| Alt+click wire / part | Quick voltage probe / quick current probe |
| Alt+Shift+click part | Quick power probe |
| Right-click | Context menu |
| Drag on empty canvas left to right / right to left | Select enclosed / touched items |
| Middle-drag, or Space+drag | Pan |
| Wheel (Ctrl+wheel when embedded) | Zoom around pointer |
| Ctrl+drag a part | Detach it from its wires |
| Drag a part onto a straight wire | Insert it in series |
| Ctrl+wheel over the chart | Zoom the time axis |
| Right-drag or Shift+drag on a chart lane | Quick measuring box |

All of these defaults can be changed ([SET-06](#24-settings)).

## 9. Component Library

### 9.1 How the library is organized

- **CMP-01 — Categories.** The palette MUST group parts into these
  categories, in this order: **Essentials**, **Sources**, **Passive
  parts**, **Switches and relays**, **Semiconductors**, **Amplifiers and
  integrated circuits**, **Logic gates and inputs**, **Digital chips**,
  **Meters and outputs**, **Advanced**, **Annotations**, and **My parts**
  (subcircuits, [EDT-35](#76-subcircuits)).
- **CMP-02 — Essentials first.** New learners MUST see only the
  **Essentials** category, holding the parts a first circuits course
  needs: wire, ground, battery, DC voltage source, AC voltage source,
  resistor, potentiometer, capacitor, inductor, switch, push button, lamp,
  LED, diode, voltmeter, ammeter, and the probe tools. **Show all parts**
  reveals the full library and is remembered. A lesson can limit the
  palette to any list of parts ([LES-01](#201-lesson-files)).
- **CMP-03 — Falstad parity.** Every element used by the 366 circuits in the
  [List of Circuits](../list-of-circuits.md) MUST be available in the first
  release, so that the whole library runs ([FIL-18](#183-falstad-compatibility)).
  The tables below therefore include some parts that few high school
  courses use, in the **Advanced** category.
- **CMP-04 — Common properties.** Every part MUST have a label, a choice of
  whether to show its label and value, and its orientation. Every part
  with two terminals MUST report the voltage across it, the current
  through it, and its power in the hover card ([CAN-17](#63-hover-readouts)).
- **CMP-05 — Polarity is explicit.** Every part MUST mark its first terminal
  (the `+` or reference end) on the symbol whenever it is selected or
  probed, so that the signs of its voltage and current are never a hidden
  consequence of the direction it was drawn.
- **CMP-06 — Ranges.** Every numeric property MUST have a documented
  allowed range ([EDT-27](#74-editing-values)). Unless a table below says
  otherwise, resistances range from 1 µΩ to 1 TΩ, capacitances from 1 fF to
  10 F, inductances from 1 nH to 1000 H, voltages from −100 kV to 100 kV,
  currents from −1 kA to 1 kA, and frequencies from 1 mHz to 10 GHz.
- **CMP-07 — Models.** Parts with real-world models (diodes, LEDs,
  transistors, op-amps) MUST offer a short list of named models (such as
  1N4148 or LM741) plus a **Custom** model whose parameters can be edited.
  The default model of each part MUST be a well-behaved generic one.
- **CMP-08 — Help for every part.** Every part MUST have a help card,
  opened from the palette or the inspector, with a picture of the real
  component, what it does in one or two sentences, its properties, its
  readouts, and an example circuit from the library that uses it.

In the tables, values in parentheses are defaults. "V, I, P" means the
hover card shows the voltage across, the current through, and the power.

### 9.2 Wires, ground, and labels

| Part | Main properties | Hover readouts |
|---|---|---|
| Wire | None (ideal; resistance per unit length when realistic parts are on) | Node name, voltage, current |
| Ground | None. All grounds are one node, `GND`, at 0 V | Total current into ground |
| Voltage rail | Voltage (5 V); one terminal, referenced to ground | Voltage, current supplied |
| Net label | Name ([EDT-14](#72-wiring)) | Node name, voltage |
| Annotations: text, box, arrow | Text, size, color ([CAN-13](#62-how-parts-and-wires-look)) | — |

### 9.3 Sources

| Part | Main properties | Hover readouts |
|---|---|---|
| Battery | Voltage (9 V); internal resistance (0 Ω, or 0.5 Ω with realistic parts); capacity (500 mAh, used with realistic ratings) | Terminal voltage, I, power delivered, charge used, charge remaining |
| DC voltage source | Voltage (5 V); internal resistance (0 Ω) | V, I, P |
| AC voltage source | Amplitude (5 V peak; typing `rms` after a value converts, as in `120 rms`); frequency (60 Hz); DC offset (0 V); phase (0°); presets for 120 V 60 Hz and 230 V 50 Hz mains | V, I, frequency, peak, RMS, P |
| Function generator | Waveform: sine, square, triangle, sawtooth, pulse, or noise; amplitude (5 V); frequency (1 kHz); DC offset; phase; duty cycle (50%) or high and low times; rise and fall times | V, I, frequency, P |
| Piecewise source | A list of (time, value) points, repeating or not | V, I |
| Variable voltage source | Minimum and maximum (0–10 V); comes with a slider | V, I, P |
| Frequency sweep source | Start and end frequency, sweep time, linear or logarithmic, one-way or back and forth, amplitude | V, I, present frequency |
| AM and FM sources | Carrier frequency, signal frequency, modulation depth or deviation, amplitude | V, I |
| Noise source | Amplitude; seed ([SIM-23](#106-faithfulness)) | V, I |
| Current source | Current (10 mA); maximum voltage (unlimited) | I, V across, P |
| Controlled sources (VCVS, VCCS, CCVS, CCCS) | Gain, or an expression of the controlling inputs and time (for example `2*a`, `a*b`, `sin(t)`) | Output V and I, controlling values |
| Host input | A name; its voltage is set by the host page ([EMB-11](#194-messages-with-the-host-page)) | V, I |

### 9.4 Passive parts

| Part | Main properties | Hover readouts |
|---|---|---|
| Resistor | Resistance (1 kΩ); power rating (0.25 W, with realistic ratings) | V, I, P, R; color-band code in the lifelike view |
| Potentiometer | Total resistance (10 kΩ); wiper position (50%); taper (linear or logarithmic); link group, so several pots move together; comes with a slider | Resistance of each side, wiper voltage, currents |
| Capacitor | Capacitance (10 µF); initial voltage (0 V); series resistance (0 Ω, small with realistic parts); voltage rating (25 V) | V, I, C, charge Q, stored energy, P |
| Electrolytic capacitor | As capacitor, plus polarity and reverse-voltage limit; with realistic ratings it fails if reversed | As capacitor |
| Inductor | Inductance (1 H); initial current (0 A); winding resistance (0 Ω); saturation current (none) | V, I, L, flux linkage, stored energy, P; effective inductance when saturating |
| Transformer | Primary inductance (4 H); turns ratio (1:1); coupling (0.999); polarity swap; saturation current; center-tapped and multi-winding variants | Each winding's V and I, ratio, power in and out |
| Lamp | Rated voltage and power (6 V, 3 W); filament: ohmic (constant resistance, the default) or realistic (resistance rises as it heats, with a warm-up delay) | V, I, P, brightness, filament temperature (realistic) |
| Fuse | Current rating (1 A); melting energy (I²t); resistance | I, percent melted |
| Light-dependent resistor | Dark and bright resistance; light level (comes with a slider) | V, I, R, light level |
| Thermistor | Resistance at 25 °C (10 kΩ); beta; temperature (comes with a slider) | V, I, R, temperature |
| Crystal | Series resonant frequency; quality factor | V, I, series and parallel resonance, Q |
| Everyday objects (MAY) | Pencil lead, coin, paper clip, eraser, dry hand, each with an approximate resistance, for "what conducts?" activities | V, I, R |

### 9.5 Switches and relays

| Part | Main properties | Hover readouts |
|---|---|---|
| Switch (SPST) | State (open); on resistance (0 Ω); link label, so linked switches flip together; keyboard key ([CTL-09](#15-interactive-controls-while-running)); schedule ([CTL-08](#15-interactive-controls-while-running)) | State, V across, I |
| Push button | Normally open or normally closed; otherwise as switch | State, V, I |
| SPDT and multi-throw switch | Number of positions (2–10); position; link label | Position, V, I |
| DPDT switch | Number of poles; otherwise as SPDT | Position |
| Make-before-break and cross (four-way) switches | As SPDT | Position |
| Relay | Coil resistance, pull-in and drop-out currents, switching time, number of poles, contact resistance; coil types: normal, delay-on, delay-off, latching | Coil current, contact state |
| Analog switch and analog multiplexer | Controlled by a logic input; on and off resistance | State, V, I |

### 9.6 Semiconductors

| Part | Main properties | Hover readouts |
|---|---|---|
| Diode | Model: generic silicon (default), 1N4148, 1N4004, 1N5711 (Schottky), custom (forward voltage at a given current, or saturation current, emission coefficient, series resistance); breakdown voltage | V, I, P, state (forward biased, reverse biased, breakdown) |
| Zener diode | Zener voltage (5.6 V); model as diode | V, I, P, state |
| LED | Color: red, orange, yellow, green, blue, white, infrared, or custom; forward voltage set by the color (red about 1.8 V, blue about 2.8 V); full-brightness current (20 mA) | V, I, P, brightness |
| Varactor | Capacitance at zero bias; how capacitance falls with reverse voltage | V, I, capacitance |
| NPN and PNP transistors (BJT) | Current gain β (100); model (generic, or custom with full parameters); Darlington versions | Operating region (cut-off, active, saturation, reverse active), Ic, Ib, Ie, Vbe, Vce, Vbc, P, Ic ÷ Ib |
| N- and P-channel MOSFETs | Threshold voltage (1.5 V; negative for depletion mode); transconductance parameter; channel-length modulation; body diode on or off | Region (cut-off, linear, saturation), Id, Vgs, Vds, transconductance, P |
| N- and P-channel JFETs | Saturation current Idss; pinch-off voltage | Region, Id, Vgs, Vds, P |
| SCR, DIAC, TRIAC | Trigger current, holding current, breakover voltage | State, I, V, P |
| Unijunction transistor | Intrinsic stand-off ratio | State, currents |
| Tunnel diode | Peak and valley current and voltage | V, I, P |
| Triode (vacuum tube) | Amplification factor; perveance | Plate current, grid voltage, P |
| Optocoupler | Current transfer ratio | LED current, output current |

### 9.7 Amplifiers and integrated circuits

| Part | Main properties | Hover readouts |
|---|---|---|
| Op-amp (ideal) | Open-loop gain (100,000); output limits (+15 V and −15 V); input orientation (− on top or + on top) | V+, V−, Vout, output current, "output saturated" when at a limit |
| Op-amp (realistic) | Model: LM741 or LM324; slew rate; output current limit; supply pins | As ideal, plus slew-limited flag |
| Comparator | Output type (push-pull or open collector) | Inputs, output state |
| Schmitt trigger | Upper and lower thresholds | Input, output, threshold in use |
| 555 timer | Supply and control pins; inside view of comparators, flip-flop, and discharge transistor ([EDT-36](#76-subcircuits)) | Pin voltages, state |
| Voltage regulators | LM317 (adjustable), 7805 (fixed 5 V), TL431 (shunt reference) | Input, output, dropout warning |
| Operational transconductance amplifier | Bias current input (LM13700 style) | Gain, output current |
| Norton amplifier | LM3900 style | Pin voltages |
| Current conveyors (CCII+ and CCII−) | — | Pin voltages and currents |
| Gyrator | Gyration resistance | Port voltages and currents |
| Delay buffer | Delay | Input, output |
| Voltage-controlled oscillator, phase comparator, monostable | Frequency range; pulse length | Frequency, state |

### 9.8 Logic gates, inputs, and digital chips

All digital parts follow [Section 17](#17-digital-logic-and-mixed-signal):
logic supply, thresholds, four states, and optional propagation delay.

| Part | Main properties | Hover readouts |
|---|---|---|
| Logic input | Toggle or momentary; levels; keyboard key | State |
| Logic output | Indicator style | State, voltage |
| Clock | Frequency (100 Hz), duty cycle (50%), phase | State, frequency |
| Gates: NOT, buffer, AND, OR, NAND, NOR, XOR, XNOR | Number of inputs (2–8); propagation delay; Schmitt inputs; inverted inputs; symbol style (ANSI or IEC) | Each input and the output state |
| Tri-state buffer, Schmitt inverter | Enable polarity; thresholds | States |
| Latches and flip-flops: SR, D latch, D, JK, T | Edge (rising or falling); set and reset inputs | Q, Q̄, inputs |
| Counters | Bits (4); up, down, or up/down; parallel load; ring and Johnson versions | Count in binary and decimal |
| Shift registers | Bits; serial-in parallel-out, parallel-in serial-out, universal | Contents |
| Multiplexer, demultiplexer, decoder, priority encoder | Select bits | Selected line |
| Adders and comparators | Bits; half adder, full adder | Inputs and outputs as numbers |
| Arithmetic logic unit | 74181 style | Function, result |
| Static RAM and ROM | Address and data bits; contents editable as a table | Address, data |
| Bus splitter and transceiver | Width | Bus value |
| Sequence generator | Bit pattern | Next output |
| Custom logic | Inputs, outputs, and a truth table or rule list ([DIG-11](#174-building-blocks)) | States |
| ADC and DAC | Bits (4–12); reference voltage | Code in binary and decimal, analog value |

### 9.9 Meters and outputs

| Part | Main properties | Hover readouts |
|---|---|---|
| Voltmeter | Shows: value, RMS, average, maximum, minimum, or peak-to-peak; input resistance (infinite, or 10 MΩ with realistic parts) ([PRB-22](#135-instruments-that-behave-like-real-meters)) | Reading, plus all the listed statistics |
| Ammeter | Shows: value or RMS; burden resistance (0 Ω, or small with realistic parts) ([PRB-23](#135-instruments-that-behave-like-real-meters)) | Reading, plus statistics |
| Ohmmeter | Test current | Resistance |
| Wattmeter | Instantaneous or average power | Power |
| Test point | Label (`TP1`); shows a node's voltage relative to ground on the schematic | Voltage and statistics |
| Number display | Shows a chosen voltage or current with units | Value |
| 7-segment display, LED array | Common anode or cathode; colors | Segment states |
| Speaker and buzzer | Plays its voltage as sound ([ANI-20](#113-power-heat-light-and-motion)) | V, I, P |
| DC motor | Back-EMF constant, armature resistance and inductance, load torque, inertia | Speed, back-EMF, torque, I |
| Three-phase motor | Pole count, load | Speed, phase currents |

### 9.10 Advanced

| Part | Main properties | Hover readouts |
|---|---|---|
| Transmission line | Delay (1 µs); characteristic impedance (75 Ω) | Voltage and current at each end |
| Spark gap | Breakdown voltage; on and off resistance; holding current | State, V, I |
| Memristor | On and off resistance, film width, dopant mobility | Present resistance, V, I |
| Antenna | Receives the program of every AM or FM source in the circuit | V |
| Audio input (MAY) | A sound file played as a voltage | V |

## 10. Simulation Behavior

This section describes how the simulation behaves from the student's point
of view: how it starts, how fast it runs, what happens when the circuit
changes, and what happens when it cannot be solved. It does not prescribe a
numerical method, but it does set the results that any method must achieve
([Section 26](#26-acceptance-test-circuits)).

### 10.1 Run controls

- **SIM-01 — Run and Pause.** A single Run/Pause button (`Space` when the
  canvas has focus) MUST start and pause the simulation.
- **SIM-01a — Default mode is paused.** Every simulation MUST load in the
  Paused state, with simulated time at zero, regardless of circuit, embed,
  or learner settings. The student MUST take an explicit action (pressing
  Run/Pause, `Space`, or Step) before simulated time advances.
- **SIM-02 — Step.** **Step** (`.` key) MUST advance the paused simulation by
  one time step. **Step to next event** (Shift+`.`) MUST advance until
  something changes state: a switch, a digital output, a diode or
  transistor changing region, or a trigger condition on the chart.
- **SIM-03 — Reset.** **Reset** (`Ctrl+Backspace`) MUST return simulated time
  to zero and restore every part to its starting state ([Section 10.3](#103-starting-state)).
  Reset MUST keep the circuit, the probes, the sliders, and the chart
  layout. It MUST clear the chart history, after first offering to keep
  the current traces as ghost copies ([CHT-17](#124-trace-display)).
- **SIM-04 — Pause on condition.** The student MUST be able to set a
  pause condition: when a chosen trace crosses a level (in a chosen
  direction, optionally for a minimum time or a number of times), when
  simulated time reaches a value, or when any part fails. The simulation
  pauses at that moment with an event marker, so a rare event cannot
  scroll past unseen.
- **SIM-05 — Simulated time.** The top bar MUST show simulated time since the
  last reset with sensible units (`482 µs`, `3.218 ms`, `12.7 s`).
- **SIM-06 — Running indicator.** The status bar MUST show whether the
  simulation is Running, Paused, Stepping, or Stopped because of an error,
  with a distinct icon for each.

### 10.2 Time step and speed

- **SIM-07 — Automatic time step.** By default the simulator MUST choose the
  time step itself, small enough that the circuit's fastest important
  behavior (its shortest time constant, its highest source frequency, its
  fastest switching edge) spans at least 50 steps. The step MUST shrink
  automatically around sudden events (a switch flipping, a diode turning
  on) and grow back afterward.
- **SIM-08 — Manual time step.** In the Simulation settings the student MUST
  be able to set a **maximum time step** by hand. The simulator MUST warn
  when a manual step is too large for the circuit ("The 1 ms step is longer
  than C1's 0.1 ms time constant; results will be inaccurate.").
- **SIM-09 — Simulation speed.** The speed control MUST set how much
  simulated time passes per second of real time, from extreme slow motion
  (1 µs of circuit time per real second) to fast (1000 s per second). The
  control MUST show the current ratio in words, such as "1 ms of circuit
  time per second".
- **SIM-10 — Fit speed to circuit.** A **Fit to circuit** button next to the
  speed control MUST choose a speed at which the circuit's main time scale
  (the time constant of an RC or RL circuit, or one period of the lowest
  source frequency) takes about two seconds of real time. New circuits
  MUST start at this speed.
- **SIM-11 — Real time.** When the circuit can run at one second of circuit
  time per real second, a **Real time** preset MUST be available, and a
  "Real time" badge MUST show while it is active. Sound output
  ([ANI-20](#113-power-heat-light-and-motion)) is only true to pitch in
  real time.

### 10.3 Starting state

- **SIM-12 — Start from zero.** By default every circuit MUST start with all
  capacitors uncharged, all inductors carrying no current, and every source
  switching on at time zero, so the student sees the circuit "power up".
  The circuit settings MUST offer **Start from steady state** as an
  alternative, which begins at the DC operating point
  ([Section 14.1](#141-dc-operating-point)).
- **SIM-13 — Initial conditions.** Capacitors MUST have an optional initial
  voltage and inductors an optional initial current, used at reset in
  either starting mode.

### 10.4 When a circuit cannot be solved

- **SIM-14 — Clear stop.** If the circuit has no valid solution (for
  example, two ideal voltage sources of different value in parallel, or a
  loop made only of wires and ideal inductors), the simulation MUST pause,
  the status bar MUST show "Stopped", and a message panel MUST explain the
  problem in plain language, highlight the parts involved, and offer a fix
  where possible (see [EDT-39](#77-checking-the-circuit)).
- **SIM-15 — Automatic resume.** As soon as the student edits the circuit so
  that it can be solved again, the simulation MUST resume by itself. The
  student never needs to find a hidden restart command.
- **SIM-16 — Failure to converge.** If the simulator cannot find a
  consistent solution at some moment (this can happen with strongly
  non-linear parts), it MUST pause, say so in plain language with the
  simulated time ("Could not find a solution at t = 3.21 ms"), name the
  parts most likely involved, and offer **Try a smaller time step**.
- **SIM-17 — Never lose the last good picture.** When the simulation stops,
  the schematic and chart MUST keep showing the last good state.

### 10.5 Changes while running

- **SIM-18 — Live edits.** Changing a value, flipping a switch, or moving a
  slider MUST take effect at the next time step without resetting.
- **SIM-19 — Live rewiring.** Adding, deleting, or rewiring parts while
  running MUST also take effect without a reset. Parts that remain MUST
  keep their state (capacitor voltages, inductor currents, flip-flop
  states), so that, for example, disconnecting a charged capacitor and
  reconnecting it elsewhere shows it discharging.
- **SIM-20 — Event markers.** Every change made while running MUST appear as
  an event marker on the chart's time axis ([CHT-24](#125-time-navigation-and-history)).

### 10.6 Faithfulness

- **SIM-21 — Accuracy.** The simulator MUST pass every test in
  [Section 26](#26-acceptance-test-circuits) at its default settings.
- **SIM-22 — No invented damping.** An ideal LC circuit (no resistance) MUST
  keep oscillating with its amplitude within 1% of the starting amplitude
  after 100 cycles at the default time step. The method must not make
  ideal circuits lose energy that the physics says they keep.
- **SIM-23 — Repeatable.** Running the same circuit with the same inputs
  MUST give identical results ([PRN-09](#3-design-principles)). Noise sources
  MUST use a seed stored in the circuit file, which the student can change.

## 11. Current Animation and Visual Feedback

Animated current is the heart of the simulator. Students who watch charge
move see at a glance that current is the same all the way around a series
loop, that it splits at a junction, and that it sloshes back and forth in
an AC circuit. This section defines that animation precisely.

### 11.1 Current dots

- **ANI-01 — Dots everywhere current flows.** Small dots MUST move along
  every wire and through every part that carries current. Inside a part,
  dots MUST follow the part's internal path (through a resistor's
  zig-zag, between a capacitor's plates as displacement current, through a
  transistor from collector to emitter and from base to emitter).
- **ANI-02 — Everything starts at once.** When a loop is completed (a
  switch closes, a wire is connected), current MUST start in every part of
  the loop in the same instant: all dots in the loop begin moving together.
  The animation MUST NEVER suggest that current leaves the battery and
  travels around the loop to "reach" the far side, because that picture
  feeds the sequential-reasoning misconception. (Transmission-line parts,
  which really do delay signals, are the only exception.)
- **ANI-03 — Speed shows current.** A dot's speed MUST show the size of
  the current in that wire. There MUST be two speed scales:

    - **Proportional** (the default): speed is exactly proportional to
      current. Twice the current moves twice as fast. This is the scale that
      makes the junction rule visible ([ANI-05](#111-current-dots)).
    - **Wide range**: speed rises with the logarithm of current, so
      microamps and amps both move visibly in one circuit. When this scale is
      on, the status bar MUST say "Wide-range current speed: branch speeds no
      longer add up", because the junction rule is no longer visible.

    In both scales, dot speed MUST depend only on the current and the
    Current speed control ([ANI-10](#111-current-dots)), never on the
    simulation speed or the time step, so changing the simulation speed
    never makes the same current look larger or smaller.
- **ANI-04 — Spacing is constant.** Dots MUST be spaced evenly (by default
  one dot per grid unit of wire length) regardless of current. Only speed
  changes. This keeps the picture honest: charge is not piling up or
  thinning out in a wire, it is moving faster or slower.
- **ANI-05 — Continuity at junctions.** With the Proportional scale, where a
  wire splits, the dot speeds in the branches MUST add up to the dot speed
  in the feed, so the flow of dots into a junction visibly equals the flow
  out. This is Kirchhoff's current law made visible, and it MUST hold
  exactly, not approximately, whenever no dot is at the speed cap.
- **ANI-06 — Too slow and too fast.** With the Proportional scale, a
  current that would move less than 1/20 of a grid unit per second MUST
  show as stationary dots with a faint "trickle" shimmer, so the student
  can tell "tiny current" from "no current". A current that would exceed
  the speed cap (about one dot spacing per frame, beyond which motion
  becomes a blur) MUST be drawn at the cap with the dots stretched into
  short streaks, meaning "faster than shown".
- **ANI-07 — Direction.** By default dots MUST show **conventional
  current**, moving from higher to lower potential through a resistor
  (from `+` to `−` outside a source). The setting **Show electron flow**
  MUST reverse every dot and draw the dots as small negative charges
  (with a `−` mark when zoomed in) in a distinct color, and the status bar
  MUST say "Showing electron flow". A third setting, **Off**, MUST hide the
  dots.
- **ANI-08 — Alternating current.** In an AC circuit, dots MUST move back
  and forth in step with the current. When the frequency is too high for
  the motion to be seen at the current simulation speed (more than about
  five reversals per second of real time), the simulator MUST show a
  notice beside the speed control: "Current reverses 120 times a second.
  Slow the simulation down to watch it." with a one-click **Slow down**
  button that sets a speed at which about one cycle takes two seconds.
- **ANI-09 — Paused means frozen.** When paused, dots MUST stop where they
  are. When stepping one time step at a time, dots MUST advance by the
  distance that step represents. When scrubbing back in time, dots MUST
  move to match the current at the scrub position, so the student can
  rock the animation back and forth around an interesting moment.
- **ANI-10 — Current speed control.** A **Current speed** control MUST let
  the student slow or speed up the dots without changing the simulation.
  **Auto** (the default) MUST set the scale so the largest current in view
  moves at about four grid units per second, and MUST re-adjust only when
  that largest current changes by more than a factor of ten and stays
  there for a second. It MUST NOT re-adjust continuously, or a changing
  current would look constant. Moving the control by hand switches Auto
  off until the student turns it back on.
- **ANI-11 — Current arrows.** The student MUST be able to show a current
  arrow with a value on any wire or part (from its context menu, or for
  all parts at once from View → Show Currents). The arrow points in the
  direction of conventional current (or electron flow when that setting is
  on) and its label shows the value, such as `2.31 mA`.

### 11.2 Voltage color

- **ANI-12 — Wires show voltage.** Every wire MUST be colored by its voltage
  relative to ground. The default scale MUST run from red for the most
  negative voltage, through gray at 0 V, to green for the most positive
  voltage, as in Falstad's simulator. A color-blind-safe scale (blue
  through gray to orange) MUST be available
  ([ACC-12](#223-color-motion-and-flicker)).
- **ANI-13 — Inside parts.** Parts with a voltage drop MUST be shaded with a
  gradient from one terminal's color to the other's, so the drop across a
  resistor is visible as a change of color along it.
- **ANI-14 — Scale range.** The scale MUST by default span the largest
  positive and negative voltages present (symmetric around 0 V). The
  student MUST be able to fix the range (for example, ±12 V) so colors do
  not shift while experimenting. A small color legend MUST be available in
  a canvas corner.
- **ANI-15 — Turning it off.** Voltage coloring MUST be switchable off
  (View → Voltage Colors). With it off, wires are drawn in the theme's
  plain wire color.

### 11.3 Power, heat, light, and motion

- **ANI-16 — Power view.** A **Power** view MUST replace voltage colors with
  a power scale: parts absorbing power glow warm (yellow to orange, scaled
  to the largest power in the circuit) and parts delivering power (sources,
  discharging capacitors) glow cool (blue). Hovering any part MUST show
  its power with its sign spelled out: "absorbing 45.0 mW" or
  "delivering 45.0 mW".
- **ANI-17 — Light.** Lamps and LEDs MUST glow with a brightness that rises
  with the power (lamp) or current (LED) through them, using a perceptual
  scale so half the brightness looks half as bright. LEDs MUST glow in
  their chosen color. A lamp's glow MUST follow its filament temperature
  (which lags its power), not jump instantly.
- **ANI-18 — Charge on capacitors.** Capacitor plates MUST show their
  charge: `+` and `−` marks that grow in number with the charge, on the
  correct plates, so a charging capacitor is seen filling up.
- **ANI-19 — Energy in inductors.** An inductor MUST show its stored energy
  with a soft field glow around its coil that grows with the current.
- **ANI-20 — Motion and sound.** Motors MUST spin at a rate shown by an
  animated rotor, with a speed readout. Speakers and buzzers MUST play
  their waveform as sound when sound is on
  ([ACC-15](#223-color-motion-and-flicker)), at real-time pitch only when
  the simulation runs in real time, and otherwise show a moving cone.
- **ANI-21 — Switch states.** Switches, push buttons, and relays MUST show
  their contact position clearly and animate when they change state.
- **ANI-22 — Logic states.** Digital wires MUST be colored by logic level
  (high, low, unknown, high impedance) using the scheme in
  [Section 17](#17-digital-logic-and-mixed-signal), in addition to (or
  instead of, by setting) analog voltage colors.

### 11.4 Values on the schematic

- **ANI-23 — Show values.** View → Show Values MUST print the live voltage
  of each node next to the node, and View → Show Currents MUST add a
  current arrow and value to every part ([ANI-11](#111-current-dots)). These
  labels MUST avoid overlapping each other and the symbols, and MUST hide
  at zoom levels where they would collide ([RSP-12](#53-the-canvas-and-chart-at-small-sizes)).
- **ANI-24 — Operating-point labels.** When the DC operating point table is
  open ([Section 14.1](#141-dc-operating-point)), the schematic MUST be able
  to show those values instead, frozen, in a distinct style.
- **ANI-25 — Waveforms on wires.** The student SHOULD be able to turn on
  **Mini waveforms** for any node or part: a small sparkline of its recent
  voltage (or current) drawn beside it on the schematic, in the theme's
  neutral color, showing the last chart window. This puts the time view
  right where the eye already is.
- **ANI-26 — Change highlights.** After the student changes a value, the
  wires and parts whose voltage or current changed by more than 10% within
  the next simulated second SHOULD briefly flash an outline, so cause and
  effect stand out ("I changed R2 and these three things changed").

## 12. The Time-Series Chart

The chart plots the probed voltages, currents, and powers against time. It
is the second half of the core experience: the schematic shows *where*,
the chart shows *when* and *how much*.

### 12.1 Lanes and legend

- **CHT-01 — Lanes.** The chart MUST be made of one or more horizontal
  lanes stacked top to bottom, all sharing one time axis drawn along the
  bottom. Each lane has its own vertical axis.
- **CHT-02 — Automatic lanes.** A new trace MUST go into the lane for its
  quantity, creating that lane if needed: a **Voltage** lane, a
  **Current** lane, a **Power** lane, and compact **Logic** lanes for
  digital signals. A circuit with one voltage probe and one current probe
  therefore shows two lanes, one above the other, with their time axes
  lined up.
- **CHT-03 — Rearranging.** The student MUST be able to drag a trace's
  legend chip into another lane, or into the empty strip below the last
  lane to give it a lane of its own. A lane holding two different
  quantities (for example volts and amps) MUST show a second vertical
  axis on its right edge, in the second quantity's units. A lane MUST NOT
  hold more than two kinds of unit.
- **CHT-04 — Lane controls.** Lanes MUST be resizable by dragging their
  lower edge, reorderable by dragging their title, collapsible to a thin
  strip, and removable (which removes their traces from view but keeps
  the probes).
- **CHT-05 — Legend.** Above the lanes, a legend MUST list every trace as
  a chip showing its color swatch and line style, its name (such as
  `V1 · Vout`), and its live value. Clicking a chip MUST hide or show the
  trace. Hovering a chip MUST highlight that trace and its probe flag on
  the schematic; hovering a probe flag MUST highlight its chip and trace
  ([PRN-03](#3-design-principles)).
- **CHT-06 — Trace names.** Traces MUST be named after their probe, with
  the node or part they measure: `V1 · Vout`, `I1 · R2`, `V2 · across C1`,
  `P1 · D1`. The student MUST be able to rename them.

### 12.2 Time axis and sweep modes

- **CHT-07 — Time window.** The visible time span MUST be adjustable with a
  window control offering a 1–2–5 sequence from 1 µs to 1000 s, and by
  zooming the time axis ([CHT-20](#125-time-navigation-and-history)).
  **Fit to circuit** MUST choose a window of about five time constants for
  a transient circuit, or about three periods of the lowest source
  frequency for an AC circuit.
- **CHT-08 — Roll mode (default).** New data MUST enter at the right edge
  while older data scrolls off to the left, like a chart recorder.
- **CHT-09 — Sweep mode.** The trace MUST draw from left to right across a
  fixed window and wrap back to the left, erasing just ahead of itself,
  like an analog oscilloscope. Periodic signals stand still in this mode
  when the window is a whole number of periods.
- **CHT-10 — Triggered mode.** As on an oscilloscope, each sweep MUST start
  when a chosen **trigger trace** crosses a chosen **level** in a chosen
  **direction** (rising, falling, or either), with an adjustable
  **pre-trigger** portion (0–90% of the window, default 10%) shown before
  the trigger point. Trigger modes MUST include **Auto** (sweep anyway if
  no trigger arrives within one window), **Normal** (wait for a trigger),
  and **Single** (capture one sweep, then hold it, ideal for catching the
  moment a switch opens). The trigger level MUST be shown as a draggable
  marker on the trigger trace's lane.
- **CHT-11 — Time labels.** Time labels MUST use engineering units chosen
  for the window (`µs`, `ms`, `s`). The student MUST be able to show time
  relative to an event (the trigger, the playhead, or any event marker)
  so that the event is `t = 0`.

### 12.3 Vertical scaling

- **CHT-12 — Automatic scaling (default).** Each lane's vertical range MUST
  expand at once to fit any trace that would go off-scale, and MUST shrink
  only after the traces have used less than a quarter of the range for two
  seconds of real time. Limits MUST be rounded to tidy values (1, 2, or 5
  times a power of ten). This keeps the picture steady instead of jumping
  with every wiggle.
- **CHT-13 — Manual scaling.** The student MUST be able to set a lane's
  minimum and maximum by typing them, by dragging its axis (drag to shift,
  Ctrl+drag to stretch), or by choosing a per-division scale such as
  `2 V/div`. Manual scaling locks the lane until **Auto** is pressed again.
- **CHT-14 — Zero.** Each lane MUST draw its zero line more strongly than
  its other grid lines. Lane options MUST include **Always include zero**
  (default on for current and power lanes) and **Symmetric about zero**.

### 12.4 Trace display

- **CHT-15 — Colors and styles.** Traces MUST be assigned colors in order
  from a palette of at least eight colors that remain distinguishable for
  common forms of color blindness and in both light and dark themes. Each
  trace MUST also get a distinct line style or marker shape
  ([ACC-11](#223-color-motion-and-flicker)). The student MUST be able to
  change any trace's color, width, and style.
- **CHT-16 — Samples.** When zoomed in far enough that individual time steps
  are more than 6 px apart, the chart MUST mark each computed sample with a
  small dot, so the student can see that the curve is made of discrete
  steps.
- **CHT-17 — Ghost copies.** The student MUST be able to keep a copy of any
  trace, or of every trace at once (**Keep copies**, `K`), as a faded
  dashed "ghost" labelled with the circuit change that followed it
  (for example, "before R1 = 2.2 kΩ"). Ghosts let the student compare
  before and after a change on the same axes. Up to eight ghosts per trace
  MUST be kept; each can be hidden or removed.
- **CHT-18 — Automatic ghosts.** With **Ghost on change** turned on, each
  value change MUST automatically keep a ghost of the traces from before
  the change.
- **CHT-19 — Spikes stay visible.** Zoomed-out traces MUST be drawn with
  their minimum and maximum in each pixel column
  ([PRF-05](#23-performance-and-reliability)).

### 12.5 Time navigation and history

- **CHT-20 — Zooming and panning time.** The student MUST be able to zoom
  the time axis with Ctrl+wheel over the chart (around the pointer) or by
  dragging a box on the time axis, and pan by dragging the chart
  background. Plain wheel over the chart MUST scroll the chart panel (or
  the page, when embedded).
- **CHT-21 — Looking back while running.** If the student pans or zooms
  while the simulation runs, the chart MUST detach from live data and show
  a **Back to live** button; the simulation keeps running.
- **CHT-22 — Playhead and scrubbing.** When paused, the chart MUST show a
  vertical **playhead** at the current moment. Dragging the playhead (or
  pressing the left and right arrow keys with the chart focused) MUST
  move through history, and the schematic MUST show the circuit at that
  moment: wire colors, current dots and their speeds, lamp and LED
  brightness, capacitor charge marks, switch positions, hover readouts,
  and pinned meters ([PRN-04](#3-design-principles)). Pressing Run resumes
  from the latest moment, not from the playhead, unless the student
  chooses **Restart from here** (which discards later history after a
  confirmation).
- **CHT-23 — History depth.** The simulator MUST keep the full circuit
  state (every node voltage, every branch current, every switch and logic
  state) for at least the most recent 20,000 time steps, so scrubbing
  within that range shows the whole circuit. Probed traces MUST be kept
  further back ([PRF-04](#23-performance-and-reliability)). Scrubbing to a
  moment older than the full-state history MUST still move the chart
  readouts, while the schematic shows "Circuit history not available this
  far back".
- **CHT-24 — Event markers.** Every event (a switch flipped, a value
  changed, a part added or removed, a part failed, a lesson step began)
  MUST appear as a small flag on the time axis. Hovering a flag MUST say
  what happened; clicking it MUST move the playhead there.

### 12.6 Measurements

- **CHT-25 — Hover crosshair.** Hovering over the chart MUST show a vertical
  crosshair with the time and every visible trace's value at that time.
- **CHT-26 — Cursors.** Two vertical cursors, **A** and **B**, MUST be
  available (toggle with `C` while the chart has focus). Each can be
  dragged or nudged with the arrow keys. A cursor readout MUST show the
  time at A, at B, the difference Δt, and 1/Δt, plus each trace's value at
  A, at B, and their difference. Cursors MUST be able to **snap** to a
  trace's peaks, valleys, zero crossings, rising and falling edges, and the
  point where the trace reaches a chosen percentage of its final value
  (63.2% by default, the one-time-constant point).
- **CHT-27 — Slope at the cursor.** The cursor readout MUST also show each
  trace's slope (rate of change) at A and at B, with units (`V/s`, `A/s`),
  because students often confuse a graph's height with its slope.
- **CHT-28 — Quick measure.** Dragging on a lane with the right mouse
  button (or with Shift held) MUST draw a measuring box that shows its
  width (Δt), its height (Δvalue), and 1/Δt, without zooming. Releasing
  the button removes it.
- **CHT-29 — Level cursors.** Each lane MUST offer two horizontal cursors
  with a readout of each level and their difference.
- **CHT-30 — Automatic measurements.** The student MUST be able to add
  measurements to any trace from a list. Results appear in a measurement
  table below the lanes and update live:

    | Measurement | Definition shown to the student |
    |---|---|
    | Value | The value at the latest moment (or the playhead) |
    | Minimum, Maximum | Lowest and highest value in the span |
    | Peak-to-peak | Maximum minus minimum |
    | Average | Mean value over the span |
    | RMS | Root-mean-square value over the span |
    | AC RMS | RMS after removing the average |
    | Frequency, Period | From the interval between rising crossings of the average |
    | Duty cycle | Fraction of each period spent above the average (or a chosen level) |
    | Rise time, Fall time | Time to go from 10% to 90% of a step (levels adjustable) |
    | Overshoot | How far a step passes its final value, as a percentage of the step |
    | Settling time | Time to stay within ±2% (adjustable) of the final value |
    | Time constant | From an exponential fitted to a rising or falling step, with fit quality |
    | Area | Integral over the span (charge for a current trace, energy for a power trace) |
    | Phase difference | Between this trace and a chosen second trace, in degrees |
    | Gain | Ratio of this trace to a chosen second trace, as a number and in dB |

- **CHT-31 — Measurement span.** Each measurement MUST use a span the
  student can choose: the visible window (default), between cursors A and
  B, or the last whole period. Measurements that need periodic signals
  (frequency, duty cycle, period-based RMS) MUST use whole periods only,
  and MUST show "—" with a reason ("fewer than two periods visible") when
  they cannot be computed.
- **CHT-32 — How it was measured.** Hovering any measurement result MUST
  show how it was computed and over what span, for example "RMS over 3
  whole periods from 2.00 ms to 52.0 ms".

### 12.7 Math traces

- **CHT-33** — The student MUST be able to add a math trace defined from
  existing traces and constants, with at least: `+`, `−`, `×`, `÷`,
  absolute value, derivative (d/dt), running integral, running average,
  square, square root, and dB (20·log10). Examples: `V1 − V2`, `V1 × I1`,
  `integral(I1)`. The units MUST be derived automatically (volts times
  amps gives watts) and shown on the axis.

### 12.8 X-Y view

- **CHT-34** — Any lane MUST be switchable to an **X-Y** view that plots one
  trace against another instead of against time, for current–voltage
  curves, Lissajous figures, hysteresis loops, and phase portraits of
  chaotic circuits. The most recent point MUST be drawn as a bright dot
  that moves with the playhead, and the trail MUST be able to fade with
  age. For compatibility with Falstad's "2-D Scope" examples, the X-Y view
  MUST also accept optional traces that set the dot's brightness and its
  red, green, and blue color.
- **CHT-35 — Lanes on the canvas.** Any lane MUST be able to pop out as a
  small chart placed on the canvas beside the circuit, which pans and
  zooms with the schematic and can be resized by its corners. This is how
  Falstad's on-canvas ("undocked") scopes are imported
  ([FIL-17](#183-falstad-compatibility)).

### 12.9 Export

- **CHT-36** — The chart MUST export as an image (PNG and SVG), and its data
  (time plus every trace, for the visible span or the full history) as a
  CSV file. The measurement table MUST copy as plain text.

## 13. Probes and Measurement Tools

Probes connect the schematic to the chart. A probe never changes the
circuit: it is a perfect, invisible observer. (Meters that do change the
circuit, as real meters do, are separate parts; see
[Section 13.5](#135-instruments-that-behave-like-real-meters).)

### 13.1 Probe kinds

| Probe | Tool key | Placed by | Measures | Sign convention |
|---|---|---|---|---|
| Voltage | `P` | Clicking a wire, terminal, or node | Node voltage relative to ground | Positive when the node is above ground |
| Differential voltage | `P` | Pressing on one node and dragging to another | Voltage of the first node minus the second | Positive when the red (first) lead is higher |
| Voltage across a part | `P` | Clicking the body of a two-terminal part | Voltage across the part | Positive when the part's first terminal (marked) is higher |
| Current | `I` | Clicking a wire segment or a part | Current through that wire or part | Positive in the direction of the arrow on the probe |
| Power | Shift+`P` | Clicking a part | Power absorbed by the part (voltage across times current through) | Positive when absorbing, negative when delivering |
| Logic | `P` on a digital node | Clicking a digital wire | Logic state (0, 1, unknown, high impedance) | — |

- **PRB-01 — Two clicks.** Any voltage, current, or power MUST be on the
  chart in at most two actions: choose the probe tool (one key or click),
  then click the target ([G2](#22-goals)).
- **PRB-02 — Quick probe.** In the ordinary Select tool, Alt+click on a wire
  MUST place a voltage probe, Alt+click on a part MUST place a current
  probe, and Alt+Shift+click on a part MUST place a power probe, so a
  practised student can probe in one action.
- **PRB-03 — Context menu.** Right-clicking a wire MUST offer **Plot
  voltage** and **Plot current**; right-clicking a part MUST offer **Plot
  voltage across**, **Plot current through**, and **Plot power**.
- **PRB-04 — Preview before placing.** While a probe tool is active,
  hovering a target MUST highlight exactly what will be measured (the
  node, the wire segment, or the part) and show the live value that the
  probe would read, before any click.
- **PRB-05 — The pointer shows the quantity.** Each probe tool MUST give
  the pointer a distinct shape: a probe tip for voltage, an open clamp for
  current, and a thermometer for power, so the student always knows which
  quantity the next click will measure.
- **PRB-06 — Current direction.** A current probe MUST show an arrow for its
  positive direction. For a wire, the default arrow points along the
  present direction of conventional current, so a new trace starts
  positive. For a part, the default arrow points into its first terminal
  (into the `+` of a source's external circuit, into a diode's anode, into
  a transistor's collector or drain). Clicking the arrow MUST reverse it,
  and the trace's sign flips at once.
- **PRB-07 — Choosing a transistor terminal.** On a part with three or more
  terminals, a current probe MUST measure the current in the terminal
  nearest the click, and the preview MUST show which terminal that is.
- **PRB-08 — Clamp, not cut.** A current probe MUST be drawn as a clamp ring
  around the wire, like a non-contact clamp meter, so it is clear that
  nothing was inserted into the circuit.

### 13.2 Probe flags

- **PRB-09** — Each probe MUST appear on the schematic as a small flag in
  its trace color, attached by a thin leader line to the point it
  measures, with its name (`V1`, `I2`) and, optionally, its live value.
- **PRB-10** — Dragging a flag MUST move only the flag (to keep the
  schematic tidy). Dragging the flag's attachment point to another node,
  wire, or part MUST move the probe; its trace then restarts, and the old
  trace SHOULD remain as a ghost ([CHT-17](#124-trace-display)).
- **PRB-11** — Selecting a flag and pressing Delete MUST remove the probe and
  its trace (undoable). **Remove all probes** MUST be in the chart menu.
- **PRB-12** — If the part or wire a probe measures is deleted, the probe
  MUST be removed with a notice ("Probe I2 removed with R3") that offers
  Undo.

### 13.3 Managing probes

- **PRB-13** — The simulator MUST support at least 16 probes at once, with
  at least eight distinct colors before any color repeats (with a
  different line style).
- **PRB-14** — Double-clicking a probe's legend chip or flag MUST open its
  settings: name, color, line style, lane, whether its value shows on the
  flag, its measurements ([CHT-30](#126-measurements)), and (for current
  probes) its direction.
- **PRB-15** — Probes, their settings, and their lanes MUST be saved with the
  circuit, in files and in share links.

### 13.4 Tools for seeing the circuit laws

These tools turn Kirchhoff's laws, Thévenin's theorem, and energy
conservation into things the student can watch.

- **PRB-16 — Loop tool (Kirchhoff's voltage law).** With the Loop tool, the
  student clicks a starting node and then successive nodes around any
  closed loop. The tool MUST draw the path, label each step with its
  voltage rise or drop (with a sign and a color: rises one color, drops
  another), show a running total, and when the loop closes show the sum,
  which MUST read 0 V (to display precision). The loop overlay MUST stay
  live while the simulation runs, so the student sees the individual
  voltages change while the sum stays zero.
- **PRB-17 — Potential profile.** A closed loop from the Loop tool SHOULD
  be viewable as a **potential profile**: a small chart with the distance
  around the loop along the bottom and the potential up the side, so that
  each source appears as a climb, each resistor as a descent, and the walk
  ends at the height where it started.
- **PRB-18 — Junction tool (Kirchhoff's current law).** Clicking a node with
  the Junction tool MUST show every current entering and leaving that
  node as an arrow with a value, and their sum, which MUST read 0 A. It
  stays live while running.
- **PRB-19 — Equivalent circuit tool.** Selecting two nodes and choosing
  **Find Thévenin and Norton equivalents** MUST show, for the circuit as
  seen from those two nodes, the Thévenin voltage, the Thévenin
  resistance, and the Norton current, with a small drawing of each
  equivalent circuit. For AC circuits it MUST ask for a frequency and show
  the equivalent impedance. A **Swap in the equivalent** button SHOULD
  replace the rest of the circuit with the equivalent (undoable), so the
  student can check that the load behaves the same.
- **PRB-20 — Energy account.** An **Energy** panel MUST list, since reset or
  between chart cursors, the energy delivered by each source and the
  energy absorbed (dissipated or stored) by each part, with the totals. The
  totals MUST balance to within 0.1%, making conservation of energy
  visible.
- **PRB-21 — Explain this value.** For a selected part, **Explain** SHOULD
  show the law that sets its present values, filled in with the live
  numbers. For example, for a resistor: "I = V ÷ R = 4.50 V ÷ 1.00 kΩ =
  4.50 mA"; for a capacitor: "i = C × dv/dt = 1.00 µF × 2.30 kV/s =
  2.30 mA". The explanation updates as the simulation runs.

### 13.5 Instruments that behave like real meters

Probes are ideal. Real meters are not, and students must learn to use
them. The library therefore also has meters that are parts of the circuit.

- **PRB-22 — Voltmeter.** A voltmeter part MUST connect across two points
  and show its reading on its face. It MUST have an input resistance,
  infinite by default (ideal) and set to 10 MΩ when realistic meters are on
  ([Section 16](#16-realism-ratings-and-failures)), so the student can see
  meter loading on high-resistance circuits.
- **PRB-23 — Ammeter.** An ammeter part MUST be inserted in series and show
  its reading on its face. Its resistance MUST be zero by default and a
  small burden resistance when realistic meters are on. An ammeter placed
  in parallel with a part MUST trigger the warning in
  [EDT-39](#77-checking-the-circuit).
- **PRB-24 — Multimeter.** A virtual digital multimeter MUST be available as
  a floating instrument panel with a dial and two leads that the student
  drags onto the circuit:

    | Dial setting | Behaviour |
    |---|---|
    | DC volts | Average voltage between the leads |
    | AC volts | True-RMS voltage of the AC part between the leads |
    | DC amps, AC amps | Current through the meter, which must be **inserted in series** by dropping it into a wire gap ([EDT-06](#71-placing-components)); with the leads across a voltage source, it behaves as a near-short, and with realistic ratings on, its internal fuse blows |
    | Ohms | Resistance between the leads, for parts disconnected from power; on a powered circuit it MUST show "– – –" with the note "Turn off the power to measure resistance" |
    | Diode test | Forward voltage of a diode between the leads |
    | Continuity | A tone and a mark when the leads are joined by less than 50 Ω |

    The display MUST show 4 digits with automatic ranging, a range-hold
    option, and units. Its leads MUST be red and black, and swapping them
    MUST flip the sign of the reading.

- **PRB-25 — Oscilloscope instrument.** A virtual two-channel oscilloscope
  with front-panel controls (volts per division, time per division, trigger
  level and slope, coupling) MAY be offered for lab preparation. It shows
  the same data as the chart, presented like the instrument in the
  school lab.

## 14. Analysis Views

The live chart shows what happens over time. The analysis views answer
other questions: what are all the steady values, how does the circuit
respond to different frequencies, what happens if a part's value changes,
and what frequencies a signal contains.

- **ANL-01 — Where analyses live.** Analyses MUST open as tabs in the chart
  panel: **Time** (the live chart), **DC**, **Frequency**, **Sweep**, and
  **Spectrum**. Each tab follows the same responsive rules as the chart
  ([Section 5](#5-responsive-behavior)). Every analysis result MUST have
  cursors, hover readouts, ghost copies, and image and CSV export, like
  the time chart.
- **ANL-02 — Plain-language scope.** Each analysis MUST state in one plain
  sentence what it computes, for example "Frequency response: how the
  circuit responds to small sine waves of each frequency, around its DC
  operating point."

### 14.1 DC operating point

- **ANL-03** — The **DC** tab MUST compute the circuit's steady state with
  every source at its DC value (capacitors charged and carrying no
  current, inductors carrying steady current with no voltage across
  them) and show:

    - a **Nodes** table: node name, voltage;
    - a **Parts** table: label, type, voltage across, current through,
      power, and for semiconductors the operating region (for example
      "forward biased", "saturation", "active");
    - a **Power balance** line: total power delivered by sources and total
      absorbed by parts, which MUST be equal to display precision.

- **ANL-04** — Clicking a row MUST select and highlight the matching node or
  part on the schematic, and selecting a part on the schematic MUST
  highlight its row.
- **ANL-05** — The tables MUST recompute automatically whenever the circuit
  changes, and MUST be sortable by any column.
- **ANL-06** — **Annotate schematic** MUST place the operating-point values
  on the schematic ([ANI-24](#114-values-on-the-schematic)).
- **ANL-07** — An option **Snapshot of the running circuit** MUST instead
  show the tables for the present moment of the live simulation (or the
  playhead), which is not the same as the DC steady state when the
  circuit is changing.

### 14.2 Frequency response (Bode plot)

- **ANL-08 — Setting it up.** The student MUST choose an **input** (any
  voltage or current source; by default the first AC source) and one or
  more **outputs** (any voltage or current probes). The input is treated
  as a small sine wave of 1 V (or 1 A) amplitude at each frequency.
- **ANL-09 — Sweep range.** The default range MUST be 1 Hz to 1 MHz with 50
  points per decade, on a logarithmic frequency axis. The student MUST be
  able to change the start, stop, and points per decade, and choose a
  linear axis.
- **ANL-10 — Plots.** The tab MUST show two lanes sharing the frequency
  axis: **gain** (in dB by default, or as a plain ratio) and **phase** (in
  degrees). Each output gets its own trace in its probe's color.
- **ANL-11 — Automatic markers.** The plot MUST mark and label, where they
  exist: the −3 dB frequencies (cutoff, with the bandwidth between them),
  the peak gain and its frequency (resonance), the frequency where the
  gain crosses 0 dB, and the frequency where the phase passes −45°, −90°,
  and −180°.
- **ANL-12 — Live response.** When the circuit changes (for example, a
  slider moves C1), the response MUST recompute and redraw within half a
  second, so the student can watch the cutoff frequency slide. The
  previous curve SHOULD remain as a ghost.
- **ANL-13 — Impedance.** The Frequency tab MUST also offer an **Impedance**
  view: the magnitude and phase of the impedance a chosen source sees, or
  of a chosen part, across the frequency range.
- **ANL-14 — Link to the time view.** Clicking a frequency on the plot MUST
  offer **Try this frequency**, which sets the input source to a sine at
  that frequency and switches to the Time tab with a fitted time window, so
  the student sees the gain and phase as real waveforms.
- **ANL-15 — Honesty about non-linearity.** For circuits with non-linear
  parts, the tab MUST say that the result is a small-signal response around
  the DC operating point, and that large signals may clip.

- **ANL-16 — Phasors.** For circuits driven by sine sources of one
  frequency, the Frequency tab MUST offer a **Phasor** view: at a chosen
  frequency, every probed voltage and current is drawn as a rotating arrow
  (length = amplitude, angle = phase) on one diagram. A **Phasors on
  schematic** option SHOULD draw a small phasor next to each probed node or
  part. When the simulation runs, the arrows MAY rotate in slow motion, with
  their shadows on the real axis tracing the waveforms in the Time tab.

### 14.3 Parameter sweep

- **ANL-17 — Choosing what to vary.** The student MUST be able to choose any
  numeric property of any part (for example R1's resistance or V1's
  voltage) and give a range as start, stop, and number of steps, spaced
  linearly or logarithmically, or as a list of values (such as `1k, 2.2k,
  4.7k, 10k`).
- **ANL-18 — Three kinds of sweep.**

    | Sweep kind | What runs for each value | What the student sees |
    |---|---|---|
    | **Transient family** | The time simulation from reset for a chosen duration | All the runs' traces overlaid on the same axes, colored along a gradient, with a legend of values |
    | **Measurement versus parameter** | The time simulation, then a chosen chart measurement (final value, peak, RMS, frequency, rise time, and so on) | One curve: the measurement plotted against the parameter |
    | **DC sweep** | The DC operating point | Chosen node voltages or part currents plotted against the parameter, such as a diode's current against its voltage |

- **ANL-19 — Two parameters.** The DC sweep MUST allow a second, outer
  parameter, producing a family of curves (for example a transistor's
  collector current against collector-emitter voltage, one curve for each
  base current).
- **ANL-20 — Progress.** Long sweeps MUST show progress and a Cancel button,
  and MUST keep partial results if cancelled.
- **ANL-21 — Picking a result.** Clicking one curve in a family MUST show its
  parameter value and offer **Use this value**, which sets the part to it.

### 14.4 Spectrum

- **ANL-22 — Spectrum of a trace.** The **Spectrum** tab MUST show the
  frequency content of any chosen trace over the visible window, between
  cursors A and B, or live (recomputed continuously over the most recent
  span).
- **ANL-23 — Options.** The student MUST be able to choose the window shape
  (Hann by default, rectangular, flat-top), a linear or logarithmic
  frequency axis, and magnitudes in dB or in RMS units.
- **ANL-24 — Harmonics.** The tab MUST find the fundamental frequency and
  label the harmonics (2nd, 3rd, ...), and report total harmonic
  distortion (THD) as a percentage.
- **ANL-25 — Resolution.** The tab MUST show its frequency resolution and
  explain how to improve it ("Resolution is 10 Hz. Capture a longer span
  for finer detail.").

## 15. Interactive Controls While Running

- **CTL-01 — Switches.** Clicking a switch MUST toggle it while the
  simulation runs or is paused, in the Select tool, without selecting it.
  (Selecting a switch for editing needs a click on its label, a box
  selection, or Shift+click.) With keyboard focus on a switch, Space MUST
  toggle it.
- **CTL-02 — Push buttons.** A push button MUST stay pressed only while the
  mouse button (or Space) is held down, and spring back when released.
  Normally-open and normally-closed versions MUST exist.
- **CTL-03 — Multi-way switches.** Clicking a selector switch (SPDT, DPDT,
  rotary) MUST advance it to its next position; clicking a specific
  contact MUST move it straight there.
- **CTL-04 — Potentiometers.** A potentiometer's wiper MUST be draggable
  along its symbol. Its position MUST also be adjustable with a slider and
  with the mouse wheel while the pointer is over it (when the canvas has
  focus).
- **CTL-05 — Slider panel.** Sliders added with **Add slider**
  ([EDT-30](#74-editing-values)) MUST appear in a slider panel docked above
  the inspector (a drawer in the Narrow class). Each slider MUST show its
  part and property name, its value with units, its minimum and maximum
  (editable), a linear or logarithmic scale, and an optional step. Arrow
  keys MUST nudge a focused slider by one step, Page Up and Page Down by
  ten.
- **CTL-06 — Live response.** Moving any control MUST update the simulation
  continuously while dragging, not only on release
  ([PRF-02](#23-performance-and-reliability)).
- **CTL-07 — Logic inputs.** Clicking a logic input MUST toggle it between 0
  and 1. Clock sources MUST show their frequency and be pausable on their
  own.
- **CTL-08 — Scheduled actions.** A switch, button, or logic input MUST be
  able to carry a schedule of timed actions, such as "close at 1 ms, open at
  5 ms", applied after each reset. This makes experiments repeatable and is
  needed by sweeps ([Section 14.3](#143-parameter-sweep)) and lessons.

- **CTL-09 — Keys for controls.** Any switch, push button, or logic input
  MUST accept a keyboard key of its own (for example `1` for S1), so a
  student can operate several controls quickly or hold two buttons at
  once. The key is shown on the part's label.
- **CTL-10 — Linked controls.** Switches that share a link label MUST flip
  together, and potentiometers that share a link group MUST move together
  (for example both halves of a stereo volume control).
- **CTL-11 — Wheel stepping.** With **Edit values with mouse wheel** turned
  on (off by default), turning the wheel over a resistor, capacitor, or
  inductor MUST step its value through the E12 series, showing the new
  value in a small pop-up.

## 16. Realism, Ratings, and Failures

By default every part is ideal: wires have no resistance, sources have no
internal resistance, meters do not load the circuit, and nothing can be
damaged. Realism is turned on deliberately, so the student always knows
which world they are in.

### 16.1 Two separate switches

- **RLM-01 — Realistic parts.** The circuit setting **Realistic parts** MUST
  give new and existing parts realistic non-ideal properties where the
  part has them: battery internal resistance, wire resistance, meter input
  resistance and burden ([PRB-22](#135-instruments-that-behave-like-real-meters)),
  capacitor leakage and series resistance, op-amp finite gain, bandwidth,
  slew rate and output limits. Each property MUST also be editable part by
  part.
- **RLM-02 — Realistic ratings.** The circuit setting **Realistic ratings**
  MUST give parts ratings and allow them to fail when overstressed
  ([Section 16.2](#162-ratings-and-failure)).
- **RLM-03 — Always visible.** A badge in the top bar MUST always show the
  current state: **Ideal**, **Realistic parts**, **Realistic ratings**, or
  both. Clicking it MUST open the settings.

### 16.2 Ratings and failure

- **RLM-04 — Ratings.** With realistic ratings on, parts MUST carry ratings
  with sensible defaults that the student can edit:

    | Part | Rating (default) | Failure when exceeded |
    |---|---|---|
    | Resistor | Power, 0.25 W | Opens, drawn scorched |
    | LED | Forward current, 20 mA continuous (30 mA absolute) | Opens, drawn dark and cracked |
    | Lamp | Rated voltage and power | Filament opens |
    | Fuse | Current, 1 A, with a time-delay curve | Opens, drawn with a broken link |
    | Capacitor | Voltage, 25 V; electrolytics also reverse voltage | Shorts or opens; electrolytic drawn bulging |
    | Diode | Forward current, reverse voltage | Shorts |
    | Transistor (BJT, MOSFET) | Collector/drain current, voltage, power | Shorts collector to emitter (drain to source) |
    | Battery | Capacity in mAh | Voltage sags as charge is used, then falls to zero |
    | Multimeter | Current-range fuse | Fuse opens; meter reads zero in amps ranges |

- **RLM-05 — Warning before failure.** A part above its continuous rating
  MUST show an amber warning badge and a warning-list entry with the
  numbers ("R1 is dissipating 0.40 W; its rating is 0.25 W"). It MUST fail
  only when the overstress lasts long enough to heat it past its limit,
  using a simple heating model so that a brief overload survives and a
  large overload fails quickly. The badge MUST show a heat bar that fills
  toward failure.
- **RLM-06 — Failure.** When a part fails, the simulator MUST: change the
  part's electrical behavior to the failure mode in the table; draw it
  damaged; show a short puff-of-smoke effect (subject to
  [ACC-13](#223-color-motion-and-flicker) and
  [ACC-14](#223-color-motion-and-flicker)); add an event marker to the
  chart; and add a message explaining why it failed and how to prevent it.
  For an LED: "D1 failed: 87 mA flowed through it for 0.4 s; its limit is
  30 mA. Add a resistor in series. For a 9 V battery and a red LED, about
  360 Ω gives 20 mA."
- **RLM-07 — Repair.** A failed part MUST be restorable with **Repair**
  (context menu) or **Repair all** (Simulation menu), and with Undo. Reset
  MUST NOT repair parts automatically, so the lesson of the failure stays
  on screen.
- **RLM-08 — Hints in ideal mode.** With ratings off, a part far beyond a
  typical rating (more than ten times) SHOULD show a small grey info badge
  ("2.1 A through D1. A real LED would be destroyed."), never a failure.
  This hint MUST be switchable off in settings.

## 17. Digital Logic and Mixed Signal

### 17.1 Logic levels

- **DIG-01 — Levels.** Digital parts MUST work from a circuit-wide logic
  supply, 5 V by default, editable per circuit and per part. Inputs MUST
  read high above a threshold (half the supply by default) and low below
  it, with optional hysteresis for Schmitt-trigger inputs.
- **DIG-02 — Four states.** Every digital signal MUST be in one of four
  states: **0**, **1**, **X** (unknown, such as two outputs fighting or an
  input between thresholds) and **Z** (high impedance, nothing driving
  it).
- **DIG-03 — State colors.** Digital wires MUST be colored by state:
  bright green for 1, dark green for 0, blue for Z, and red for X, with
  `0`, `1`, `Z`, and `X` text on the wire when zoomed in
  ([ACC-11](#223-color-motion-and-flicker)).
- **DIG-04 — Analog meets digital.** Digital outputs MUST drive analog
  loads as real voltages through a configurable output resistance, so an
  LED on a gate output glows and a heavy load pulls the output down.
  Analog voltages MUST drive digital inputs through the thresholds above.

### 17.2 Timing

- **DIG-05 — Propagation delay.** Each digital part MUST have a propagation
  delay, zero by default, settable per part or for the whole circuit.
  With delays on, glitches (brief false outputs) MUST appear on the chart
  and on the schematic exactly as a real circuit would produce them.
- **DIG-06 — Clocks.** Clock sources MUST have a frequency, a duty cycle,
  and a start phase.

### 17.3 Digital traces

- **DIG-07 — Logic lanes.** Logic probes MUST plot in compact lanes (about
  24 px high) as high/low lines, with X shown as a red band and Z as a
  mid-level blue line.
- **DIG-08 — Buses.** The student MUST be able to group several logic
  traces into a **bus** lane that shows the combined value as a sequence of
  labelled segments, in binary, decimal, or hexadecimal.
- **DIG-09 — Edge cursors.** Chart cursors MUST snap to the edges of logic
  traces, making it easy to measure propagation delay and clock-to-output
  times.

- **DIG-10 — Truth tables.** For any purely combinational subcircuit or
  selection of gates, **Show truth table** SHOULD list the output for every
  input combination, and **Build from truth table** SHOULD create a gate
  circuit (sum of products) from a table the student types in.

### 17.4 Building blocks

- **DIG-11** — The digital library ([Section 9.7](#97-amplifiers-and-integrated-circuits)) MUST
  include gates, flip-flops, latches, counters, shift registers,
  multiplexers, decoders, adders, memory, displays, analog-to-digital and
  digital-to-analog converters, and a **custom logic** part defined by a
  truth table or a short set of rules.

## 18. Files, Sharing, and Falstad Compatibility

There are no accounts. A student's work lives in files they save, in links
they share, and in their own browser's storage.

### 18.1 The circuit file

- **FIL-01 — Open format.** Circuits MUST be saved in a documented, versioned,
  human-readable text format. A person reading the file must be able to
  see each part, its value, and its connections. The format's
  documentation MUST be published with the simulator.
- **FIL-02 — What a file holds.** A circuit file MUST hold everything needed
  to restore the student's session as they left it: parts and their
  properties, wires, net labels, annotations, subcircuit definitions
  used, probes and their settings, chart lanes and settings, sliders,
  scheduled actions, analysis settings, circuit settings (realism, logic
  supply, starting state, noise seed), the view (zoom and center), and the
  circuit's title and description.
- **FIL-03 — Forward and backward.** Newer versions of the simulator MUST
  open every older file. A file from a newer version opened in an older
  version MUST open as far as possible, with unknown parts shown as
  placeholders and a notice.

### 18.2 Saving, opening, and sharing

- **FIL-04 — Save and open.** **Save** (Ctrl+S) MUST save the circuit as a
  file on the student's computer, asking for a name the first time.
  **Open** (Ctrl+O) MUST open a circuit file. Dropping a circuit file onto
  the simulator MUST also open it. Opening MUST never discard unsaved work
  without asking.
- **FIL-05 — Share link.** **Share → Copy link** MUST copy a link that
  contains the whole circuit in compressed form, so that anyone who opens
  the link sees the same circuit, with no server storing it.
- **FIL-06 — Long circuits.** If a circuit is too large for a reliable link
  (over about 8,000 characters), the simulator MUST say so and offer to
  save a file instead.
- **FIL-07 — Opening a share link.** Opening a share link MUST restore
  everything listed in [FIL-02](#181-the-circuit-file), and MUST open a
  copy: changes never alter what the link contains.
- **FIL-08 — My circuits.** The simulator MUST keep a **My circuits** list in
  the browser's storage, with each circuit's name, a thumbnail, and the
  time it was last changed, so students can keep several circuits
  without managing files. It MUST explain that this list lives only in
  this browser.
- **FIL-09 — Recovery.** Unsaved changes MUST be kept in browser storage as
  they happen ([PRF-06](#23-performance-and-reliability)), and offered
  back after a crash or a closed tab.
- **FIL-10 — Description.** Each circuit MUST have an optional description,
  written in Markdown with simple math, shown in a collapsible panel when
  the circuit is opened. Part labels in the description (such as `R1`)
  MUST be clickable, highlighting the part.
- **FIL-11 — Images.** The schematic MUST export as PNG and SVG, at the
  current view or fitted to the circuit, with or without live values,
  probes, and the voltage colors. The chart exports as described in
  [CHT-36](#129-export).
- **FIL-12 — Printing.** **Print** MUST produce a page with the schematic,
  the chart, and the description, laid out for paper.
- **FIL-13 — Examples library.** **File → Examples** MUST open a browsable,
  searchable library of example circuits, organized in categories, that
  works offline ([PRF-07](#23-performance-and-reliability)).

### 18.3 Falstad compatibility

The book's [List of Circuits](../list-of-circuits.md) lists 366 example
circuits from Paul Falstad's simulator. Many teachers also have Falstad
share links in their notes. The new simulator must open all of them.

- **FIL-14 — Falstad text files.** The simulator MUST open both of
  Falstad's circuit formats: the original line-based text (a `$` settings
  line followed by one element per line, used by most of the example
  files) and the newer XML format (beginning `<cir`), which Falstad's
  simulator now writes. It MUST open them from a file, from **Import →
  Falstad text**, or by pasting onto the canvas
  ([EDT-23](#73-selecting-and-arranging)).
- **FIL-15 — Falstad links.** The simulator MUST open Falstad share links,
  whose circuit travels in the link itself (compressed in the `ctz`
  parameter or uncompressed in `cct`), and links that name a library file
  (`startCircuit`). Pasting a Falstad link into **Import → Falstad link**
  MUST open it.
- **FIL-16 — Unsupported elements.** Any Falstad element the simulator does
  not support MUST become a labelled placeholder with the same terminals,
  drawn in the warning color, and the import MUST list every such element.
  A circuit with placeholders opens but does not run until they are
  replaced or removed.
- **FIL-17 — Faithful conversion.** Imported circuits MUST keep Falstad's
  layout (its 16-pixel grid becomes one grid unit), part values and
  models, switch positions, saved part states (such as capacitor
  voltages), sliders, subcircuit models, and simulation settings (time
  step, speed, current speed, voltage color range). Falstad's voltmeters
  keep the input resistance saved with them (10 MΩ for newer ones). Falstad's scopes MUST become probes
  and chart lanes showing the same quantities (voltage, current, power,
  charge, or X-Y), with docked scopes as lanes and on-canvas scopes as
  lanes on the canvas ([CHT-35](#128-x-y-view)). A circuit's built-in hint
  (such as its RC time constant) MUST become a line in its description.
- **FIL-18 — The Falstad library built in.** The examples library
  ([FIL-13](#182-saving-opening-and-sharing)) MUST include all 366 Falstad
  example circuits, in Falstad's categories, with credit to their authors
  (see [Credits](#credits)).
- **FIL-19 — Opening from the book.** The simulator MUST open any library
  example from a link of the form `…/simulator/?example=lrc.txt`
  ([Section 19.1](#191-embed-parameters)), so that the book's List of
  Circuits page can give every example an **Open** link.
- **FIL-20 — Exporting to Falstad.** The simulator MAY export a circuit as
  Falstad text, for circuits that use only parts Falstad supports.

## 19. Embedding in Textbook Pages

The simulator MUST run inside an iframe on a MkDocs Material page, so a
chapter can place a working circuit right next to the text that explains
it.

### 19.1 Embed parameters

An embedded simulator is configured entirely by its URL. The parameters
are:

| Parameter | Values | Default | Effect |
|---|---|---|---|
| `circuit` | URL of a circuit file (native or Falstad text) | none | Loads that circuit |
| `example` | File name from the built-in library, such as `lrc.txt` | none | Loads a library circuit |
| `ctz` | Falstad compressed circuit text | none | Loads a Falstad share link's circuit (see [FIL-14](#183-falstad-compatibility)) |
| `c` | Native compressed circuit | none | Loads a native share link's circuit |
| `lesson` | URL of a lesson file | none | Starts lesson mode with that lesson |
| `mode` | `edit`, `run`, `view`, `lesson` | `edit` (or `lesson` if `lesson` is given) | See [EMB-02](#192-embed-modes) |
| `panels` | Comma list of `palette`, `chart`, `inspector`, `status`, `topbar` | all | Shows only the listed panels |
| `layout` | `auto`, `side`, `stacked`, `circuit`, `chart` | `auto` | Forces an arrangement; `auto` follows [Section 5](#5-responsive-behavior) |
| `autorun` | `1`, `0` | `1` | Starts running on load |
| `window` | Time with units, such as `5ms` | from file | Chart time window |
| `speed` | Number from 1 to 100 | from file | Simulation speed setting |
| `current` | `conventional`, `electron`, `off` | learner setting | Animation convention |
| `realistic` | `1`, `0` | from file | Realistic ratings on or off |
| `theme` | `auto`, `light`, `dark` | `auto` | Color theme |
| `symbols` | `ansi`, `iec` | learner setting | Schematic symbol style |
| `lock` | Comma list of component labels, or `all` | none | Locks those parts against editing |
| `id` | Short text | generated | Names this embed for host messages and xAPI |
| `xapi` | `1`, `0` | `0` | Allows xAPI reporting once the host configures it ([Section 21](#21-xapi-learning-events)) |
| `lang` | Language code | browser language | Interface language |

- **EMB-01** — Unknown parameters MUST be ignored without error. Invalid
  values MUST fall back to the default and add a warning to the warning
  list, not stop the circuit from loading.

### 19.2 Embed modes

- **EMB-02** — The four modes MUST behave as follows:

    | Mode | What the reader can do |
    |---|---|
    | `edit` | Everything the full simulator allows |
    | `run` | Run, pause, reset, flip switches, move sliders, add and remove probes, use the chart and analyses; cannot add, delete, or rewire parts, but can change values of unlocked parts |
    | `view` | Watch the animation and chart, hover for readouts, pause and scrub; no changes |
    | `lesson` | Whatever the lesson's permissions allow ([Section 20](#20-guided-lesson-mode)) |

- **EMB-03** — Every embedded simulator MUST show an **Open in full
  simulator** control that opens the current circuit, including the
  reader's changes, in a new browser tab in `edit` mode.
- **EMB-04** — A **Reset to original** control MUST restore the circuit as
  the page author published it.

### 19.3 Living on a page

- **EMB-05 — Scroll safety.** Over an embedded canvas, the mouse wheel MUST
  scroll the page, not zoom the circuit, unless the reader holds Ctrl (or
  Cmd) or has clicked the simulator first. The first time the wheel is used
  over the canvas, a hint "Hold Ctrl and scroll to zoom" MUST appear for
  two seconds.
- **EMB-06 — Keyboard focus.** Keyboard shortcuts MUST work only while the
  simulator has focus, so they never steal keys from the host page. A
  visible focus ring MUST show when the simulator has focus. Pressing Esc
  twice MUST release focus back to the page.
- **EMB-07 — Off-screen pausing.** When an embedded simulator is scrolled
  out of view, its animation MUST pause and its simulation SHOULD pause,
  resuming where it left off when it scrolls back into view. Several
  embeds on one page MUST run independently.
- **EMB-08 — Height.** The simulator MUST report its preferred height to
  the host page whenever its content height changes (for example, when a
  chart lane is added), so the host can resize the iframe without inner
  scrollbars. If the host does not resize it, the simulator MUST still fit
  its iframe using the height rules in [Section 5.2](#52-height-classes).
- **EMB-09 — Theme.** With `theme=auto`, the simulator MUST follow the
  reader's light or dark preference, matching a MkDocs Material page that
  switches theme.

### 19.4 Messages with the host page

The simulator and the page around it MUST be able to exchange messages:

- **EMB-10** — Simulator to host: `ready`, `preferredHeight`,
  `runStateChanged`, `circuitChanged`, `lessonProgress`, and (when the host
  relays xAPI) `xapiStatement`.
- **EMB-11** — Host to simulator: `loadCircuit`, `setValue` (a component
  property), `setSwitch`, `run`, `pause`, `reset`, `addProbe`,
  `configureXapi`, and `getState` (reply with the circuit, probes, and
  current readouts).
- **EMB-12** — The simulator MUST accept host messages only from the
  page that embeds it, and MUST ignore malformed messages.

## 20. Guided Lesson Mode

Lesson mode turns a circuit into a short guided activity. It follows a
predict, observe, explain cycle: the learner commits to a prediction,
runs the circuit to test it, and explains what happened.

### 20.1 Lesson files

- **LES-01** — A lesson MUST be a single, human-readable text file that
  contains:

    - metadata: title, estimated time, learning objectives, and the
      concepts it teaches (matching concept names in the book's learning
      graph);
    - the starting circuit (inline, or a reference to a circuit file);
    - permissions: which parts are locked, which palette items and tools
      are available, and whether the chart and analyses are visible;
    - an ordered list of steps.

- **LES-02** — A lesson file MUST NOT be able to run code. Everything it
  does comes from the step types and checks defined here.

### 20.2 Step types

| Step type | What the learner does | How it completes |
|---|---|---|
| **Read** | Reads text, may look at a highlighted part | Learner presses Next |
| **Predict: number** | Types a value with units, such as `2.5 V` | Any valid value is accepted and stored; checked later in an Observe step |
| **Predict: choice** | Picks one or more options | Any choice is accepted and stored |
| **Predict: rank** | Drags items into order, such as bulbs from brightest to dimmest | Any order is accepted and stored |
| **Predict: sketch** | Draws the expected waveform on a chart lane with the mouse | Any sketch is accepted and stored |
| **Do** | Changes the circuit: adds a part, rewires, sets a value, places a probe | A check passes ([Section 20.3](#203-checks)) |
| **Observe** | Runs the circuit and watches; the stored prediction is shown beside the result | Simulation has run for the time the step sets |
| **Measure** | Uses a probe or the multimeter and types the reading | Typed value is within the step's tolerance of the true value |
| **Explain** | Writes one or more sentences, or picks a reason from a list | Text is not empty, or a choice is made |
| **Troubleshoot** | Finds a hidden fault and clicks the faulty part | Learner clicks the right part; wrong clicks are recorded |

- **LES-03 — Blind prediction.** During any Predict step, the lesson MUST
  be able to hide readouts, traces, and the animation so the prediction is
  genuinely the learner's own. The simulation MUST NOT run until the
  prediction is submitted, if the lesson asks for that.
- **LES-04 — Prediction versus result.** After a Predict step, the next
  Observe step MUST show the prediction next to what happened: the typed
  number beside the measured value, the chosen option beside the correct
  one, the ranked list beside the true order, and the sketch drawn as a
  dashed line on the same chart lane as the real trace.
- **LES-05** — A sketch prediction MUST be drawn in the lane's own units and
  time scale, so it lines up exactly with the real trace that follows.

### 20.3 Checks

A check is a condition on the circuit or the learner's actions. Lessons
combine checks with "all of" and "any of".

- **LES-06** — The simulator MUST support at least these checks:

    - a part of a given type exists, optionally with a given label;
    - two terminals or nodes are connected (or not connected);
    - a property is equal to, above, below, or within a range;
    - a switch is open or closed;
    - a probe of a given kind is on a given node, wire, or part;
    - a measured quantity (voltage, current, power, or any chart
      measurement such as RMS or frequency) is within a tolerance of a
      target, at a moment or over a time span;
    - an analysis of a given kind has been run;
    - a part has failed (realistic mode) or has not failed;
    - the simulation has run for at least a given time;
    - a digital block's truth table, tested by stepping through every
      input combination, matches a given table (a test bench).

- **LES-07 — Random faults.** A Troubleshoot step MUST be able to list
  several possible faults (for example "R2 open", "C1 shorted", "wire 4
  broken") and pick one at random for each learner, so that classmates
  cannot simply share the answer.
- **LES-08** — Checks MUST be re-evaluated continuously, so a Do step
  completes the moment the learner's change satisfies it, with a short
  confirmation ("Nice — the LED is now in series with R1").

### 20.4 Guidance and feedback

- **LES-09 — Spotlights.** A step MUST be able to spotlight parts, wires,
  probes, chart lanes, or controls with a pulsing outline and an arrow
  callout, and dim everything else.
- **LES-10 — Hints.** Each step MAY carry up to three hints that the learner
  reveals one at a time, and a final **Show me** that performs the step
  for them. Hint use MUST be recorded ([Section 21](#21-xapi-learning-events)).
- **LES-11 — Feedback on common mistakes.** A lesson MUST be able to attach
  targeted feedback to specific wrong states, such as "The ammeter is in
  parallel with the lamp, so it is shorting it out. Ammeters go in
  series."
- **LES-12 — Navigation.** The lesson panel MUST show step *n* of *N*, a
  Back button, a Next button that enables when the step is complete, and
  a Reset Step button that restores the circuit to the start of that
  step.
- **LES-13 — Resume.** Lesson progress MUST be saved in browser storage and
  restored when the learner returns to the same page.
- **LES-14 — Completion.** The last step MUST show a summary: steps done,
  predictions compared with results, and hints used.

### 20.5 Writing lessons

- **LES-15** — An **Author mode** SHOULD let a lesson writer build checks
  from the live circuit (for example, select R1 and choose "Check this
  value") and preview the lesson as a learner would.
- **LES-16** — The simulator MUST validate a lesson file on load and list
  any problems (unknown part labels, impossible checks) for the author
  rather than failing silently.

## 21. xAPI Learning Events

The simulator can report what a learner does as xAPI statements to a
learning record store (LRS), so a teacher can see how students used a
simulation and how a lesson went.

### 21.1 When reporting happens

- **XAP-01** — Reporting MUST be off unless the host page turns it on:
  the embed URL contains `xapi=1` **and** the host sends a
  `configureXapi` message ([EMB-11](#194-messages-with-the-host-page)).
  The configuration either names an LRS endpoint and supplies credentials,
  or asks the simulator to relay every statement to the host page, which
  forwards it.
- **XAP-02** — LRS credentials MUST NOT be accepted in URL parameters.
- **XAP-03** — While reporting is on, the simulator MUST show a small,
  visible "Activity recording on" indicator. Clicking it MUST show, in
  plain language, what kinds of actions are being recorded.
- **XAP-04** — The learner's identity comes only from the host. Without
  one, statements MUST use an anonymous, per-browser identifier.
- **XAP-05** — Free-text answers (Explain steps) MUST be sent only if the
  lesson file marks them for reporting.
- **XAP-06** — Reporting MUST never slow down or block the simulator.
  Statements that cannot be sent MUST be queued in browser storage and
  retried, and dropped after seven days.

### 21.2 What is reported

| Learner action | xAPI verb | Object | Key result or context data |
|---|---|---|---|
| Opens an embedded simulation | `launched`, then `initialized` | The circuit or lesson | Embed id, page address, mode |
| Starts, pauses, or resets the simulation | `interacted` | The simulation | Action, simulation time |
| Adds, deletes, or rewires a part | `interacted` | The part | Part type, label, connections |
| Changes a value (typed or slider) | `interacted` | The part's property | Old and new value; slider drags send **one** statement when the drag ends |
| Flips a switch or presses a button | `interacted` | The switch | New state |
| Places or removes a probe | `interacted` | The probe | Probe kind and where it was placed |
| Runs an analysis | `experienced` | The analysis | Kind and settings |
| Submits a prediction | `answered` | The lesson step | The prediction |
| Completes a Measure or Troubleshoot step | `answered` | The lesson step | Value or chosen part; success true or false |
| Reveals a hint or uses Show me | `interacted` | The hint | Hint number |
| A check passes or fails on a Do step | `attempted`, then `passed` | The lesson step | Attempts before passing |
| A part fails in realistic mode | `experienced` | The part | Cause, such as over-current |
| Moves to the next step | `progressed` | The lesson | Step number, percent complete |
| Finishes the lesson | `completed` | The lesson | Duration, hints used, predictions compared with results |
| Leaves the page | `terminated` (or `suspended` if a lesson is unfinished) | The circuit or lesson | Total active time |

- **XAP-07** — Activity identifiers MUST be stable: the same circuit or
  lesson on the same page always produces the same identifier, so results
  from many students can be combined.
- **XAP-08** — High-frequency activity (dragging, continuous running) MUST
  be summarized, with no more than one statement per second from any single
  continuous action.

## 22. Accessibility

- **ACC-01** — The simulator MUST meet WCAG 2.2 level AA for all of its
  controls, menus, dialogs, panels, and text.

### 22.1 Keyboard-only operation

- **ACC-02** — Every feature MUST be usable without a mouse, including
  placing parts, wiring, placing probes, moving chart cursors, and lesson
  steps.
- **ACC-03 — Moving around the circuit.** With focus on the canvas, Tab and
  Shift+Tab MUST move between parts in reading order (top-left to
  bottom-right), and the arrow keys with Alt MUST move to the part
  connected in that direction. The focused part MUST have a visible
  focus outline distinct from the selection outline.
- **ACC-04 — Keyboard wiring.** With a part focused, the `[` and `]` keys
  MUST cycle through its terminals. Pressing `W` on a terminal starts a
  wire; the arrow keys then move between terminals and wire ends in that
  direction, and Enter connects. Esc cancels.
- **ACC-05 — Keyboard placement.** From the palette (or the quick-add box,
  [EDT-03](#71-placing-components)), Enter places the chosen part at the
  center of the view, already selected, ready to move with the arrow
  keys.

### 22.2 Screen readers

- **ACC-06 — Circuit description.** The simulator MUST offer a text view of
  the circuit as a structured list, for example: "Battery V1, 9 volts,
  from ground to node A. Resistor R1, 1 kilohm, from node A to node B.
  LED D1 from node B to ground." Each entry MUST include live values when
  the simulation is running.
- **ACC-07** — Every part MUST have an accessible name that includes its
  type, label, value, and (when running) its voltage and current.
- **ACC-08** — Important events (errors, failures, lesson feedback, check
  results) MUST be announced through a polite live region, no more than
  once every two seconds per kind of event.
- **ACC-09 — Chart alternatives.** The chart MUST offer a data table view
  (time and value of each trace at chosen intervals), a table of the
  measurements in [Section 12.6](#126-measurements), and a short generated
  description of each trace, such as "V1 rises from 0 V to 5 V and passes
  3.16 V at 1.0 ms."
- **ACC-10** — The simulator SHOULD offer audio sonification of a selected
  trace, with pitch rising with the value.

### 22.3 Color, motion, and flicker

- **ACC-11** — Color MUST never be the only way information is shown. Each
  probe and trace MUST also have a distinct line style and marker shape,
  wire voltage colors MUST be paired with hover readouts and optional
  numeric labels, and logic states MUST show `0`/`1` text when zoomed in.
- **ACC-12** — The simulator MUST provide a color-blind-safe voltage color
  scale and a high-contrast theme, in addition to the default light and
  dark themes.
- **ACC-13 — Reduced motion.** When the reader's system asks for reduced
  motion, or the setting is on, moving current dots MUST be replaced by
  static arrows whose size shows the current, with the current value
  shown next to each arrow on hover or focus.
- **ACC-14 — No harmful flicker.** Any visual effect (LED, lamp, failure
  flash, wire color) that would flash more than three times per second
  MUST be shown as its steady average brightness instead, unless the
  reader turns on "Show fast flicker" in settings.
- **ACC-15** — Sound (speakers, buzzers) MUST be off until the learner turns
  it on, and MUST have a volume control and a mute shortcut.

## 23. Performance and Reliability

- **PRF-01 — Smooth animation.** With up to 150 parts on screen, the
  animation MUST run at 30 frames per second or better, and SHOULD reach 60,
  on a typical school laptop from 2020 onward. Circuits up to 500 parts
  MUST remain usable at a lower frame rate.
- **PRF-02 — Responsive controls.** Flipping a switch, moving a slider, or
  changing a value MUST show its effect on the schematic within 100 ms.
- **PRF-03 — Fast start.** The full simulator MUST be usable within three
  seconds on a broadband connection; an embedded simulator MUST show its
  circuit within two seconds.
- **PRF-04 — Long histories.** The chart MUST keep at least 100,000 samples
  per trace without slowing down.
- **PRF-05 — Spikes stay visible.** When the chart is zoomed out so that
  many samples share one pixel column, it MUST still draw the minimum and
  maximum in that column, so short spikes (such as inductive kickback)
  never disappear.
- **PRF-06 — No lost work.** Every change MUST be saved to browser storage
  automatically. After a crash, a closed tab, or a reload, the simulator
  MUST offer to restore the unsaved circuit.
- **PRF-07 — Offline.** After the first visit, the simulator SHOULD work
  without a network connection, including the example library.
- **PRF-08 — Browsers.** The simulator MUST work in the two most recent
  major versions of Chrome, Edge, Firefox, and Safari, on desktop and on
  iPad.
- **PRF-09 — Graceful overload.** If the simulation cannot keep up with the
  chosen speed, the simulator MUST slow simulated time down rather than
  freeze, and MUST show "Running slower than requested" in the status bar.

## 24. Settings

Settings come in two kinds. **Learner settings** belong to the person and
are remembered in their browser for every circuit. **Circuit settings**
belong to the circuit and travel with it in files and links.

- **SET-01 — Learner settings.** The learner settings MUST include:

    | Setting | Choices | Default |
    |---|---|---|
    | Theme | Automatic, light, dark, high contrast | Automatic |
    | Current animation | Conventional current, electron flow, off | Conventional current |
    | Current speed scale | Proportional, wide range | Proportional |
    | Voltage color scale | Red–gray–green, color-blind safe (blue–gray–orange), off | Red–gray–green |
    | Schematic symbols | ANSI/IEEE, IEC | ANSI/IEEE |
    | Number display | Significant figures (2–6) | 3 |
    | Standard value series | None, E6, E12, E24 | None |
    | Reduced motion | Follow system, on, off | Follow system |
    | Show fast flicker | On, off | Off |
    | Sound | On, off, volume | Off |
    | Ghost on change | On, off | Off |
    | Hints in ideal mode | On, off | On |
    | Interface language | Available languages | Browser language |

- **SET-02 — Circuit settings.** The circuit settings MUST include: the
  realism switches ([RLM-03](#161-two-separate-switches)), the starting
  state ([SIM-12](#103-starting-state)), the automatic or maximum time step
  ([SIM-08](#102-time-step-and-speed)), the simulation speed, the logic
  supply voltage and thresholds ([DIG-01](#171-logic-levels)), the default
  propagation delay, the voltage color range ([ANI-14](#112-voltage-color)),
  and the noise seed ([SIM-23](#106-faithfulness)).
- **SET-03 — Interface scale.** The learner MUST be able to scale the whole
  interface from 80% to 200% in steps of 10%, independently of the
  browser's zoom ([RSP-07](#51-width-classes)).
- **SET-04 — Where settings live.** Learner settings MUST be stored in the
  browser and MUST NOT be written into circuit files. An embed parameter
  ([Section 19.1](#191-embed-parameters)) MAY override a learner setting for
  that one embed, such as `current=electron` for a lesson about electrons.
- **SET-05 — Reset.** **Restore all defaults** MUST reset the learner
  settings after a confirmation.
- **SET-06 — Shortcuts.** Every keyboard shortcut in
  [Section 8](#8-keyboard-and-mouse-reference) MUST be remappable, with
  conflicts reported and **Restore defaults** available.

## 25. User Stories

Each story follows one learner through a session and shows how the
features combine into understanding. Every story names the student's
starting belief or question, what they do, what they see, the insight they
reach, and the requirements it exercises. The stories double as
end-to-end test scripts: a release is not complete until every story can
be walked through as written.

### 25.1 Current is not used up

**Learner:** Maya, a ninth-grade physics student who believes the first
bulb in a series circuit "uses up" some current, leaving less for the
second.

1. Maya opens an embedded lesson: a 6 V battery and two identical bulbs in
   series. The lesson asks Maya to rank three points in the loop (before
   the first bulb, between the bulbs, after the second bulb) by the
   current flowing there. Maya ranks "before" highest.
2. The lesson reveals the animation. The dots move at the same speed all
   the way around the loop, through both bulbs, and both bulbs glow
   equally.
3. The next step asks Maya to check with numbers. Maya presses `I` and clicks
   the three wires. Three current traces appear in the Current lane, in
   three colors, lying exactly on top of each other at 0.25 A.
4. Maya swaps the second bulb for one with twice the resistance (a
   lower-wattage bulb). All three
   traces drop together to the same new value, and every dot in the loop
   slows by the same amount. The higher-resistance bulb now glows
   *brighter* than the other.

**Insight:** current is the same everywhere in a series loop. What the
bulbs use is energy, not current, and the bulb with more resistance takes
more of it.

**Requirements exercised:** [LES-03](#202-step-types), [LES-04](#202-step-types), [PRB-01](#131-probe-kinds), [ANI-03](#111-current-dots), [ANI-04](#111-current-dots),
[ANI-17](#113-power-heat-light-and-motion), [CHT-02](#121-lanes-and-legend), [CHT-05](#121-lanes-and-legend).

### 25.2 A battery is not a current source

**Learner:** Diego, who expects that adding a second bulb in parallel will
make the first one dimmer, because "the battery's current has to be shared".

1. Diego builds a battery and one bulb, places a current probe on the
   battery's wire, and presses `K` to keep a ghost copy of the trace.
2. Diego drops a second bulb in parallel with the first. The first bulb's
   brightness does not change. The battery current trace jumps to double
   its ghost. At the junction, the dots in the feed wire move twice as fast
   as the dots in each branch.
3. Puzzled, Diego turns on **Realistic parts**. The battery now has internal
   resistance. With two bulbs, both are slightly dimmer, and a voltage
   probe on the battery terminals shows the terminal voltage sagging
   below 6 V when the second bulb is connected.
4. Diego uses the Loop tool around the battery and one bulb: the internal
   resistance takes a small drop, the bulb takes the rest, and the sum
   is 0 V.

**Insight:** a battery supplies a nearly constant voltage. The current it
delivers depends on what is connected. Real batteries sag a little because
of internal resistance.

**Requirements exercised:** [CHT-17](#124-trace-display), [ANI-05](#111-current-dots), [RLM-01](#161-two-separate-switches), [RLM-03](#161-two-separate-switches), [PRB-16](#134-tools-for-seeing-the-circuit-laws),
[EDT-05](#71-placing-components).

### 25.3 Watching a capacitor charge

**Learner:** Aisha, a second-semester physics student meeting time
constants for the first time.

1. Aisha builds a 10 V battery, a switch, a 10 kΩ resistor, and a 100 µF
   capacitor in series. Aisha Alt+clicks the capacitor's top wire for a
   voltage probe and Alt+clicks the capacitor for a current probe.
2. Aisha clicks **Fit to circuit**. The simulator picks a speed at which one
   time constant takes about two seconds, and a 5 s window.
3. Aisha closes the switch. The voltage trace curves up toward 10 V and the
   current trace starts at 1 mA and decays. On the schematic, `+` marks
   build up on one plate and `−` marks on the other while the dots slow to
   a crawl.
4. Aisha turns on cursor A, snaps it to the moment the switch closed (an
   event marker), and snaps cursor B to the 63.2% point. Δt reads 1.00 s.
   Aisha adds the **Time constant** measurement: 1.00 s, fit quality
   excellent.
5. Aisha adds a slider to the resistor and turns on **Ghost on change**.
   Dragging R to 22 kΩ stretches the curve; the ghosts fan out behind it.
6. Aisha runs a **Measurement versus parameter** sweep of R from 1 kΩ to
   22 kΩ, measuring the time constant. The result is a straight line.

**Insight:** the time constant equals R × C. The current falls not
because the capacitor is "full" but because its voltage rises to meet the
battery's, leaving less voltage to push current through the resistor.

**Requirements exercised:** [PRB-02](#131-probe-kinds), [SIM-10](#102-time-step-and-speed), [ANI-18](#113-power-heat-light-and-motion), [CHT-24](#125-time-navigation-and-history), [CHT-26](#126-measurements),
[CHT-30](#126-measurements), [CHT-18](#124-trace-display), [CTL-05](#15-interactive-controls-while-running), [ANL-18](#143-parameter-sweep).

### 25.4 Where does the energy go?

**Learner:** Sam, who has just learned that a capacitor stores ½CV² and
assumes the battery supplied exactly that much.

1. Sam opens the circuit from story 25.3 and opens the **Energy** panel.
2. After the capacitor is fully charged, the panel reads: battery
   delivered 10.0 mJ; capacitor stored 5.00 mJ; resistor dissipated
   5.00 mJ; totals balance.
3. Sam suspects the resistor is to blame and sweeps it from 100 Ω to
   100 kΩ. Every run gives the same split: half stored, half turned into
   heat. A smaller resistor gets hot faster but for a shorter time.
4. To see why, Sam adds a math trace `V1 × I1` for the capacitor's power
   and a power probe on the resistor, then adds the **Area** measurement
   to both.

**Insight:** charging a capacitor from a fixed voltage always loses half
the energy as heat, whatever the resistance. Conservation of energy is
exact: every joule is accounted for.

**Requirements exercised:** [PRB-20](#134-tools-for-seeing-the-circuit-laws), [CHT-33](#127-math-traces), [CHT-30](#126-measurements), [ANL-18](#143-parameter-sweep).

### 25.5 Loading a voltage divider

**Learner:** Priya, a first-year engineering student designing a divider
to make 6 V from 12 V.

1. Priya builds 12 V across two 10 kΩ resistors. The **DC** tab shows
   6.00 V at the middle node.
2. Priya connects a 10 kΩ load. The middle node drops to 4.00 V. The DC
   table's highlight shows which values changed.
3. Priya removes the load, selects the middle node and ground, and runs
   **Find Thévenin and Norton equivalents**: 6.00 V in series with
   5.00 kΩ.
4. Priya predicts the loaded voltage with the divider formula, 6 × 10 ÷
   (10 + 5) = 4 V, then presses **Swap in the equivalent** and reconnects
   the load. It reads 4.00 V, the same as the full circuit.

**Insight:** any linear circuit, seen from two terminals, behaves like one
source and one resistor. That makes loading predictable.

**Requirements exercised:** [ANL-03](#141-dc-operating-point), [ANL-04](#141-dc-operating-point), [PRB-19](#134-tools-for-seeing-the-circuit-laws), [ANI-26](#114-values-on-the-schematic).

### 25.6 Kirchhoff's laws, live

**Learner:** Jordan, who can apply Kirchhoff's laws on paper but suspects
they only work for "nice" numbers.

1. Jordan opens a two-loop circuit with a 9 V and a 3 V battery sharing a
   middle resistor.
2. With the Loop tool, Jordan clicks around the left loop. Each element is
   labelled with its rise or drop, and the sum reads 0.00 V. The same
   happens for the right loop and the outer loop.
3. Jordan adds a slider to the 3 V battery and drags it from 0 V to 12 V.
   The individual voltages change continuously, but every loop sum stays
   at 0.00 V.
4. With the Junction tool on the middle node, Jordan watches the three
   currents. Partway through the drag, the middle resistor's current
   passes through zero and reverses: its dots stop and then flow the other
   way, while the junction sum stays 0.00 A.

**Insight:** the laws hold at every instant for any values. A branch
current can reverse direction, and the laws still balance.

**Requirements exercised:** [PRB-16](#134-tools-for-seeing-the-circuit-laws), [PRB-18](#134-tools-for-seeing-the-circuit-laws), [CTL-05](#15-interactive-controls-while-running), [ANI-05](#111-current-dots), [ANI-07](#111-current-dots).

### 25.7 Inductive kickback

**Learner:** Lena, building a relay driver, who does not understand why
the guide insists on a "flyback diode".

1. Lena builds a 12 V supply, a 100 mH relay coil with 100 Ω of winding
   resistance, and an NPN transistor switch driven by a push button. Lena
   places a voltage probe on the transistor's collector.
2. Lena sets the chart to **Triggered**, **Single**, triggering on the
   collector voltage rising past 20 V, and presses and releases the
   button.
3. The capture shows the collector at about 0 V while the button is held,
   then a spike far above the 12 V supply the instant it is released. The
   spike lasts microseconds, but it stays visible even when Lena zooms out.
4. Lena turns on **Realistic ratings** and repeats. The transistor fails
   with a message: its collector voltage rating was exceeded.
5. Lena repairs it, adds a diode across the coil, and repeats. The
   collector now rises to only about 12.7 V. On the schematic, after
   release, the dots keep circulating around the coil and diode loop and
   slow to a stop.

**Insight:** an inductor resists sudden changes in current. When the
switch opens, the coil's stored energy must go somewhere; the diode gives
the current a safe path.

**Requirements exercised:** [CHT-10](#122-time-axis-and-sweep-modes), [PRF-05](#23-performance-and-reliability), [CHT-19](#124-trace-display), [RLM-02](#161-two-separate-switches), [RLM-05](#162-ratings-and-failure),
[RLM-06](#162-ratings-and-failure), [RLM-07](#162-ratings-and-failure), [ANI-01](#111-current-dots).

### 25.8 Energy sloshing in an LC circuit

**Learner:** Kenji, who has seen the formula for resonant frequency but
not what "resonance" looks like.

1. Kenji charges a 10 µF capacitor to 5 V, then flips a switch to connect
   it to a 10 mH inductor. Voltage and current probes show two sine waves
   a quarter-cycle apart; the measured frequency is 503 Hz.
2. Kenji adds power probes to the capacitor and the inductor. Their power
   traces alternate in sign: energy flows out of one and into the other.
   The Energy panel shows the total stored energy constant.
3. Kenji switches the voltage lane to **X-Y**, plotting capacitor voltage
   against inductor current. The trace is a closed ellipse, traced again
   and again.
4. Kenji adds a resistor in series. The ellipse becomes an inward spiral.
   Kenji sweeps R from 1 Ω to 200 Ω as a transient family: the curves move
   from slow decay, through the fastest non-oscillating return (near
   2√(L/C), about 63 Ω), to a sluggish crawl.

**Insight:** oscillation is energy moving back and forth between electric
and magnetic storage. Resistance drains it; critical damping is the
fastest way back to rest without overshoot.

**Requirements exercised:** [CHT-30](#126-measurements), [PRB-01](#131-probe-kinds), [PRB-20](#134-tools-for-seeing-the-circuit-laws), [CHT-34](#128-x-y-view), [ANL-18](#143-parameter-sweep),
[SIM-22](#106-faithfulness).

### 25.9 Slowing down AC

**Learner:** Rosa, who has heard that household current "goes back and
forth" but has never seen it.

1. Rosa opens a 120 V, 60 Hz mains source feeding a step-down transformer
   and a lamp. The dots just shimmer in place. A notice beside the speed
   control says the current reverses 120 times a second.
2. Rosa clicks **Slow down**. One cycle now takes about two seconds, and the
   dots visibly surge one way, stop, and surge back. The wire colors pulse
   from green through gray to red and back.
3. Rosa places current probes on the primary and secondary windings and
   adds the RMS measurement: 0.10 A and 1.00 A. Voltage probes show 120 V
   and 12 V RMS. Power probes give the same average power on both sides.

**Insight:** alternating current really does reverse. A transformer
trades voltage for current while (ideally) keeping power the same.

**Requirements exercised:** [ANI-08](#111-current-dots), [ANI-12](#112-voltage-color), [SIM-09](#102-time-step-and-speed), [CHT-30](#126-measurements).

### 25.10 Rectifiers and ripple

**Learner:** Omar, building a 12 V DC supply from a transformer.

1. Omar builds a half-wave rectifier with a 1000 µF filter capacitor and a
   100 Ω load. Peak-to-peak and Frequency measurements on the output read
   about 2.7 V of ripple at 60 Hz.
2. Omar replaces the diode with a four-diode bridge. The ripple frequency
   reads 120 Hz and the ripple roughly halves.
3. A current probe on one diode surprises Omar: the diode carries current
   only in short, tall pulses near each peak. Most of the time it is off,
   and the capacitor alone feeds the load.
4. Omar opens the **Spectrum** tab on the output: a large 0 Hz (DC) bar, then
   a 120 Hz bar and its harmonics. Dragging the capacitor slider upward
   shrinks the 120 Hz bar and the ripple together.

**Insight:** the capacitor charges only at the peaks and discharges in
between. The diodes deliver the whole load current in brief bursts, which
is why their peak current ratings matter.

**Requirements exercised:** [CHT-30](#126-measurements), [ANL-22](#144-spectrum), [ANL-24](#144-spectrum), [CTL-05](#15-interactive-controls-while-running), [PRB-01](#131-probe-kinds).

### 25.11 An LED and its resistor

**Learner:** Ava, a maker who wired an LED straight to a 9 V battery and
wants to understand why it died.

1. With **Realistic ratings** on, Ava connects a red LED across a 9 V
   battery. It flashes bright, the heat bar on its warning badge fills,
   and it fails with a puff of smoke and the message from [RLM-06](#162-ratings-and-failure),
   suggesting about 360 Ω.
2. Ava repairs it, adds a resistor, and selects it. **Explain** shows
   "I = (9.00 V − 1.82 V) ÷ R".
3. Ava types `360`, and the LED current reads 19.9 mA. Ava opens **Nearest
   standard value**: 360 Ω is in the E24 series; in the E12 series the
   nearest are 330 Ω (21.8 mA) and 390 Ω (18.4 mA).

**Insight:** an LED needs a current limit. Ohm's law, applied to the
voltage left over after the LED's forward drop, sets the resistor.

**Requirements exercised:** [RLM-04](#162-ratings-and-failure), [RLM-05](#162-ratings-and-failure), [RLM-06](#162-ratings-and-failure), [RLM-07](#162-ratings-and-failure), [PRB-21](#134-tools-for-seeing-the-circuit-laws),
[EDT-28](#74-editing-values).

### 25.12 What a diode really does

**Learner:** Ben, who was taught that "a diode is a switch that turns on at
0.7 V".

1. Ben connects a triangle-wave source, sweeping −1 V to +4 V, across a
   silicon diode with a small series resistor.
2. Ben switches a lane to **X-Y**, with the diode voltage across and the
   diode current up. The curve is flat, then bends smoothly upward:
   there is no sharp corner.
3. Ben keeps a ghost, then swaps the diode for a Schottky diode, a red LED,
   and a blue LED in turn. Each curve bends at a different voltage: about
   0.3 V, 1.8 V, and 2.8 V.
4. To check, Ben runs a **DC sweep** of the source voltage and plots the
   diode current on a logarithmic scale: a straight line over many
   decades.

**Insight:** a diode's current grows exponentially with voltage. "0.7 V"
is only a rule of thumb for where the current becomes useful, and it
differs by diode type.

**Requirements exercised:** [CHT-34](#128-x-y-view), [CHT-17](#124-trace-display), [ANL-18](#143-parameter-sweep), [CHT-13](#123-vertical-scaling).

### 25.13 A transistor as a switch and amplifier

**Learner:** Grace, who has memorized "Ic = β × Ib" but not when it
applies.

1. Grace drives a lamp from an NPN transistor, with a potentiometer
   setting the base current. Current probes go on the base and collector
   terminals (each probe's preview shows which terminal it will measure).
2. As Grace turns the potentiometer up, the hover card shows "active
   region" and the ratio of the two currents stays near 100. The lamp
   brightens steadily.
3. Past a point, the collector current stops rising while the base current
   keeps climbing. The hover card now reads "saturation", the ratio
   falls, and the collector-emitter voltage is only about 0.1 V.
4. In the **Sweep** tab Grace runs a two-parameter DC sweep: collector
   current against collector-emitter voltage, for five base currents. Grace
   gets the textbook family of output curves.

**Insight:** β applies only in the active region. A transistor used as a
switch is driven into saturation, where it is fully on.

**Requirements exercised:** [PRB-07](#131-probe-kinds), [CAN-17](#63-hover-readouts), [CTL-04](#15-interactive-controls-while-running), [ANL-19](#143-parameter-sweep).

### 25.14 How an amplifier's gain depends on frequency

**Learner:** Malik, a second-year student analysing a common-emitter
amplifier.

1. Malik feeds a 10 mV, 1 kHz sine into the amplifier. The Gain and Phase
   difference measurements between output and input read 34 dB and 180°:
   the output is a larger, inverted copy.
2. In the **Frequency** tab Malik sees a flat mid-band gain, a low-frequency
   roll-off, and markers at the −3 dB frequencies.
3. Malik adds a slider to the emitter bypass capacitor. Shrinking it moves
   the low cutoff upward, and the curve redraws live with the ghost of the
   old curve behind it.
4. Malik clicks the plot at 30 Hz and chooses **Try this frequency**. Back in
   the Time tab, the output is visibly smaller and shifted.
5. Malik raises the input to 200 mV. The output flattens at the top and
   bottom. The **Spectrum** tab now shows strong harmonics and a THD of 12%.

**Insight:** gain is not one number: it depends on frequency, set by the
coupling and bypass capacitors. Small-signal analysis holds only while the
signal stays small.

**Requirements exercised:** [CHT-30](#126-measurements), [ANL-08](#142-frequency-response-bode-plot), [ANL-11](#142-frequency-response-bode-plot), [ANL-12](#142-frequency-response-bode-plot), [ANL-14](#142-frequency-response-bode-plot),
[ANL-15](#142-frequency-response-bode-plot), [ANL-24](#144-spectrum).

### 25.15 The op-amp's virtual ground

**Learner:** Chloe, who does not believe that the inverting input of an
op-amp "stays at zero" when nothing connects it to ground.

1. Chloe builds an inverting amplifier with a gain of −10 and a 0.5 V,
   100 Hz sine input. Chloe probes the input, the output, and the
   op-amp's inverting input.
2. The output is an inverted 5 V sine. The inverting-input trace, with
   automatic scaling, sits at microvolts: effectively 0 V.
3. Chloe changes the feedback resistor for a gain of −100. The output tries
   to reach 50 V but flattens at the op-amp's output limits, and now the
   inverting input trace jumps away from zero whenever the output is
   clipped.

**Insight:** negative feedback holds the two inputs together only while
the output can still respond. When the output saturates, the "virtual
ground" disappears.

**Requirements exercised:** [PRB-01](#131-probe-kinds), [CHT-12](#123-vertical-scaling), [CAN-17](#63-hover-readouts), [RLM-01](#161-two-separate-switches).

### 25.16 One filter, three views

**Learner:** Noah, who has learned filters in the frequency domain and
transients in the time domain and treats them as unrelated topics.

1. Noah feeds a 100 Hz square wave into a 1 kΩ, 1 µF low-pass filter. The
   output has rounded edges.
2. The **Frequency** tab marks the −3 dB point at 159 Hz.
3. The **Spectrum** tab, on the input, shows odd harmonics at 100, 300,
   500 Hz... with amplitudes in the ratio 1 : 1/3 : 1/5. On the output,
   the higher harmonics are reduced much more than the lower ones.
4. Noah drags a slider on R. The edges round more, the cutoff marker slides
   left, and the output harmonics shrink, all at once.

**Insight:** filtering in time and filtering in frequency are the same
thing seen two ways. Rounded edges mean missing high harmonics.

**Requirements exercised:** [ANL-10](#142-frequency-response-bode-plot), [ANL-11](#142-frequency-response-bode-plot), [ANL-12](#142-frequency-response-bode-plot), [ANL-22](#144-spectrum), [ANL-24](#144-spectrum),
[CTL-05](#15-interactive-controls-while-running).

### 25.17 Inside the 555 timer

**Learner:** Theo, a hobbyist who has built 555 blinkers from recipes and
wants to know how the chip works.

1. Theo opens the 555 astable example from the library. Theo probes the
   timing capacitor and the output.
2. Level cursors on the capacitor trace snap to its turning points: 3.33 V
   and 6.67 V, one third and two thirds of the 10 V supply. Vertical
   cursors give the high time and low time, and the Duty cycle measurement
   reads 60%.
3. Theo double-clicks the 555 to open its inside: two comparators, a
   flip-flop, and a discharge transistor. Probes Theo places inside show
   the comparators firing exactly when the capacitor crosses each
   threshold.
4. Theo changes R2 with a slider and watches the frequency and duty cycle
   measurements track the formulas from Theo's datasheet.

**Insight:** the 555's timing is simply a capacitor charging and
discharging between two thresholds, with a flip-flop remembering which
way it is going.

**Requirements exercised:** [CHT-26](#126-measurements), [CHT-29](#126-measurements), [CHT-30](#126-measurements), [EDT-36](#76-subcircuits), [CTL-05](#15-interactive-controls-while-running).

### 25.18 Counting in binary, glitches included

**Learner:** Isabel, a digital electronics student whose ripple counter
sometimes triggers a decoder that should never fire.

1. Isabel builds a 4-bit ripple counter with a clock and four LEDs. Logic
   probes on the outputs appear as compact logic lanes. Isabel groups them
   into a bus lane shown in hexadecimal: 0, 1, 2, ... F.
2. Isabel sets a 10 ns propagation delay on every flip-flop and zooms the
   chart into the change from 7 to 8. The bus lane shows 7, 6, 4, 0, 8 in
   quick succession: the bits change one after another.
3. Edge cursors measure 10 ns between each step.
4. Isabel builds a synchronous counter from the library and repeats. The
   change from 7 to 8 happens in one step.

**Insight:** a ripple counter passes through false states as the change
ripples through. Synchronous design avoids glitches by changing every bit
on the same clock edge.

**Requirements exercised:** [DIG-05](#172-timing), [DIG-07](#173-digital-traces), [DIG-08](#173-digital-traces), [DIG-09](#173-digital-traces), [CHT-20](#125-time-navigation-and-history).

### 25.19 From numbers to voltages

**Learner:** Femi, learning how a digital-to-analog converter works.

1. Femi connects a 4-bit counter to an R-2R resistor ladder with a 5 V
   reference. The analog output on the chart is a staircase.
2. Cursors on two neighboring steps read a difference of 0.3125 V, which
   is 5 V divided by 16.
3. The Junction tool on the ladder's nodes shows the current halving at
   each rung.
4. Femi adds an RC low-pass filter after the ladder and sees the staircase
   smooth into a ramp; the Spectrum tab shows the step frequency
   reduced.

**Insight:** each bit contributes a binary-weighted share of the
reference, because the ladder halves the current at each rung.

**Requirements exercised:** [DIG-04](#171-logic-levels), [CHT-26](#126-measurements), [PRB-18](#134-tools-for-seeing-the-circuit-laws), [ANL-22](#144-spectrum).

### 25.20 Finding the fault

**Learner:** a lab class preparing for a troubleshooting practical.

1. The teacher's lesson shows a string of four resistors across a 12 V
   supply. One resistor is secretly open, and the chart, probes, and
   animation are hidden. Only the multimeter is available.
2. A student sets the multimeter to DC volts and measures across each
   resistor in turn. Three read 0 V; one reads the full 12 V. The student
   clicks that resistor and the lesson confirms it.
3. The next step asks for the resistance of the faulty resistor. With the
   meter on ohms across the powered circuit, the display shows "– – –"
   and the note to turn off the power. The student opens the supply
   switch, measures, and reads "OL" (open).
4. The final step asks the student to measure the supply current. One
   student puts the meter, set to amps, straight across the supply. With
   realistic ratings on, the meter's fuse blows, and the lesson explains
   why ammeters go in series.

**Insight:** an open in a series circuit takes the whole supply voltage
and stops all current. Meters must be used the right way round, and the
habits carry over to the real lab.

**Requirements exercised:** [LES-02](#201-lesson-files), [LES-06](#203-checks), [LES-11](#204-guidance-and-feedback), [PRB-24](#135-instruments-that-behave-like-real-meters), [RLM-04](#162-ratings-and-failure).

### 25.21 A teacher builds a predict-observe-explain page

**Learner:** Ms. Okafor, a physics teacher using the book's chapter on
capacitors.

1. Ms. Okafor opens the RC circuit in the full simulator, turns on **Author
   mode**, and writes a three-step lesson: sketch your prediction of the
   capacitor's voltage after the switch closes; watch; explain the
   difference.
2. Ms. Okafor locks every part except the switch, hides the palette, and makes
   the chart visible only from step 2.
3. Ms. Okafor embeds the lesson in the chapter page with an iframe and the
   `lesson=` parameter, and the page's own script turns on xAPI and sends
   the student's identity.
4. In class, students sketch on the chart. In step 2, each sketch appears
   dashed beside the real exponential curve.
5. Afterwards, Ms. Okafor's learning record store shows that 70% of the sketches
   were straight lines. Ms. Okafor adds a step to the next lesson about why the
   current falls.

**Insight (for the teacher):** the predictions reveal a specific,
common misconception that a quiz score would hide.

**Requirements exercised:** [LES-01](#201-lesson-files), [LES-03](#202-step-types), [LES-04](#202-step-types), [LES-05](#202-step-types), [LES-15](#205-writing-lessons),
[EMB-02](#192-embed-modes), [XAP-01](#211-when-reporting-happens), [XAP-04](#211-when-reporting-happens), [XAP-07](#212-what-is-reported).

### 25.22 Opening the classic Falstad examples

**Learner:** Wei, reading the book's List of Circuits page.

1. Wei clicks **Open** next to "Tesla Coil" on the list. The circuit opens
   in the new simulator, laid out exactly as in Falstad's simulator, with
   the same scope traces, now shown as probes and chart lanes.
2. Wei then pastes a Falstad share link found on a forum. It opens too.
   One element the new simulator does not support is drawn as a labelled
   placeholder, and a notice lists it.
3. Wei adds a current probe on the spark gap, something the original
   example did not show, and uses the Spectrum tab on the secondary
   voltage.

**Insight:** the existing library of 366 circuits remains useful, and the
new tools reveal more inside each one.

**Requirements exercised:** [FIL-14](#183-falstad-compatibility), [FIL-15](#183-falstad-compatibility), [FIL-16](#183-falstad-compatibility), [FIL-17](#183-falstad-compatibility), [FIL-19](#183-falstad-compatibility),
[ANL-22](#144-spectrum).

### 25.23 A phone in the lab

**Learner:** Lucía, checking a circuit on a phone during a lab, with no
laptop to hand.

1. Lucía opens the shared link. The simulator opens in the Narrow layout
   with the **Circuit** view showing. Lucía runs it and taps the switch.
2. Lucía switches to **Chart**, drags the cursor with a finger, and reads
   the time constant in the measurement list.
3. Lucía chooses **Both**: the circuit above, a compact chart below. Turning
   the phone sideways, the layout re-arranges without losing any probes,
   zoom, or chart history.

**Insight:** the same tool works wherever the student is.

**Requirements exercised:** [RSP-01](#51-width-classes), [RSP-02](#51-width-classes), [RSP-13](#54-touch-and-pointer-types), [RSP-14](#54-touch-and-pointer-types).

### 25.24 Exploring without sight

**Learner:** Marcus, a blind student who uses a screen reader.

1. Marcus opens the circuit description: "Battery V1, 9 volts, from
   ground to node A. Resistor R1, 1 kilohm, from node A to node B.
   Resistor R2, 2 kilohms, from node B to ground."
2. Marcus tabs to R2. The screen reader announces "Resistor R2, 2 kilohms,
   6.00 volts across, 3.00 milliamps".
3. Marcus places a voltage probe on node B from the keyboard and opens the
   chart's data table and trace description.
4. Marcus adds a slider to R1 and nudges it with the arrow keys; the live
   region announces the new voltage at node B after each change.

**Insight:** the circuit's behavior is fully available without the
picture.

**Requirements exercised:** [ACC-02](#221-keyboard-only-operation), [ACC-03](#221-keyboard-only-operation), [ACC-06](#222-screen-readers), [ACC-07](#222-screen-readers), [ACC-08](#222-screen-readers),
[ACC-09](#222-screen-readers).

### 25.25 Sharing without an account

**Learners:** Zoe and Kai, lab partners working from home.

1. Zoe builds a circuit and chooses **Share → Copy link**. Zoe pastes the
   link into the class chat.
2. Kai opens it on a school Chromebook. The circuit, probes, sliders, and
   chart layout are all there. Kai improves it and sends a new link back.
3. Zoe's browser crashes mid-edit. When Zoe reopens the simulator, it
   offers to restore Zoe's unsaved circuit.
4. Before the deadline, Zoe saves the circuit as a file to upload to the
   class site.

**Insight (for the students):** nothing to sign up for, nothing lost.

**Requirements exercised:** [FIL-05](#182-saving-opening-and-sharing), [FIL-07](#182-saving-opening-and-sharing), [FIL-09](#182-saving-opening-and-sharing), [PRF-06](#23-performance-and-reliability), [PRB-15](#133-managing-probes).

### 25.26 Rocking the moment

**Learner:** Hannah, trying to understand why an inductor's voltage leads
its current.

1. Hannah runs a series RLC circuit driven by a step and pauses just after
   the switch closes.
2. Hannah drags the chart's playhead back and forth over the first current
   peak. On the schematic, the dots speed up, slow, and reverse with the
   pointer. The inductor's pinned meter shows its voltage passing through
   zero exactly at the current peak, and being largest where the current
   changes fastest.
3. Hannah adds a math trace `d/dt(I1)` and sees it match the inductor voltage
   divided by L.

**Insight:** an inductor's voltage depends on how fast its current is
changing, not on the current itself.

**Requirements exercised:** [CHT-22](#125-time-navigation-and-history), [CHT-23](#125-time-navigation-and-history), [ANI-09](#111-current-dots), [CAN-18](#63-hover-readouts), [CAN-19](#63-hover-readouts),
[CHT-33](#127-math-traces).

## 26. Acceptance Test Circuits

A build is accepted only when every circuit below, run at the default
settings, gives the expected result within the stated tolerance. These
tests check the simulator against textbook theory and against the
promises in this specification.

| # | Circuit | What is checked | Expected | Tolerance |
|---|---|---|---|---|
| 1 | 10 V across 1 kΩ | Current | 10.0 mA | ±0.1% |
| 2 | 12 V, 1 kΩ in series with two 2 kΩ in parallel | Source current; middle node voltage | 6.00 mA; 6.00 V | ±0.1% |
| 3 | 12 V divider of two 10 kΩ, loaded with 10 kΩ | Loaded output; Thévenin equivalent | 4.00 V; 6.00 V and 5.00 kΩ | ±0.1% |
| 4 | 10 V, 10 kΩ, 100 µF, switch closes at t = 0 | Capacitor voltage at 1 s and 5 s; fitted time constant | 6.32 V and 9.93 V; 1.00 s | ±0.5% |
| 5 | 10 V, 100 Ω, 100 mH, switch closes at t = 0 | Current at 1 ms; final current | 63.2 mA; 100 mA | ±0.5% |
| 6 | 10 µF charged to 5 V, then connected to 10 mH | Frequency; amplitude after 100 cycles | 503 Hz; at least 99% of the start | ±0.5%; [SIM-22](#106-faithfulness) |
| 7 | Series RLC, 10 mH, 10 µF, R = 63.2 Ω, step input | Overshoot (critical damping) | None | Below 0.5% |
| 8 | Series RLC, 10 mH, 10 µF, 10 Ω, frequency response of the resistor voltage | Peak frequency; Q | 503 Hz; 3.16 | ±1% |
| 9 | 1 kΩ, 1 µF low-pass filter, frequency response | −3 dB frequency; phase there | 159 Hz; −45° | ±1%; ±1° |
| 10 | 10 V peak, 50 Hz sine | RMS; frequency; peak-to-peak | 7.07 V; 50.0 Hz; 20.0 V | ±0.2% |
| 11 | 1 kHz square wave, spectrum | Third harmonic relative to the fundamental | −9.54 dB | ±0.2 dB |
| 12 | Default silicon diode, DC sweep | Voltage at 1 mA; slope of log current against voltage | 0.60–0.70 V; about 60 mV per decade | ±10% on the slope |
| 13 | 10 V charging 100 µF through 1 kΩ | Energy delivered, stored, dissipated | 10.0 mJ, 5.00 mJ, 5.00 mJ; balance | ±0.5%; balance ±0.1% |
| 14 | Ideal op-amp inverting amplifier, 10 kΩ and 100 kΩ, 0.5 V input | Output; inverting-input voltage | −5.00 V; below 1 mV | ±0.1% |
| 15 | 555 astable, R1 = 1 kΩ, R2 = 10 kΩ, C = 10 µF | Frequency; duty cycle | 6.87 Hz (1.44 ÷ ((R1 + 2·R2)·C)); 52.4% | ±2% |
| 16 | Ideal transformer, 10:1, 120 V RMS primary, 12 Ω load | Secondary voltage; primary current | 12.0 V RMS; 0.100 A RMS | ±0.5% |
| 17 | Two-loop circuit from story [25.6](#256-kirchhoffs-laws-live) | Loop tool sums; junction tool sums | 0 V; 0 A | Display precision |
| 18 | 4-bit ripple counter, 1 kHz clock, 10 ns delays | Count sequence; intermediate states at 7 → 8 | 0 to 15 and wrap; 7, 6, 4, 0, 8 | Exact |
| 19 | Red LED on 9 V through 360 Ω | LED current | About 20 mA | ±10% |
| 20 | Every circuit in the [List of Circuits](../list-of-circuits.md) | Opens without error | All 366 open; unsupported elements reported ([FIL-16](#183-falstad-compatibility)) | — |
| 21 | 20 library circuits chosen by the author | Waveforms against Falstad's simulator side by side | Same shape and values | ±1% |
| 22 | A 150-part circuit on a 2020-era school laptop | Animation frame rate | 30 frames per second or more | [PRF-01](#23-performance-and-reliability) |

The user stories in [Section 25](#25-user-stories) are the second half of
acceptance: each must be walked through exactly as written.

## 27. Open Questions and Future Work

These questions are not settled by this draft and need the author's
decision:

1. **Name.** What should the simulator be called?
2. **Licensing.** Falstad's example circuits are distributed under the GNU
   GPL. If the new simulator ships them as its built-in library, its
   license must be compatible. Which license will the new simulator use?
3. **Languages.** Which interface languages should the first release
   include besides English?
4. **Symbol style by region.** Should the default symbol style follow the
   reader's region (IEC in much of Europe), or always start with
   ANSI/IEEE?
5. **Microcontrollers.** Falstad's repository now includes AVR8js
   microcontroller demos. Should a later version emulate a microcontroller
   (for example an Arduino Uno) running student code?
6. **Netlist export.** Should advanced students be able to export a SPICE
   netlist to check results in a professional tool?
7. **Falstad export.** Should the simulator save back to Falstad's format,
   or only import it ([FIL-20](#183-falstad-compatibility))?
8. **Challenges.** Should there be a gallery of challenges (for example
   "make this LED blink at 2 Hz using only these parts") with automatic
   checking, beyond lessons written by teachers?
9. **AI tutor.** Several newer simulators include an AI assistant that
   explains or debugs the student's circuit. Should this simulator offer
   one, limited to Socratic hints rather than answers?
10. **Reference device.** Which specific low-cost laptop or Chromebook should
   be the performance reference for [PRF-01](#23-performance-and-reliability)?

## Sources

This specification was written on 2026-10-21 from two research passes: a
reading of the source code and documentation of Falstad's simulator, and a
survey of other simulators and of research on how students learn about
circuits. The requirements are this document's own design. Where a
feature comes from another tool, the table below says so.

### Falstad's circuit simulator

- **Repository.** [pfalstad/circuitjs1](https://github.com/pfalstad/circuitjs1),
  Paul Falstad's repository for CircuitJS1, the browser version of the
  simulator, read at commit
  [`5a70716`](https://github.com/pfalstad/circuitjs1/tree/5a707168778216bb6ed01bfdd62e8bbf7ae0a032).
  The code was read, not run, so some behavior in
  [Section 2.4](#24-what-changes-from-falstads-simulator) is inferred from
  the source.
- **Files read.** Under `src/com/lushprojects/circuitjs1/client/`:
  `Menus.java` and `UIManager.java` (the Draw menu, toolbar, and
  shortcuts), the `*Elm.java` element classes (each part's properties and
  hover information), `Scope.java`, `ScopePlot.java`, `ScopePlot2d.java`,
  `ScopeOverlays.java`, `ScopeFFT.java`, and `ScopeTrigger.java` (the
  scopes), `MouseManager.java` and `EditDialog.java` (editing),
  `SimulationManager.java` and `EditOptions.java` (running and options),
  `CircuitLoader.java` and `XMLSerializer.java` (file formats),
  `CirSim.java` (URL parameters), and `JSInterface.java` (the page API).
- **Documentation.** The help pages in the repository's `war/doc/`
  folder, also published at
  [falstad.com/circuit/doc](https://www.falstad.com/circuit/doc/).
- **Example list.** [`setuplist.txt`](https://github.com/pfalstad/circuitjs1/blob/5a707168778216bb6ed01bfdd62e8bbf7ae0a032/src/com/lushprojects/circuitjs1/public/setuplist.txt),
  the menu of 366 example circuits, also used for the book's
  [List of Circuits](../list-of-circuits.md).
- **Issues.** Feature requests and complaints in the issue trackers of
  [pfalstad/circuitjs1](https://github.com/pfalstad/circuitjs1/issues)
  and [sharpie7/circuitjs1](https://github.com/sharpie7/circuitjs1/issues),
  which shaped the comparison in
  [Section 2.4](#24-what-changes-from-falstads-simulator). The most
  requested missing features were frequency response (Bode) plots,
  DC sweeps and current–voltage curves, getting chart data out, a probe
  with a reference lead, and use on phones and tablets.

### Other simulators surveyed

The survey used each product's official documentation, help pages, and
teacher guides, plus reviews and forum threads for known pain points. The
tools were not tested hands-on, and features may have changed since
October 2026.

| Simulator | Ideas this specification adopts | Main sources |
|---|---|---|
| LTspice | Click a wire for voltage, a part for current, Alt-click for power; drag between nodes for differential voltage; pointer shape shows the quantity; units on separate axes; cursors with Δ and 1/Δt; measuring box; parameter-step families | [LTspice User Guide](https://www.ee.columbia.edu/~dvallancourt/LTspiceIV/LTspice_User_Guide.pdf); [Average and RMS of a trace](https://www.analog.com/en/resources/technical-articles/ltspice-computing-the-average-or-rms-value-of-a-trace.html) |
| PhET Circuit Construction Kit (DC and AC) | Electron or conventional current animation; realistic meters with leads; non-contact ammeter; brightness from power; lifelike and schematic views; URL presets; screen-reader descriptions | [CCK: DC teacher guide](https://phet.colorado.edu/files/teachers-guide/circuit-construction-kit-dc-html-guide_en.pdf); [CCK: AC teacher guide](https://phet.colorado.edu/files/teachers-guide/circuit-construction-kit-ac-html-guide_en.pdf) |
| EveryCircuit | Animated results on the schematic; mini waveforms on wires; charge shown on capacitors; stacked or overlaid traces; X-Y mode; phasors in AC mode | [EveryCircuit help](https://everycircuit.com/help); [EveryCircuit](https://everycircuit.com/) |
| CircuitLab | Live DC values on hover; smart wires that stay attached; case-sensitive metric prefixes; textbook with editable embedded circuits | [CircuitLab docs](https://www.circuitlab.com/docs/); [Smart wires](https://www.circuitlab.com/docs/smart-wires/); [Live DC simulation](https://www.circuitlab.com/blog/2021/01/27/live-dc-simulation/) |
| NI Multisim and Multisim Live | Voltage, current, power, and differential probes; virtual instruments; rated parts that fail; hidden faults; locked black boxes; electrical rules check | [Top 10 Multisim educational features](https://www.ni.com/en/shop/electronic-test-instrumentation/application-software-for-electronic-test-and-instrumentation-category/what-is-multisim/multisim-education/top-10-ni-multisim-educational-features.html); [Probes in Multisim](https://www.ni.com/fr-ca/support/documentation/supplemental/15/accurately-evaluate-circuits-with-probes-in-multisim.html); [Multisim Live end-of-life letter](https://support.digilent.com/hc/en-us/articles/41178584173979-Multisim-Live-EOL-Letter) |
| TINA and TINACloud | Voltage color scaled to the circuit's maximum; troubleshooting mode with randomized faulty variants | [Current and voltage animation](https://www.tina.com/current-flow-voltage-animation-in-tinacloud/); [Problem circuits for training](https://www.tina.com/creating-problem-circuits-for-training-and-examination/) |
| iCircuit | Always simulating; tap anywhere for a multimeter reading; scroll-back scope with measurements | [iCircuit](http://icircuitapp.com/) |
| Logisim-evolution and CircuitVerse | Digital wire-state colors; timing diagrams; truth tables; test benches | [Logisim wire colors](http://www.cburch.com/logisim/docs/2.7/en/html/guide/bundles/colors.html); [CircuitVerse test circuits](https://docs.circuitverse.org/chapter7/chapter7-testcircuits) |
| Tinkercad Circuits, SimulIDE, Qucs-S, Wokwi, Proteus VSM, and newer browser simulators (CircuitSim, CircuitSimLab, TinkerSim, NodeSim, EEcircuit) | Breadboard realism, microcontroller simulation (recorded as future work), instrument panels, AI tutors (recorded as an open question) | [Wokwi docs](https://docs.wokwi.com/); [Proteus instruments](https://www.labcenter.com/instruments/); [CircuitSim](https://circuitsim.com/) |

### Research on learning with circuit simulations

- N. D. Finkelstein and others, "When learning about the real world is
  better done virtually: A study of substituting computer simulations for
  laboratory equipment," *Physical Review Special Topics — Physics
  Education Research* 1, 010103 (2005),
  [doi:10.1103/PhysRevSTPER.1.010103](https://doi.org/10.1103/PhysRevSTPER.1.010103).
- C. J. Keller, N. D. Finkelstein, K. K. Perkins, and S. J. Pollock, a
  2006 study of the Circuit Construction Kit in undergraduate physics
  recitations, [record](https://vivo.colorado.edu/display/pubid_77920).
  It found no learning difference with or without the moving-electron
  display.
- L. C. McDermott and P. S. Shaffer, "Research as a guide for curriculum
  development: An example from introductory electricity," *American
  Journal of Physics* 60, 994 (1992),
  [doi:10.1119/1.17003](https://doi.org/10.1119/1.17003).
- R. Cohen, B. Eylon, and U. Ganiel, "Potential difference and current in
  simple electric circuits: A study of students' concepts," *American
  Journal of Physics* 51, 407 (1983),
  [record](https://www.per-central.org/items/detail.cfm?ID=2333).
- P. V. Engelhardt and R. J. Beichner, "Students' understanding of direct
  current resistive electrical circuits," *American Journal of Physics* 72,
  98 (2004), [arXiv:physics/0304040](https://arxiv.org/abs/physics/0304040).
- J.-P. Burde and T. Wilhelm, "Teaching electric circuits with a focus on
  potential differences," *Physical Review Physics Education Research* 16,
  020153 (2020), [record](https://doaj.org/article/425c28904f7f46b1b0591736a3255a04).
- T. N. Höffler and D. Leutner, "Instructional animation versus static
  pictures: A meta-analysis," *Learning and Instruction* 17, 722 (2007),
  [record](https://www.leibniz-ipn.de/en/research/publications/instructional-animation-versus-static-pictures-a-meta-analysis).
- S. Ainsworth, "DeFT: A conceptual framework for considering learning with
  multiple representations," *Learning and Instruction* 16, 183 (2006),
  [record](https://nottingham-repository.worktribe.com/output/23577631/deft-a-conceptual-framework-for-considering-learning-with-multiple-representations).
- L. C. McDermott, M. L. Rosenquist, and E. H. van Zee, "Student
  difficulties in connecting graphs and physics," *American Journal of
  Physics* 55, 503 (1987),
  [record](https://www.compadre.org/portal/items/detail.cfm?ID=2739).
- D. R. Dounas-Frazer and H. J. Lewandowski, "Electronics lab instructors'
  approaches to troubleshooting instruction" (2016),
  [arXiv:1603.03684](https://arxiv.org/abs/1603.03684).


## Credits

Paul Falstad created the circuit simulator this specification builds on,
and most of its example circuits. Iain Sharp ported it to the browser as
[CircuitJS1](https://github.com/sharpie7/circuitjs1), and Paul Falstad
continues its development in
[pfalstad/circuitjs1](https://github.com/pfalstad/circuitjs1). CircuitJS1
is free software under the GNU General Public License, version 2 or
later. Many of the interaction ideas adopted here come from the teams
behind LTspice, the PhET Circuit Construction Kit at the University of
Colorado Boulder, EveryCircuit, CircuitLab, NI Multisim, TINA, and
Logisim, as listed in [Sources](#sources). The research on student
learning is credited to its authors in the list above.

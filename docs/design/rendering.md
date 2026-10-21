---
title: Rendering and Animation Design
description: Design of the schematic renderer, the current-dot animator, voltage coloring, and the time-series chart renderer.
---

# Rendering and Animation

Everything that moves on screen is drawn by three main-thread components
that sit outside the React component tree: the **Schematic Renderer**,
the **Current Animator**, and the **Chart Renderer**. They are fed by the
**Frame Bus** ([Engine §7](simulation-engine.md#7-the-worker-protocol))
and paced by one shared **Render Scheduler**.

## 1. The render scheduler

One `requestAnimationFrame` loop serves every canvas in a simulator
instance, so the schematic and the chart are always drawn from the same
frame of data (PRN-04: time is shared).

```ts
interface RenderScheduler {
  /** Mark part of the picture as needing a redraw on the next frame. */
  invalidate(what: "grid" | "symbols" | "live" | "dots" | "overlay" | "chart"): void;
  /** True while anything is animating; the loop sleeps when this is false. */
  readonly animating: boolean;
}
```

- **The loop sleeps when nothing changes.** Paused, with no pointer
  activity and no dots moving, nothing is drawn. This matters for
  laptops on battery and for pages with several embeds.
- **Off-screen embeds stop drawing.** An `IntersectionObserver` and the
  page-visibility event stop the loop and tell the worker to pause
  (EMB-07).
- **Each layer redraws only when invalidated.** A switch flip
  invalidates `live` and `dots`; a pan invalidates everything; a hover
  invalidates `overlay` only.

## 2. The schematic renderer

### 2.1 Drawing technology

| Option | For | Against | Verdict |
|---|---|---|---|
| **SVG (DOM)** | Crisp at any zoom; every part is an element, so hit testing and accessibility come cheaply | Thousands of moving dots and per-frame color changes mean thousands of DOM updates per frame; falls well short of 30 fps at 150 parts (PRF-01) | Rejected for live drawing; used for **export** |
| **Canvas 2D, layered** | Fast for this scale; full control of drawing order; text and dashed lines are easy; works everywhere | We write our own hit testing and accessibility layer | **Chosen** |
| WebGL (or WebGPU) | Fastest for very large scenes | Text, dashes, and anti-aliased thin lines are hard; much more code; older school laptops have weak drivers | Rejected; not needed at 150–500 parts |

### 2.2 Layers

The schematic is drawn on stacked canvases, from back to front, plus one
HTML layer on top:

| Layer | Contents | Redrawn when |
|---|---|---|
| 1. Grid | Faint dots (CAN-02), fading below 40% zoom (CAN-06) | Pan, zoom, theme |
| 2. Symbols | Part symbols, labels, values, annotations, junction dots, crossing hops (CAN-07–13) | Document change, pan, zoom, symbol style |
| 3. Live | Wire voltage colors, voltage gradients inside parts (ANI-12–13), power glow (ANI-16), lamp and LED glow (ANI-17), capacitor charge marks (ANI-18), switch contacts (ANI-21), logic colors (ANI-22) | Every frame while running |
| 4. Dots | Current dots, streaks, trickle shimmer, or static arrows (ANI-01–08, ACC-13) | Every animation frame while dots move |
| 5. Overlay | Selection, focus outline, hover node highlight (CAN-11), probe flags and leaders (PRB-09), tool previews (PRB-04), loop and junction tools (PRB-16, PRB-18), lesson spotlights (LES-09) | Interaction, run state |
| 6. HTML | Hover cards, pinned meters (CAN-19), in-place value editor (EDT-25), context menus | Through React |

Symbols are drawn once per part type, orientation, and zoom level into a
cached `Path2D`, so layer 2 is cheap to redraw. Layer 3 is the expensive
one; it redraws wires with their colors every frame, which at 150 parts
is a few thousand line segments, comfortably inside a frame budget.

### 2.3 The drawing interface

Element views draw through a small interface, not directly on a canvas:

```ts
interface SymbolGraphics {
  moveTo(p: Point): void; lineTo(p: Point): void; arc(...): void;
  stroke(style: StrokeToken): void; fill(style: FillToken): void;
  text(s: string, at: Point, style: TextToken): void;
  image(name: SpriteName, box: Box): void;     // lifelike view (CAN-14)
}
```

There are two implementations: one that draws to a canvas and one that
writes SVG elements. The second gives schematic export as SVG (FIL-11)
and printing (FIL-12) from the same code that draws the screen. Styles
are **theme tokens**, never raw colors, so every view follows the light,
dark, and high-contrast themes (CAN-15).

### 2.4 View transform and hit testing

- The **view transform** maps grid units to screen pixels (zoom 10–800%,
  CAN-03) and is session state, except that it is saved in the file on
  save (FIL-02).
- **Hit testing** uses a spatial index (a uniform grid hash, rebuilt from
  the compiled circuit) of every part's hit shape, every wire segment,
  every probe flag, and every control region. On a coarse pointer, hit
  shapes and terminals grow to at least 44 px on screen (RSP-13).
- **Labels and live values** are placed by trying a few candidate
  positions around each symbol and taking the first that does not
  overlap anything already placed. Labels that cannot be placed at a
  readable size are hidden and shown on hover (RSP-12, ANI-23).

### 2.5 Lifelike view

The lifelike view (CAN-14) is a third symbol style handled by the same
`ElementView.drawSymbol` call with `style = "lifelike"`. It draws sprites
(bulbs, batteries, resistors with color bands computed from their value)
instead of line art. Wires become curved leads, drawn by smoothing the
same polyline. Animation, colors, probes, and hit testing do not change.

## 3. The current animator

The animator owns one number per drawn segment: its **phase**, measured
in units of dot spacing.

### 3.1 The rule

Each animation frame, for every segment *s* carrying current *I*:

```text
phase[s] += speed(I) × Δt_animation / spacing
```

and dots are drawn at distances `(i − frac(phase[s])) × spacing` along the
segment, for every whole *i* that falls on it. Because spacing is constant
(ANI-04) and speed is proportional to current in the default scale
(ANI-03), the number of dots passing any point per second is exactly
proportional to the current there. Kirchhoff's current law at a junction
(ANI-05) therefore holds by construction, not by tuning.

- **`speed(I)`** is `k × I` on the proportional scale, or a logarithmic
  curve on the wide-range scale. The constant `k` comes from the Current
  speed control (ANI-10). In **Auto**, `k` is chosen so the largest
  visible current moves four grid units per second, and it is changed
  only after the largest current has moved by more than ten times for a
  full second.
- **`Δt_animation`** is real elapsed time while running. It is **never**
  scaled by the simulation speed (ANI-03).
- **While paused, stepping, or scrubbing**, the phase is moved by the
  simulated-time change instead, converted at the present speed setting.
  Stepping forward advances the dots by what that step represents;
  dragging the playhead back moves them back (ANI-09), so the student can
  rock the animation around a moment.
- **Direction.** Electron flow negates *I* and swaps the dot sprite
  (ANI-07).
- **Limits.** Below the trickle threshold the dots stay still and shimmer;
  above the speed cap they are drawn at the cap as short streaks
  (ANI-06).
- **Reduced motion.** When reduced motion is on, the animator draws a
  static arrow per segment, sized by the current, instead of dots
  (ACC-13).

### 3.2 Where the currents come from

Every frame carries the latest **segment currents**: one value per drawn
wire segment and per path inside each part, computed by the engine from
the solution with each element's `segmentCurrents`
([Engine §5](simulation-engine.md#5-the-element-model-interface)). The
compiler's segment table maps them to screen geometry. Currents inside
wires are not otherwise known to MNA (a node is one voltage), so the
engine finds each wire segment's current by walking the wire tree of each
node from its leaves, summing the terminal currents that feed it. This is
done once per frame for drawing, not once per step.

## 4. Voltage color, power, and other live effects

- **Voltage color** maps each node's voltage through a lookup table for
  the active scale (red–gray–green, or blue–gray–orange for color-blind
  safety; ANI-12, ACC-12), one table per theme. The scale range follows
  the largest voltages present, with the same expand-fast, shrink-slow
  rule as the chart (ANI-14), unless the student fixes it.
- **Gradients inside parts** use the two terminal colors (ANI-13).
- **Power view** replaces the table with a warm scale for absorbing parts
  and a cool one for delivering parts (ANI-16).
- **Flicker suppression** (ACC-14). Any element whose drawn brightness or
  color would change direction more than three times per real second is
  drawn at its running average instead. The animator tracks this per
  element with a short history of reversals.
- **Change highlights** (ANI-26). After a value change, the renderer
  compares each node voltage and segment current one simulated second
  later with its value at the change, and briefly outlines those that
  moved by more than 10%.

## 5. The chart renderer

### 5.1 Build or borrow

| Option | Verdict |
|---|---|
| **Plotly or Chart.js** | Rejected. Large downloads (Plotly especially), and their models (datasets redrawn on update) are not built for 100,000 samples streaming at 60 fps. Lanes with a shared axis, a playhead driving the schematic, ghosts, triggers, and logic lanes would all fight the library. |
| **uPlot** | A strong candidate: small and very fast for time series. Rejected narrowly, because nearly every feature in Section 12 (lanes with two units, trigger modes, a draggable playhead, logic and bus lanes, X-Y view, lanes on the canvas, sketch predictions) would live in plug-ins that work around its model. We borrow its ideas: drawing min/max per pixel column and caching paths. |
| **Custom Canvas 2D renderer** | **Chosen.** About as much code as uPlot plus the plug-ins, but shaped around this specification. |
| WebGL plot library | Rejected: not needed for 16 traces, and weaker text and dashes. |

### 5.2 Structure

```text
Chart panel (React)
  Legend chips, lane titles, menus, measurement table      DOM, for accessibility and drag-and-drop
  Plot area                                                 one canvas per lane, plus one for the time axis
      reads  ChartModel (session state) and Lane[] (document)
      reads  History Store through its level-of-detail index
```

```ts
interface ChartModel {
  window: { start: number; span: number };   // CHT-07
  mode: "roll" | "sweep" | "triggered";      // CHT-08–10
  trigger?: TriggerSpec;                     // trace, level, direction, pre-trigger, auto/normal/single
  live: boolean;                             // false after the student pans back (CHT-21)
  playhead?: number;                         // set when paused (CHT-22)
  cursors?: { a: number; b: number; snap?: SnapMode };   // CHT-26
  hover?: number;                            // CHT-25
}
```

### 5.3 Drawing a trace fast

The [History Store](history-and-analysis.md#2-the-history-store) keeps,
for each trace, a **min/max pyramid**: for every block of 64 samples its
minimum and maximum, then for every 64 blocks, and so on. To draw a trace
across *w* pixel columns, the renderer picks the coarsest pyramid level
that still has at least one entry per column and draws a vertical line
from minimum to maximum in each column (CHT-19, PRF-05). Short spikes can
never vanish, and drawing cost depends on the width of the chart, not on
the number of samples. When zoomed in far enough, it draws the raw
samples and marks each one with a dot (CHT-16).

### 5.4 Sweep and trigger

The **roll** mode simply draws the latest window. **Sweep** and
**triggered** modes need a sweep start time. A small trigger detector
watches the incoming samples of the trigger trace for a level crossing in
the chosen direction and records crossing times. In Auto mode it supplies
a start time after one window with no trigger; in Single mode it stops
after one sweep and sets `live = false` (CHT-10).

### 5.5 Vertical scaling

Each lane keeps an automatic range that **expands at once** when a trace
leaves it and **shrinks only** after the traces have used less than a
quarter of it for two real seconds, rounded to 1, 2, or 5 times a power
of ten (CHT-12). Manual ranges lock the lane until Auto is pressed
(CHT-13).

### 5.6 Other lane kinds

| Lane kind | Drawing |
|---|---|
| Analog | Line per trace, optional second unit axis on the right (CHT-03) |
| Logic | Compact high/low line, red band for X, mid-level blue for Z (DIG-07) |
| Bus | Labelled value segments in binary, decimal, or hex (DIG-08) |
| X-Y | One trace against another, fading trail, bright current point that follows the playhead; optional brightness and color traces for Falstad's 2-D scopes (CHT-34) |
| On canvas | Any lane drawn into a box on the schematic's live layer, panning and zooming with it (CHT-35) |
| Sketch | A lesson's sketch prediction, drawn with the pointer in the lane's own units and shown dashed beside the real trace (LES-04, LES-05) |

All lane kinds share the same axis, cursor, and hover code. The chart in
the analysis tabs (frequency, sweep, spectrum) uses the same renderer
with a different horizontal axis (frequency or a part value instead of
time), which is how every analysis gets cursors, hover readouts, ghosts,
and export at once (ANL-01).

## 6. Open questions

1. **Very long runs.** The History Store bounds memory (see
   [History §2](history-and-analysis.md#2-the-history-store)); the
   renderer copes with any length. Is it acceptable for the chart to show
   coarser detail beyond the oldest full-resolution sample, or should old
   history simply drop off?

// Circuit Simulator Architecture - interactive component diagram
// CANVAS_HEIGHT: 555
// Click any component to see its role in an info box. The "Trace an edit"
// buttons step through what happens when a student drags a slider.
// The diagram is drawn in logical coordinates and scaled down on narrow screens.
// MicroSim template version 2026.03

// ----- canvas layout (standard MicroSim structure) -----
let canvasWidth = 800;
let drawHeight = 475;          // leaves room for a second legend line on narrow screens
let controlHeight = 80;          // two rows of controls: (2 x 35) + 10
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let defaultTextSize = 16;

// the diagram is laid out for at least this logical width, then scaled to fit
const LOGICAL_MIN_WIDTH = 780;
let s = 1;          // drawing scale
let W = 800;        // logical width of the diagram

// ----- controls -----
let componentSelect;
let readMoreLink;
let backButton;
let nextButton;

// ----- state -----
let selectedId = null;   // component whose info box is open
let traceStep = -1;      // -1 = not tracing; 0..6 = step of the edit trace
let hoverId = null;

const DESIGN = '../../design/';

// Color groups for the component boxes
const GROUPS = {
  ui:      { fill: 'lightyellow', label: 'Interface' },
  model:   { fill: 'honeydew',    label: 'Circuit model' },
  results: { fill: 'lavender',    label: 'Results and drawing' },
  store:   { fill: 'mistyrose',   label: 'Storage and reporting' },
  worker:  { fill: 'lightcyan',   label: 'Numerical work' },
  shared:  { fill: 'wheat',       label: 'Shared plug-ins' }
};

// The twenty components from the design overview (Section 3.1).
// col/row place main-thread boxes on a 4-column grid; worker boxes are placed separately.
const COMPONENTS = [
  { id: 'shell', name: 'Application Shell', group: 'ui', thread: 'Main thread', col: 0, row: 0,
    role: 'Everything the student touches that is not a canvas: the top bar, palette, inspector, menus, dialogs, lesson panel, and status bar. Every action is a command in one registry, so menus, shortcuts, lessons, and xAPI all see the same actions.',
    owns: 'Layout, panels, menus, focus, settings', reqs: 'Spec Sections 4, 5, 8, 22, 24',
    page: 'app-shell/' },
  { id: 'tool', name: 'Tool Controller', group: 'ui', thread: 'Main thread', col: 1, row: 0,
    role: 'Interprets pointer and keyboard input on the canvas through exactly one active tool: Select, Place, Wire, the probe tools, Loop, or Junction. Tools never touch the engine; every change they make is a document edit.',
    owns: 'The active tool and its state machine', reqs: 'Spec Sections 7, 8, 13',
    page: 'app-shell/#5-tools-and-input' },
  { id: 'bridge', name: 'Host Bridge', group: 'ui', thread: 'Main thread', col: 2, row: 0,
    role: 'Reads the embed URL parameters, turns the embed mode into a capability set, and carries postMessage traffic with the chapter page. It accepts messages only from the page that embeds the simulator.',
    owns: 'Embed parameters, capabilities, host messages', reqs: 'Spec Section 19',
    page: 'embedding-lessons-xapi/#3-the-host-bridge' },
  { id: 'lesson', name: 'Lesson Engine', group: 'ui', thread: 'Main thread', col: 3, row: 0,
    role: 'Runs guided predict-observe-explain lessons. It loads a YAML lesson file, steps through it, sets each step\'s permissions, and re-checks the student\'s circuit against live values as they work.',
    owns: 'Lesson state, step progression, checks', reqs: 'Spec Section 20',
    page: 'embedding-lessons-xapi/#4-the-lesson-engine' },

  { id: 'edit', name: 'Edit and Undo', group: 'model', thread: 'Main thread', col: 0, row: 1,
    role: 'Turns each gesture (a drag, a slider movement, a paste) into one transaction of small patches with their inverses. Undo replays the inverses. The same patches tell the compiler, autosave, lessons, and xAPI exactly what changed.',
    owns: 'The undo and redo stacks', reqs: 'EDT-31 to EDT-33, PRN-05',
    page: 'circuit-model/#3-edits-transactions-and-undo' },
  { id: 'doc', name: 'Circuit Document', group: 'model', thread: 'Main thread', col: 1, row: 1,
    role: 'The single source of truth for everything saved in a file: parts, wires, labels, probes, chart lanes, sliders, subcircuits, and circuit settings. It contains no physics at all.',
    owns: 'Everything in a circuit file', reqs: 'FIL-02, EDT-31',
    page: 'circuit-model/#2-the-circuit-document' },
  { id: 'compiler', name: 'Netlist Compiler', group: 'model', thread: 'Main thread', col: 2, row: 1,
    role: 'Works out which points are connected, names the nodes, flattens subcircuits, checks the circuit for problems, and produces the netlist the engine solves. Value-only changes skip compiling and go straight to the engine.',
    owns: 'Nothing saved; rebuilt from the document', reqs: 'CAN-10 to CAN-12, EDT-14, EDT-39',
    page: 'circuit-model/#4-the-netlist-compiler' },

  { id: 'persist', name: 'Persistence Service', group: 'store', thread: 'Main thread', col: 0, row: 2,
    role: 'Saves to the browser\'s IndexedDB: My circuits, an autosave one second after each edit, crash recovery, My parts, lesson progress, and the queue of unsent xAPI statements.',
    owns: 'Browser storage', reqs: 'FIL-04 to FIL-09, PRF-06',
    page: 'files-and-persistence/#5-browser-storage' },
  { id: 'measure', name: 'Measurement Library', group: 'results', thread: 'Main thread', col: 1, row: 2,
    role: 'Pure functions over trace data: RMS, frequency, rise time, time constant, phase, and the rest. The chart, its cursors, the multimeter, lesson checks, and sweeps all call the same code.',
    owns: 'Measurement and math-trace functions', reqs: 'CHT-26 to CHT-33',
    page: 'history-and-analysis/#4-measurements-and-math-traces' },
  { id: 'history', name: 'History Store', group: 'results', thread: 'Main thread', col: 2, row: 2,
    role: 'Keeps every probed trace at full resolution in fixed-size chunks, with a min/max/sum pyramid so drawing and measuring stay fast at 100,000+ samples. Also holds ghost copies and the event log.',
    owns: 'Probe traces, ghosts, event markers', reqs: 'CHT-17, CHT-24, PRF-04',
    page: 'history-and-analysis/#2-the-history-store' },
  { id: 'framebus', name: 'Frame Bus', group: 'results', thread: 'Main thread', col: 3, row: 2,
    role: 'Receives each frame from the worker, about 60 a second, and hands it to every subscriber. Scrubbing publishes historical frames the same way, so the schematic and chart always show the same moment.',
    owns: 'Fan-out of frames to subscribers', reqs: 'PRN-04',
    page: 'simulation-engine/#7-the-worker-protocol' },

  { id: 'codecs', name: 'Format Codecs', group: 'store', thread: 'Main thread', col: 0, row: 3,
    role: 'Pure converters between the circuit document and the native JSON file, compressed share links, and Falstad text, XML, and links. They run in Node tests, which open all 366 Falstad examples.',
    owns: 'File and link formats', reqs: 'FIL-01 to FIL-03, FIL-14 to FIL-19',
    page: 'files-and-persistence/#2-the-circuit-file' },
  { id: 'chart', name: 'Chart Renderer', group: 'results', thread: 'Main thread', col: 1, row: 3,
    role: 'A custom Canvas 2D chart: lanes sharing one time axis, roll, sweep, and triggered modes, cursors, and a playhead that drives the schematic when scrubbing. The analysis tabs reuse it with a frequency axis.',
    owns: 'Lanes, axes, traces, cursors, playhead', reqs: 'Spec Section 12',
    page: 'rendering/#5-the-chart-renderer' },
  { id: 'animator', name: 'Current Animator', group: 'results', thread: 'Main thread', col: 2, row: 3,
    role: 'Moves dots along every wire and part at a speed proportional to the current, timed by real time and never by the simulation speed. Kirchhoff\'s current law is visible at every junction by construction.',
    owns: 'Dot phases along every segment', reqs: 'ANI-01 to ANI-10',
    page: 'rendering/#3-the-current-animator' },
  { id: 'schematic', name: 'Schematic Renderer', group: 'results', thread: 'Main thread', col: 3, row: 3,
    role: 'Draws the circuit on layered Canvas 2D: grid, symbols, live voltage colors and glows, current dots, and overlays such as probe flags and selection. Also owns zoom, pan, and hit testing.',
    owns: 'Canvas layers, view transform, hit testing', reqs: 'Spec Sections 6 and 11',
    page: 'rendering/#2-the-schematic-renderer' },

  { id: 'xapi', name: 'xAPI Reporter', group: 'store', thread: 'Main thread', col: 1, row: 4,
    role: 'When the host page turns reporting on, it turns commands, document patches, and lesson events into xAPI learning statements, at most one per second per continuous action, queued and retried without slowing the simulator.',
    owns: 'Statement building, throttling, queue', reqs: 'Spec Section 21',
    page: 'embedding-lessons-xapi/#5-the-xapi-reporter' },
  { id: 'element', name: 'Element Library', group: 'shared', thread: 'Both threads', special: 'straddle',
    role: 'One plug-in per part type, in three pieces: a descriptor (pure data, used everywhere), a model (the physics, loaded only in workers), and a view (the drawing, loaded only on the main thread). Rare categories load on demand.',
    owns: 'Part descriptors, models, and views', reqs: 'Spec Section 9',
    page: 'circuit-model/#5-the-element-plug-in-interface' },

  { id: 'engine', name: 'Simulation Engine', sub: 'solver, digital kernel, state ring', group: 'worker',
    thread: 'Live simulation worker', special: 'engine',
    role: 'Modified nodal analysis with Newton-Raphson and an adaptive trapezoidal integrator, an event-driven digital kernel for mixed-signal circuits, and a ring of the last 20,000 full states for scrubbing. Runs headless in Node for tests.',
    owns: 'Matrix, element state, simulated time', reqs: 'Spec Sections 10 and 17, CHT-23',
    page: 'simulation-engine/' },
  { id: 'host', name: 'Engine Host', group: 'worker', thread: 'Live simulation worker', special: 'host',
    role: 'The run loop inside the worker. It converts real time into a simulated-time budget, applies commands between steps, slows down gracefully when overloaded, and batches results into frames that are transferred, not copied.',
    owns: 'Run state, speed control, frame batching', reqs: 'SIM-01 to SIM-11, PRF-09',
    page: 'simulation-engine/#6-the-engine-host-and-run-loop' },
  { id: 'analysis', name: 'Analysis Service', group: 'worker', thread: 'Analysis worker (on demand)', special: 'analysis',
    role: 'Runs DC operating point, frequency response, parameter sweep, spectrum, and Thevenin jobs in a second worker started on demand, so an analysis never makes the live animation hitch.',
    owns: 'Analysis jobs and their results', reqs: 'Spec Section 14',
    page: 'history-and-analysis/#5-analyses' }
];

// Data flows. cross = crosses a thread boundary (drawn dashed).
const EDGES = [
  { id: 'e1',  from: 'shell',    to: 'edit',      label: 'gestures' },
  { id: 'e2',  from: 'tool',     to: 'edit',      label: 'edits' },
  { id: 'e3',  from: 'edit',     to: 'doc',       label: 'patches' },
  { id: 'e4',  from: 'doc',      to: 'compiler',  label: 'document' },
  { id: 'e5',  from: 'compiler', to: 'host',      label: 'netlist, setParams', cross: true },
  { id: 'e6',  from: 'host',     to: 'engine',    label: 'step' },
  { id: 'e7',  from: 'host',     to: 'framebus',  label: 'frames', cross: true },
  { id: 'e8',  from: 'framebus', to: 'history',   label: 'samples' },
  { id: 'e9',  from: 'framebus', to: 'schematic', label: 'voltages' },
  { id: 'e10', from: 'framebus', to: 'animator',  label: 'currents' },
  { id: 'e11', from: 'framebus', to: 'lesson',    label: 'live values' },
  { id: 'e12', from: 'history',  to: 'chart',     label: 'traces' },
  { id: 'e13', from: 'history',  to: 'measure',   label: 'trace views' },
  { id: 'e14', from: 'measure',  to: 'chart',     label: 'readouts' },
  { id: 'e15', from: 'edit',     to: 'persist',   label: 'autosave' },
  { id: 'e16', from: 'codecs',   to: 'persist',   label: 'files, links' },
  { id: 'e17', from: 'edit',     to: 'xapi',      label: 'patches' },
  { id: 'e18', from: 'lesson',   to: 'xapi',      label: 'lesson events' },
  { id: 'e19', from: 'bridge',   to: 'shell',     label: 'capabilities' },
  { id: 'e20', from: 'lesson',   to: 'bridge',    label: 'progress' },
  { id: 'e21', from: 'compiler', to: 'analysis',  label: 'jobs', cross: true },
  { id: 'e22', from: 'analysis', to: 'chart',     label: 'results', cross: true },
  { id: 'e23', from: 'element',  to: 'compiler',  label: 'descriptors' },
  { id: 'e24', from: 'element',  to: 'engine',    label: 'models', cross: true },
  { id: 'e25', from: 'element',  to: 'schematic', label: 'views' },
  { id: 'e26', from: 'animator', to: 'schematic', label: 'dots' },
  { id: 'e27', from: 'compiler', to: 'schematic', label: 'nodes, segments' }
];

// "Trace an edit": the seven steps of Section 3.2 of the design overview
const TRACE = [
  { title: '1. The student drags a slider', anchor: 'shell', nodes: ['shell', 'edit'], edges: ['e1'],
    text: 'The Application Shell turns the drag on R1\'s slider into a gesture and asks Edit and Undo to open a transaction.' },
  { title: '2. The document changes', anchor: 'doc', nodes: ['edit', 'doc'], edges: ['e3'],
    text: 'Each pointer move updates the Circuit Document inside the open transaction, which emits a patch such as "R1 resistance = 1.37 kOhm".' },
  { title: '3. Only a value changed', anchor: 'compiler', nodes: ['doc', 'compiler', 'host'], edges: ['e4', 'e5'],
    text: 'The Netlist Compiler sees that the patch changes a value, not the wiring, skips recompiling, and sends a setParams command to the worker.' },
  { title: '4. The worker applies it', anchor: 'host', nodes: ['host', 'engine'], edges: ['e6'],
    text: 'The Engine Host applies the new value before the next time step, adds an event marker, and keeps running. Nothing is reset.' },
  { title: '5. A frame comes back', anchor: 'framebus', nodes: ['host', 'framebus'], edges: ['e7'],
    text: 'Within about 16 ms the worker transfers a frame: new probe samples, the latest node voltages and currents, and the event.' },
  { title: '6. Everyone sees the same moment', anchor: 'analysis',
    nodes: ['framebus', 'history', 'schematic', 'animator', 'chart', 'lesson'], edges: ['e8', 'e9', 'e10', 'e11', 'e12'],
    text: 'The Frame Bus hands the frame to the History Store, Schematic Renderer, Current Animator, and Lesson Engine. The chart redraws from the history.' },
  { title: '7. The slider is released', anchor: 'edit', nodes: ['edit', 'persist', 'xapi'], edges: ['e15', 'e17'],
    text: 'The transaction closes as one undo step. The Persistence Service autosaves, and the xAPI Reporter sends one statement for the whole drag.' }
];

let boxes = {};     // id -> {x, y, w, h} in logical coordinates
let panels = {};    // background panels

function setup() {
  updateCanvasSize();
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main'));
  textSize(defaultTextSize);

  // Row 1: choose a component (keyboard-accessible alternative to clicking)
  componentSelect = createSelect();
  componentSelect.parent(document.querySelector('main'));
  componentSelect.option('Choose a component...', '');
  for (const c of COMPONENTS) componentSelect.option(c.name, c.id);
  componentSelect.position(110, drawHeight + 8);
  componentSelect.size(210);
  componentSelect.changed(() => {
    const v = componentSelect.value();
    if (v) selectComponent(v); else clearSelection();
  });

  readMoreLink = createA(DESIGN, 'Read the design overview', '_top');
  readMoreLink.parent(document.querySelector('main'));
  readMoreLink.position(340, drawHeight + 9);
  readMoreLink.style('font-size', '16px');

  // Row 2: step through what happens during one edit
  backButton = createButton('Back');
  backButton.parent(document.querySelector('main'));
  backButton.position(130, drawHeight + 43);
  backButton.mousePressed(traceBack);

  nextButton = createButton('Next step');
  nextButton.parent(document.querySelector('main'));
  nextButton.position(190, drawHeight + 43);
  nextButton.mousePressed(traceNext);

  computeLayout();
  describe('Architecture diagram of the circuit simulator. The main thread holds the interface, circuit model, results, drawing, and storage components; worker threads hold the simulation engine, engine host, and analysis service. Click a component, or choose it from the list, to see its role. The Next step button traces what happens when a student drags a slider.', FALLBACK);
}

function draw() {
  updateCanvasSize();

  // standard MicroSim regions
  stroke('silver');
  strokeWeight(1);
  fill('aliceblue');
  rect(0, 0, canvasWidth, drawHeight);
  fill('white');
  rect(0, drawHeight, canvasWidth, controlHeight);

  hoverId = (mouseY >= 0 && mouseY < drawHeight) ? hitTest(mouseX / s, mouseY / s) : null;
  cursor(hoverId ? HAND : ARROW);

  push();
  scale(s);
  drawTitle();
  drawPanels();
  const hl = highlights();
  drawEdges(hl);
  drawBoxes(hl);
  drawLegend();
  if (traceStep >= 0) drawInfoBox(TRACE[traceStep].anchor, traceContent(TRACE[traceStep]));
  else if (selectedId) drawInfoBox(selectedId, componentContent(byId(selectedId)));
  pop();

  drawControlLabels();
}

// ---------- layout ----------

function computeLayout() {
  const splitX = W * 0.64;
  const top = 50, bottom = 404;
  panels.main = { x: 10, y: top, w: splitX - 16, h: bottom - top };
  panels.worker = { x: splitX + 6, y: top, w: W - splitX - 16, h: bottom - top };

  const pad = 12, gap = 10;
  const colW = (panels.main.w - 2 * pad - 3 * gap) / 4;
  const rowY = r => 100 + r * 64;
  const boxH = 42;

  for (const c of COMPONENTS) {
    if (c.col !== undefined) {
      boxes[c.id] = { x: panels.main.x + pad + c.col * (colW + gap), y: rowY(c.row), w: colW, h: boxH };
    }
  }
  // Element Library straddles the thread boundary on the bottom row
  boxes.element = { x: splitX - colW / 2, y: rowY(4), w: colW, h: boxH };

  // worker side: live worker group (engine + host) and analysis worker group
  const gx = panels.worker.x + 10, gw = panels.worker.w - 20;
  panels.live = { x: gx, y: 76, w: gw, h: 142, label: 'Live simulation worker' };
  panels.analysis = { x: gx, y: 268, w: gw, h: 78, label: 'Analysis worker (on demand)' };
  boxes.engine = { x: gx + 14, y: rowY(0), w: gw - 28, h: 48 };
  boxes.host = { x: gx + 14, y: rowY(1), w: gw - 28, h: boxH };
  boxes.analysis = { x: gx + 14, y: 294, w: gw - 28, h: boxH };
}

// ---------- drawing ----------

function drawTitle() {
  fill('black');
  noStroke();
  textAlign(CENTER, TOP);
  textSize(22);
  textStyle(BOLD);
  text('Circuit Simulator Architecture', W / 2, 12);
  textStyle(NORMAL);
}

function drawPanels() {
  stroke('silver');
  strokeWeight(1);
  fill('white');
  rect(panels.main.x, panels.main.y, panels.main.w, panels.main.h, 8);
  fill('ghostwhite');
  rect(panels.worker.x, panels.worker.y, panels.worker.w, panels.worker.h, 8);

  noStroke();
  fill('dimgray');
  textAlign(LEFT, TOP);
  textSize(15);
  textStyle(BOLD);
  text('Main thread', panels.main.x + 10, panels.main.y + 6);
  text('Worker threads', panels.worker.x + 10, panels.worker.y + 6);
  textStyle(NORMAL);

  for (const key of ['live', 'analysis']) {
    const p = panels[key];
    stroke('lightsteelblue');
    fill('white');
    rect(p.x, p.y, p.w, p.h, 6);
    noStroke();
    fill('steelblue');
    textSize(13);
    textAlign(LEFT, TOP);
    text(p.label, p.x + 8, p.y + 5);
  }
}

// Which components and edges are emphasized right now
function highlights() {
  if (traceStep >= 0) {
    const t = TRACE[traceStep];
    return { active: true, nodes: new Set(t.nodes), edges: new Set(t.edges) };
  }
  if (selectedId) {
    const nodes = new Set([selectedId]);
    const edges = new Set();
    for (const e of EDGES) {
      if (e.from === selectedId || e.to === selectedId) {
        edges.add(e.id);
        nodes.add(e.from);
        nodes.add(e.to);
      }
    }
    return { active: true, nodes, edges, focus: selectedId };
  }
  return { active: false, nodes: new Set(), edges: new Set() };
}

function drawEdges(hl) {
  // faint edges first, highlighted edges on top
  for (const pass of [false, true]) {
    for (const e of EDGES) {
      const on = hl.edges.has(e.id);
      if (on !== pass) continue;
      const [p1, p2] = edgeEnds(boxes[e.from], boxes[e.to]);
      const col = on ? color('darkorange') : color('gray');
      col.setAlpha(on ? 255 : (hl.active ? 45 : 120));
      stroke(col);
      fill(col);
      strokeWeight(on ? 2.5 : 1.2);
      if (e.cross) drawingContext.setLineDash([6, 5]);
      line(p1.x, p1.y, p2.x, p2.y);
      drawingContext.setLineDash([]);
      arrowHead(p1, p2, on ? 9 : 7);
    }
  }
  // labels for highlighted edges only, to keep the picture calm
  for (const e of EDGES) {
    if (!hl.edges.has(e.id)) continue;
    const [p1, p2] = edgeEnds(boxes[e.from], boxes[e.to]);
    edgeLabel(e.label, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  }
}

function edgeLabel(str, x, y) {
  textSize(13);
  const w = textWidth(str) + 10;
  stroke('darkorange');
  strokeWeight(1);
  fill('white');
  rect(x - w / 2, y - 10, w, 20, 10);
  noStroke();
  fill('saddlebrown');
  textAlign(CENTER, CENTER);
  text(str, x, y);
}

function arrowHead(p1, p2, size) {
  const a = atan2(p2.y - p1.y, p2.x - p1.x);
  noStroke();
  push();
  translate(p2.x, p2.y);
  rotate(a);
  triangle(0, 0, -size, -size / 2.2, -size, size / 2.2);
  pop();
}

// Clip the line between two box centers to each box's border
function edgeEnds(a, b) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return [clipToBox(ca, cb, a, 2), clipToBox(cb, ca, b, 4)];
}

function clipToBox(c, toward, box, gap) {
  const dx = toward.x - c.x, dy = toward.y - c.y;
  const tx = dx === 0 ? Infinity : (box.w / 2 + gap) / abs(dx);
  const ty = dy === 0 ? Infinity : (box.h / 2 + gap) / abs(dy);
  const t = min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function drawBoxes(hl) {
  for (const c of COMPONENTS) {
    const b = boxes[c.id];
    const dim = hl.active && !hl.nodes.has(c.id);
    const fillCol = color(GROUPS[c.group].fill);
    if (dim) fillCol.setAlpha(110);
    const isFocus = hl.focus === c.id || (traceStep >= 0 && hl.nodes.has(c.id));
    const isHover = hoverId === c.id;

    stroke(isFocus ? 'darkorange' : (isHover ? 'steelblue' : (dim ? 'gainsboro' : 'gray')));
    strokeWeight(isFocus ? 3 : (isHover ? 2 : 1));
    fill(fillCol);
    rect(b.x, b.y, b.w, b.h, 6);

    noStroke();
    fill(dim ? 'darkgray' : 'black');
    textAlign(CENTER, CENTER);
    if (c.sub) {
      boxLabel(c.name, b, b.y + 16, 15, true);
      fill(dim ? 'darkgray' : 'dimgray');
      boxLabel(c.sub, b, b.y + 35, 12, false);
    } else {
      boxLabel(c.name, b, b.y + b.h / 2, 14, true);
    }
  }
}

// Draw a box label on one line if it fits, otherwise on two lines
function boxLabel(str, b, cy, size, bold) {
  textStyle(bold ? BOLD : NORMAL);
  textSize(size);
  if (textWidth(str) <= b.w - 8) {
    text(str, b.x + b.w / 2, cy);
  } else {
    const words = str.split(' ');
    const half = Math.ceil(words.length / 2);
    text(words.slice(0, half).join(' '), b.x + b.w / 2, cy - 8);
    text(words.slice(half).join(' '), b.x + b.w / 2, cy + 8);
  }
  textStyle(NORMAL);
}

function drawLegend() {
  let x = 14;
  let y = 412;
  textSize(13);
  textAlign(LEFT, CENTER);
  for (const key of Object.keys(GROUPS)) {
    const g = GROUPS[key];
    // wrap to a second legend line when the next item would run off the right edge
    if (x + 19 + textWidth(g.label) > W - 14) {
      x = 14;
      y += 20;
    }
    stroke('gray');
    strokeWeight(1);
    fill(g.fill);
    rect(x, y, 14, 14, 3);
    noStroke();
    fill('black');
    text(g.label, x + 19, y + 7);
    x += 19 + textWidth(g.label) + 16;
  }
  // dashed-line key
  if (x + 34 + textWidth('crosses threads') > W - 14) {
    x = 14;
    y += 20;
  }
  stroke('gray');
  strokeWeight(1.2);
  drawingContext.setLineDash([6, 5]);
  line(x, y + 7, x + 28, y + 7);
  drawingContext.setLineDash([]);
  noStroke();
  fill('black');
  text('crosses threads', x + 34, y + 7);

  fill('dimgray');
  textAlign(CENTER, CENTER);
  textSize(14);
  text('Click any component to see its role. Use Next step to trace one edit through the system.', W / 2, y + 30);
}

// ---------- info box ----------

function componentContent(c) {
  const talks = [];
  for (const e of EDGES) {
    if (e.from === c.id) talks.push(byId(e.to).name + ' (' + e.label + ')');
    else if (e.to === c.id) talks.push('from ' + byId(e.from).name);
  }
  return [
    { text: c.name, size: 18, bold: true },
    { text: c.thread + '  |  ' + GROUPS[c.group].label, size: 13, color: 'dimgray' },
    { text: c.role, size: 14, gap: 6 },
    { text: 'Owns: ' + c.owns, size: 13, gap: 6 },
    { text: 'Connects to: ' + talks.join('; '), size: 13 },
    { text: 'Requirements: ' + c.reqs, size: 13, color: 'dimgray' }
  ];
}

function traceContent(t) {
  return [
    { text: 'Trace an edit: step ' + (traceStep + 1) + ' of ' + TRACE.length, size: 13, color: 'dimgray' },
    { text: t.title, size: 18, bold: true },
    { text: t.text, size: 14, gap: 6 }
  ];
}

function drawInfoBox(anchorId, content) {
  const b = boxes[anchorId];
  // popups for worker components stay inside the worker panel so they do not hide the main thread
  const inWorker = byId(anchorId).group === 'worker';
  const left = inWorker ? panels.worker.x : 10;
  const right = inWorker ? panels.worker.x + panels.worker.w : W - 10;
  const boxW = min(400, right - left);
  const padIn = 12;
  // wrap every item to measure the total height
  let h = padIn;
  const laid = [];
  for (const item of content) {
    textSize(item.size);
    textStyle(item.bold ? BOLD : NORMAL);
    const lines = wrapText(item.text, boxW - 2 * padIn);
    const lh = item.size * 1.3;
    h += (item.gap || 0);
    laid.push({ item, lines, lh, y: h });
    h += lines.length * lh;
  }
  h += padIn;
  textStyle(NORMAL);

  // place below the box if there is room, otherwise above; keep inside the drawing area
  let x = constrain(b.x + b.w / 2 - boxW / 2, left, right - boxW);
  let y = b.y + b.h + 10;
  if (y + h > drawHeight / s - 6) y = b.y - h - 10;
  y = constrain(y, 6, drawHeight / s - h - 6);

  stroke('darkorange');
  strokeWeight(2);
  fill(255, 255, 255, 245);
  rect(x, y, boxW, h, 10);

  noStroke();
  textAlign(LEFT, TOP);
  for (const L of laid) {
    textSize(L.item.size);
    textStyle(L.item.bold ? BOLD : NORMAL);
    fill(L.item.color || 'black');
    let ly = y + L.y;
    for (const line of L.lines) {
      text(line, x + padIn, ly);
      ly += L.lh;
    }
  }
  textStyle(NORMAL);
}

// Greedy word wrap using the current text size
function wrapText(str, maxW) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (textWidth(test) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- control labels ----------

function drawControlLabels() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(defaultTextSize);
  text('Component:', 10, drawHeight + 20);
  text('Trace an edit:', 10, drawHeight + 55);
  const stepText = traceStep < 0 ? 'Not started' : 'Step ' + (traceStep + 1) + ' of ' + TRACE.length;
  const nx = 190 + nextButton.elt.offsetWidth + 15;
  text(stepText, nx, drawHeight + 55);
}

// ---------- interaction ----------

function hitTest(lx, ly) {
  for (const c of COMPONENTS) {
    const b = boxes[c.id];
    if (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) return c.id;
  }
  return null;
}

function mousePressed() {
  if (mouseY < 0 || mouseY >= drawHeight || mouseX < 0 || mouseX > canvasWidth) return;
  const id = hitTest(mouseX / s, mouseY / s);
  if (id) selectComponent(id);
  else clearSelection();
}

function keyPressed() {
  if (keyCode === ESCAPE) clearSelection();
}

function selectComponent(id) {
  traceStep = -1;
  selectedId = id;
  componentSelect.selected(id);
  const c = byId(id);
  readMoreLink.attribute('href', DESIGN + c.page);
  readMoreLink.html('Read about the ' + c.name);
}

function clearSelection() {
  selectedId = null;
  traceStep = -1;
  componentSelect.selected('');
  readMoreLink.attribute('href', DESIGN);
  readMoreLink.html('Read the design overview');
}

function traceNext() {
  selectedId = null;
  componentSelect.selected('');
  traceStep = min(traceStep + 1, TRACE.length - 1);
  readMoreLink.attribute('href', DESIGN + '#32-how-a-change-flows-through-the-system');
  readMoreLink.html('Read how a change flows');
}

function traceBack() {
  if (traceStep <= 0) return;
  traceStep -= 1;
}

function byId(id) {
  return COMPONENTS.find(c => c.id === id);
}

// ---------- responsiveness ----------

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
  computeLayout();
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = Math.floor(container.getBoundingClientRect().width);
    s = min(1, canvasWidth / LOGICAL_MIN_WIDTH);
    W = canvasWidth / s;
  }
}

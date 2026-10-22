/*
 * circuit-embed.js: turns <div class="circuit-embed" data-...> placeholders
 * into simulator iframes, sizes them from the simulator's preferredHeight
 * messages (EMB-08), and exposes a small API for page scripts:
 *
 *   const sim = CircuitEmbed.get("ch3-lrc");
 *   sim.run(); sim.pause(); sim.reset(); sim.resetToOriginal();
 *   sim.setValue("R1", "resistance", 4700); sim.setSwitch("S1", true);
 *   sim.addProbe("C1"); sim.loadCircuit({ example: "lrc.txt" });
 *   sim.getState().then((s) => console.log(s.probes));
 *   sim.on("runStateChanged", (payload) => ...);
 *
 * Message protocol: docs/design/embedding-lessons-xapi.md section 3.
 * No dependencies. Safe to include on every page of the book.
 */
(function () {
  "use strict";
  if (window.CircuitEmbed) return;

  var PROTOCOL = "circuit-simulator";
  var VERSION = 1;
  // data-* attribute -> URL parameter (spec section 19.1).
  var PARAMS = ["circuit", "example", "ctz", "c", "mode", "panels", "layout", "window", "speed", "current",
    "realistic", "theme", "symbols", "lock", "id", "xapi", "lang", "height", "allow", "lesson"];

  var scriptSrc = (document.currentScript && document.currentScript.src) || "";
  var embeds = {};
  var counter = 0;

  /** The simulator lives in ../simulator/ relative to this script (docs/js/ -> docs/simulator/). */
  function simulatorBase(el) {
    if (el.dataset.simulator) return new URL(el.dataset.simulator, document.baseURI).href;
    if (scriptSrc) return new URL("../simulator/", scriptSrc).href;
    return new URL("simulator/", document.baseURI).href;
  }

  function pageTheme() {
    var scheme = document.body && document.body.getAttribute("data-md-color-scheme");
    return scheme === "slate" ? "dark" : undefined;
  }

  function Embed(iframe, id) {
    this.iframe = iframe;
    this.id = id;
    this.origin = new URL(iframe.src, document.baseURI).origin;
    this.ready = false;
    this.listeners = {};
    this.pending = {};
    this.seq = 0;
    this.queue = [];
  }

  Embed.prototype.send = function (type, payload, expectReply) {
    var self = this;
    var msg = { protocol: PROTOCOL, version: VERSION, embedId: this.id, type: type, payload: payload || {} };
    var p;
    if (expectReply) {
      msg.requestId = this.id + "-" + ++this.seq;
      p = new Promise(function (resolve, reject) {
        self.pending[msg.requestId] = { resolve: resolve, reject: reject };
      });
    }
    if (this.ready) this.iframe.contentWindow.postMessage(msg, this.origin);
    else this.queue.push(msg);
    return p;
  };

  Embed.prototype.request = function (type, payload) {
    return this.send(type, payload, true);
  };
  Embed.prototype.run = function () { return this.request("run"); };
  Embed.prototype.pause = function () { return this.request("pause"); };
  Embed.prototype.step = function () { return this.request("step"); };
  Embed.prototype.reset = function () { return this.request("reset"); };
  Embed.prototype.resetToOriginal = function () { return this.request("reset", { original: true }); };
  Embed.prototype.setValue = function (part, prop, value) { return this.request("setValue", { part: part, prop: prop, value: value }); };
  Embed.prototype.setSwitch = function (part, closed) { return this.request("setSwitch", { part: part, closed: !!closed }); };
  Embed.prototype.addProbe = function (part) { return this.request("addProbe", { part: part }); };
  Embed.prototype.loadCircuit = function (source) { return this.request("loadCircuit", source); };
  Embed.prototype.getState = function () { return this.request("getState"); };
  Embed.prototype.configureXapi = function (config) { return this.request("configureXapi", config); };

  /** Listen for "ready", "preferredHeight", "runStateChanged", "circuitChanged", "lessonProgress", "xapiStatement", or "*". */
  Embed.prototype.on = function (type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
    var self = this;
    return function () {
      self.listeners[type] = (self.listeners[type] || []).filter(function (f) { return f !== fn; });
    };
  };

  Embed.prototype.receive = function (msg) {
    var self = this;
    if (msg.type === "ready") {
      this.ready = true;
      this.queue.splice(0).forEach(function (m) { self.iframe.contentWindow.postMessage(m, self.origin); });
    } else if (msg.type === "preferredHeight" && msg.payload && msg.payload.height > 0) {
      if (!this.iframe.dataset.fixedHeight) this.iframe.style.height = Math.round(msg.payload.height) + "px";
    } else if (msg.type === "reply" && msg.requestId && this.pending[msg.requestId]) {
      var p = this.pending[msg.requestId];
      delete this.pending[msg.requestId];
      if (msg.payload && msg.payload.ok) p.resolve(msg.payload.result);
      else p.reject(new Error((msg.payload && msg.payload.error) || "failed"));
    }
    (this.listeners[msg.type] || []).concat(this.listeners["*"] || []).forEach(function (fn) {
      try { fn(msg.payload, msg); } catch (e) { console.error(e); }
    });
    if (msg.type === "xapiStatement") {
      document.dispatchEvent(new CustomEvent("circuit-embed:xapi", { detail: { embedId: this.id, statement: msg.payload.statement } }));
    }
  };

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.protocol !== PROTOCOL || m.version !== VERSION) return;
    for (var id in embeds) {
      var em = embeds[id];
      // Only the simulator frame we created, from its own origin.
      if (e.source !== em.iframe.contentWindow || e.origin !== em.origin) continue;
      // An adopted iframe without an id learns the simulator's generated one from "ready".
      if (em.learnId && m.type === "ready") {
        em.learnId = false;
        delete embeds[id];
        em.id = m.embedId;
        embeds[em.id] = em;
      }
      if (m.embedId === em.id) em.receive(m);
      return;
    }
  });

  function build(el) {
    if (el.dataset.embedReady) return;
    el.dataset.embedReady = "1";
    var id = el.dataset.id || el.id || "embed-" + ++counter;
    var url = new URL(simulatorBase(el));
    var data = Object.assign({}, el.dataset, { id: id });
    if (!data.theme && pageTheme()) data.theme = pageTheme();
    PARAMS.forEach(function (k) {
      if (data[k] !== undefined && data[k] !== "") url.searchParams.set(k, data[k]);
    });
    var iframe = document.createElement("iframe");
    iframe.className = "circuit-sim";
    iframe.src = url.href;
    iframe.title = el.dataset.title || "Circuit simulation";
    iframe.loading = "lazy";
    iframe.allow = "clipboard-write";
    iframe.style.height = (parseInt(el.dataset.height, 10) || 480) + "px";
    if (el.dataset.height) iframe.dataset.fixedHeight = "1";
    el.textContent = "";
    el.appendChild(iframe);
    var em = new Embed(iframe, id);
    embeds[id] = em;
    return em;
  }

  /** Adopt hand-written <iframe class="circuit-sim" src="...simulator/?id=..."> too. */
  function adopt(iframe) {
    if (iframe.dataset.embedReady) return;
    iframe.dataset.embedReady = "1";
    var given = new URL(iframe.src, document.baseURI).searchParams.get("id");
    var em = new Embed(iframe, given || "pending-" + ++counter);
    em.learnId = !given;
    embeds[em.id] = em;
  }

  function scan(root) {
    (root || document).querySelectorAll("div.circuit-embed").forEach(build);
    (root || document).querySelectorAll("iframe.circuit-sim").forEach(adopt);
  }

  window.CircuitEmbed = {
    scan: scan,
    get: function (id) { return embeds[id]; },
    all: function () { return Object.keys(embeds).map(function (k) { return embeds[k]; }); },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { scan(); });
  else scan();
  // MkDocs Material instant navigation swaps page content without a reload.
  if (window.document$ && typeof window.document$.subscribe === "function") window.document$.subscribe(function () { scan(); });
})();

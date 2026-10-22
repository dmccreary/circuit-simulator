// Markdown-lite for step text: paragraphs, bullet and numbered lists, **bold**,
// *italic* and `code`. It returns a tree, never HTML, so lesson text cannot
// inject markup (LES-02).

export type Inline = { kind: "text" | "bold" | "italic" | "code"; text: string };
export type Block = { kind: "p"; inlines: Inline[] } | { kind: "ul" | "ol"; items: Inline[][] };

const LIST = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

export function parseMarkdownLite(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | undefined;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", inlines: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: list.kind, items: list.items.map(parseInline) });
    list = undefined;
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const m = LIST.exec(raw);
    if (m) {
      flushPara();
      const kind = m[1] ? "ul" : "ol";
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push(m[3]);
    } else if (list && /^\s+/.test(raw)) {
      // An indented line continues the previous item.
      list.items[list.items.length - 1] += " " + line;
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "bold", text: m[2] });
    else out.push({ kind: "italic", text: m[3] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  return out;
}

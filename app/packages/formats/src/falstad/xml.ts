// A small XML reader (no DOM, no dependencies) for Falstad's <cir> files:
// elements, attributes, text, comments, CDATA, processing instructions, and
// the five named entities plus numeric character references.

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated text directly inside this element (entities decoded). */
  text: string;
  /** 1-based line of the start tag. */
  line: number;
  /** Source text of the start tag. */
  raw: string;
}

export class XmlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`${message} (line ${line})`);
  }
}

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e] ?? m;
  });
}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const SPACE = /\s*/y;
const ATTR_VALUE = /"([^"]*)"|'([^']*)'/y;

/** Parse a document; returns its root element. Throws XmlError on malformed input. */
export function parseXml(src: string): XmlNode {
  let pos = 0;
  let line = 1;
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;

  const advance = (to: number) => {
    for (let k = pos; k < to; k++) if (src.charCodeAt(k) === 10) line++;
    pos = to;
  };
  const skipTo = (marker: string, what: string) => {
    const end = src.indexOf(marker, pos);
    if (end < 0) throw new XmlError(`unterminated ${what}`, line);
    const body = src.slice(pos, end);
    advance(end + marker.length);
    return body;
  };
  const match = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (m) advance(re.lastIndex);
    return m;
  };

  while (pos < src.length) {
    const lt = src.indexOf("<", pos);
    const textEnd = lt < 0 ? src.length : lt;
    if (textEnd > pos) {
      const text = src.slice(pos, textEnd);
      if (stack.length) stack[stack.length - 1].text += decodeEntities(text);
      else if (text.trim()) throw new XmlError("text outside the root element", line);
      advance(textEnd);
      if (lt < 0) break;
    }
    if (src.startsWith("<!--", pos)) {
      advance(pos + 4);
      skipTo("-->", "comment");
    } else if (src.startsWith("<![CDATA[", pos)) {
      advance(pos + 9);
      const body = skipTo("]]>", "CDATA section");
      if (stack.length) stack[stack.length - 1].text += body;
    } else if (src.startsWith("<?", pos)) {
      skipTo("?>", "processing instruction");
    } else if (src.startsWith("<!", pos)) {
      skipTo(">", "declaration");
    } else if (src.startsWith("</", pos)) {
      advance(pos + 2);
      const name = match(NAME)?.[0];
      match(SPACE);
      if (!name || src[pos] !== ">") throw new XmlError("malformed end tag", line);
      advance(pos + 1);
      const open = stack.pop();
      if (!open || open.tag !== name) throw new XmlError(`unexpected </${name}>`, line);
    } else {
      const start = pos;
      const startLine = line;
      advance(pos + 1);
      const tag = match(NAME)?.[0];
      if (!tag) throw new XmlError("malformed start tag", line);
      const node: XmlNode = { tag, attrs: {}, children: [], text: "", line: startLine, raw: "" };
      for (;;) {
        match(SPACE);
        if (src.startsWith("/>", pos) || src[pos] === ">") break;
        const name = match(NAME)?.[0];
        match(SPACE);
        if (!name || src[pos] !== "=") throw new XmlError(`malformed attribute in <${tag}>`, line);
        advance(pos + 1);
        match(SPACE);
        const v = match(ATTR_VALUE);
        if (!v) throw new XmlError(`unquoted attribute value in <${tag}>`, line);
        node.attrs[name] = decodeEntities(v[1] ?? v[2] ?? "");
      }
      const selfClosing = src[pos] === "/";
      advance(pos + (selfClosing ? 2 : 1));
      node.raw = src.slice(start, pos);
      if (stack.length) stack[stack.length - 1].children.push(node);
      else if (root) throw new XmlError("more than one root element", startLine);
      else root = node;
      if (!selfClosing) stack.push(node);
    }
  }
  if (stack.length) throw new XmlError(`<${stack[stack.length - 1].tag}> is not closed`, line);
  if (!root) throw new XmlError("no root element", line);
  return root;
}

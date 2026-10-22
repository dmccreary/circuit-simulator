import { Fragment, useMemo } from "react";
import { parseMarkdownLite, type Inline } from "@cs/lesson";

function Inlines({ list }: { list: Inline[] }) {
  return (
    <>
      {list.map((x, i) =>
        x.kind === "bold" ? (
          <strong key={i}>{x.text}</strong>
        ) : x.kind === "italic" ? (
          <em key={i}>{x.text}</em>
        ) : x.kind === "code" ? (
          <code key={i}>{x.text}</code>
        ) : (
          <Fragment key={i}>{x.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Step text as React elements; lesson text never becomes HTML (LES-02). */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdownLite(text), [text]);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "p")
          return (
            <p key={i}>
              <Inlines list={b.inlines} />
            </p>
          );
        const items = b.items.map((it, j) => (
          <li key={j}>
            <Inlines list={it} />
          </li>
        ));
        return b.kind === "ul" ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
      })}
    </>
  );
}

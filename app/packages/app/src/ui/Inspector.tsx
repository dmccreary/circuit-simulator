import { useEffect, useState } from "react";
import { Checkbox, FieldError, Input, Label, TextField } from "react-aria-components";
import type { Part, PropValue } from "@cs/model";
import { getDescriptor, type PropSpec } from "@cs/elements";
import { formatValue, parseValue, UNIT_SYMBOL } from "@cs/units";
import { useApp, useController, useDocument } from "./context";
import { propLabel, t } from "../messages";
import { SlidersPanel } from "../edit/SlidersPanel";
import { SubcircuitPanel } from "../subcircuit/SubcircuitPanel";
import { ProbeInspector } from "../probes/ProbeInspector";
import { ExplainBox } from "../meters/ExplainBox";
import { AC_HEADING, orderedProps } from "../analysis/ac-props";

function NumberField({ part, spec }: { part: Part; spec: PropSpec }) {
  const c = useController();
  const value = part.props[spec.key];
  const shown = typeof value === "number" ? formatValue(value, spec.unit, { trimZeros: true }) : String(value ?? "");
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setText(shown);
    setError(undefined);
  }, [shown]);

  const apply = () => {
    const v = parseValue(text, spec.unit);
    if (v === null) return setError(`Not a value in ${UNIT_SYMBOL[spec.unit] || "these units"}`);
    if (spec.range && (v < spec.range[0] || v > spec.range[1])) {
      // EDT-27: refuse, and say what the range is.
      return setError(`Must be between ${formatValue(spec.range[0], spec.unit)} and ${formatValue(spec.range[1], spec.unit)}`);
    }
    setError(undefined);
    if (v !== value) {
      c.editSheet({ key: "edit.setValue", values: { prop: spec.key } }, (d) => {
        d.parts[part.id].props[spec.key] = v;
      });
    }
  };

  return (
    <TextField
      className="field"
      value={text}
      onChange={setText}
      onBlur={apply}
      onKeyDown={(e) => e.key === "Enter" && apply()}
      isInvalid={!!error}
    >
      <Label>{propLabel(spec.key)}</Label>
      <Input />
      <FieldError>{error}</FieldError>
    </TextField>
  );
}

function setProp(c: ReturnType<typeof useController>, part: Part, key: string, v: PropValue) {
  c.editSheet({ key: "edit.setValue", values: { prop: key } }, (d) => {
    d.parts[part.id].props[key] = v;
  });
}

/** One generated form for every part type, from its PropSpec list (app-shell.md §4). */
export function Inspector() {
  const c = useController();
  const selection = useApp((s) => s.selection);
  // While looking inside a subcircuit, the parts of that definition (EDT-36).
  const parts = useDocument((d) => (c.sheet?.view(d) ?? d).parts);
  const part = selection.length === 1 ? parts[selection[0]] : undefined;
  const d = part && getDescriptor(part.type);
  const probes = useDocument((doc) => doc.probes);
  const probe = selection.length === 1 ? probes[selection[0]] : undefined;

  return (
    <aside className="inspector" aria-label={t("inspector.title")}>
      <h2>{t("inspector.title")}</h2>
      {!part || !d ? (
        probe ? <ProbeInspector probe={probe} /> : <p className="hint">{t("inspector.empty")}</p>
      ) : (
        <form onSubmit={(e) => e.preventDefault()} key={part.id}>
          <p className="part-title">
            <strong>{part.label || part.type}</strong> <span className="type">{part.type}</span>
          </p>
          {part.type === "subcircuit" && <SubcircuitPanel part={part} />}
          {(part.type === "subcircuit" ? [] : orderedProps(d.props)).map((spec) => {
            if (spec.key === AC_HEADING) return <h3 key={spec.key} className="inspector-group">{t("analysis.acHeading")}</h3>;
            const kind = spec.kind ?? "number";
            if (kind === "boolean")
              return (
                <Checkbox
                  key={spec.key}
                  className="check"
                  isSelected={part.props[spec.key] === true}
                  onChange={(v) => setProp(c, part, spec.key, v)}
                >
                  <span className="box" aria-hidden /> {propLabel(spec.key)}
                </Checkbox>
              );
            if (kind === "enum")
              return (
                <label key={spec.key} className="field">
                  {propLabel(spec.key)}
                  <select value={String(part.props[spec.key])} onChange={(e) => setProp(c, part, spec.key, e.target.value)}>
                    {(spec.options ?? []).map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              );
            if (kind === "text")
              return (
                <TextField key={spec.key} className="field" value={String(part.props[spec.key] ?? "")} onChange={(v) => setProp(c, part, spec.key, v)}>
                  <Label>{propLabel(spec.key)}</Label>
                  <Input />
                </TextField>
              );
            return <NumberField key={spec.key} part={part} spec={spec} />;
          })}
          <ExplainBox partId={part.id} />
        </form>
      )}
      {selection.length > 1 && <SubcircuitPanel />}
      <SlidersPanel />
    </aside>
  );
}

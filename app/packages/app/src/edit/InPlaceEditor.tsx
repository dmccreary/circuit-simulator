import { useState, type KeyboardEvent } from "react";
import { Button, FieldError, Input, Label, TextField } from "react-aria-components";
import type { Part } from "@cs/model";
import { getDescriptor, type PropSpec } from "@cs/elements";
import { formatValue, parseValue, UNIT_SYMBOL } from "@cs/units";
import { useController, useDocument } from "../ui/context";
import { useShell, useShellUi } from "../layout/use-shell";
import { propLabel, t } from "../messages";

/** The value shown on the canvas: the first number prop marked showOnCanvas, else the first number prop. */
export function mainProp(part: Part): PropSpec | undefined {
  const props = (getDescriptor(part.type)?.props ?? []).filter((p) => (p.kind ?? "number") === "number");
  return props.find((p) => p.showOnCanvas) ?? props[0];
}

/** Label and main value edited over the part on the canvas (EDT-25). */
export function InPlaceEditor() {
  const editing = useShellUi((s) => s.editing);
  const part = useDocument((d) => (editing ? d.parts[editing] : undefined));
  if (!editing || !part) return null;
  return <EditorForm key={editing} part={part} />;
}

function EditorForm({ part }: { part: Part }) {
  const c = useController();
  const sh = useShell();
  const spec = mainProp(part);
  const value = spec ? part.props[spec.key] : undefined;
  const [label, setLabel] = useState(part.label);
  const [text, setText] = useState(spec && typeof value === "number" ? formatValue(value, spec.unit, { trimZeros: true }) : "");
  const [error, setError] = useState<string>();

  const close = () => {
    sh.ui.set({ editing: null });
    document.querySelector<HTMLElement>(".schematic")?.focus();
  };
  const apply = () => {
    let v: number | undefined;
    if (spec) {
      const parsed = parseValue(text, spec.unit);
      if (parsed === null) return setError(`Not a value in ${UNIT_SYMBOL[spec.unit] || "these units"}`);
      if (spec.range && (parsed < spec.range[0] || parsed > spec.range[1])) {
        return setError(`Must be between ${formatValue(spec.range[0], spec.unit)} and ${formatValue(spec.range[1], spec.unit)}`);
      }
      v = parsed;
    }
    const newLabel = label.trim();
    if (newLabel !== part.label || (spec && v !== value)) {
      c.edits.edit({ key: "edit.label" }, (d) => {
        const p = d.parts[part.id];
        if (!p) return;
        if (newLabel) p.label = newLabel;
        if (spec && v !== undefined) p.props[spec.key] = v;
      });
    }
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  };

  // Place the editor just below the part's anchor, kept inside the viewport.
  const host = document.querySelector(".schematic")?.getBoundingClientRect();
  const at = c.schematic?.view.toScreen(part.at) ?? { x: 0, y: 0 };
  const left = Math.max(8, Math.min((host?.left ?? 0) + at.x, window.innerWidth - 240));
  const top = Math.max(8, Math.min((host?.top ?? 0) + at.y + 16, window.innerHeight - 160));

  return (
    <form
      className="inplace-editor"
      style={{ left, top }}
      role="dialog"
      aria-label={t("cmd.editLabel")}
      onKeyDown={onKey}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <TextField className="field" value={label} onChange={setLabel} autoFocus>
        <Label>{t("edit.labelField")}</Label>
        <Input />
      </TextField>
      {spec && (
        <TextField className="field" value={text} onChange={setText} isInvalid={!!error}>
          <Label>{propLabel(spec.key)}</Label>
          <Input />
          <FieldError>{error}</FieldError>
        </TextField>
      )}
      <div className="inplace-actions">
        <Button className="btn" onPress={close}>
          {t("edit.cancel")}
        </Button>
        <Button className="btn primary" type="submit">
          {t("edit.apply")}
        </Button>
      </div>
    </form>
  );
}

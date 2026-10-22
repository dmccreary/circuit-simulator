import { useEffect, useState } from "react";
import { parseValue } from "@cs/units";
import { fmt } from "../../chart/format";
import { t } from "../../messages";

/** A number field that accepts engineering notation ("4.7k"); commits on blur or Enter. */
export function NumberField({ label, value, unit = "", onCommit, min }: { label: string; value: number; unit?: string; onCommit(v: number): void; min?: number }) {
  const shown = unit ? fmt(value, unit) : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const v = parseValue(text);
    if (v !== null && Number.isFinite(v) && (min === undefined || v >= min)) onCommit(v);
    else setText(shown);
  };
  return (
    <label className="an-field">
      <span>{label}</span>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
    </label>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T | undefined; options: { value: T; label: string }[]; onChange(v: T): void }) {
  return (
    <label className="an-field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value as T)}>
        {value === undefined || !options.some((o) => o.value === value) ? <option value="">{t("analysis.choose")}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextField({ label, value, onCommit, placeholder }: { label: string; value: string; onCommit(v: string): void; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="an-field">
      <span>{label}</span>
      <input type="text" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => onCommit(text)} onKeyDown={(e) => e.key === "Enter" && onCommit(text)} />
    </label>
  );
}

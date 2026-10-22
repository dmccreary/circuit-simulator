import { useEffect, useState } from "react";
import { Button, Input, Label, Radio, RadioGroup, TextArea, TextField } from "react-aria-components";
import { amount, formatNumber, formatProblem, type LessonProblem, type Step } from "@cs/lesson";
import { useController } from "../ui/context";
import { useStore } from "../store";
import type { LessonSession } from "./session";
import { lessonOf, type LessonStatus } from "./state";
import { highlightControls } from "./spotlight";
import { copyStepSnapshot } from "./commands";
import { Markdown } from "./Markdown";
import "./lesson.css";

const STEP_LABEL: Record<Step["type"], string> = {
  read: "Read",
  "predict-number": "Predict",
  "predict-choice": "Predict",
  do: "Do",
  observe: "Observe",
  measure: "Measure",
  explain: "Explain",
  troubleshoot: "Troubleshoot",
};

const selectStatus = (s: { status: LessonStatus }) => s.status;
const selectVersion = (s: { version: number }) => s.version;

/** Shows the lesson panel when the page address names a lesson. */
export function LessonHost() {
  const c = useController();
  const status = useStore(lessonOf(c), selectStatus);
  if (status.kind === "none") return null;
  if (status.kind === "loading")
    return (
      <aside className="lesson-panel" aria-label="Lesson" aria-busy="true">
        <p className="lesson-muted">Loading lesson…</p>
      </aside>
    );
  if (status.kind === "error")
    return (
      <aside className="lesson-panel" aria-label="Lesson">
        <h2>This lesson could not start</h2>
        <Problems problems={status.problems} open />
      </aside>
    );
  return <LessonPanel session={status.session} />;
}

/** LES-16: the problems found in the lesson file, with line numbers, for the author. */
function Problems({ problems, open = false }: { problems: LessonProblem[]; open?: boolean }) {
  if (!problems.length) return null;
  const errors = problems.filter((p) => p.severity === "error").length;
  return (
    <details className="lesson-problems" open={open}>
      <summary>
        {errors ? `${errors} error${errors > 1 ? "s" : ""}` : `${problems.length} warning${problems.length > 1 ? "s" : ""}`} in the lesson file
      </summary>
      <ul>
        {problems.map((p, i) => (
          <li key={i} className={p.severity}>
            {formatProblem(p)}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function LessonPanel({ session }: { session: LessonSession }) {
  useStore(session.view, selectVersion);
  const e = session.engine;
  const step = e.current;

  // Controls named by the step's spotlight get a pulsing outline (LES-09).
  const selectors = session.spot.selectors.join(",");
  useEffect(() => highlightControls(document, selectors ? selectors.split(",") : []), [selectors, e.index]);

  if (e.isFinished) return <Summary session={session} />;
  const pct = Math.round(((e.index + (e.complete ? 1 : 0)) / e.count) * 100);
  const shownHints = e.hintsShown();

  return (
    <aside className="lesson-panel" aria-label={`Lesson: ${e.lesson.title}`}>
      <header className="lesson-head">
        <h2>{e.lesson.title}</h2>
        <p className="lesson-count" aria-live="polite">
          Step {e.index + 1} of {e.count} · {STEP_LABEL[step.type]}
        </p>
        <div className="lesson-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Lesson progress">
          <span style={{ width: `${pct}%` }} />
        </div>
      </header>

      <section className="lesson-step" key={e.index}>
        {step.title && <h3>{step.title}</h3>}
        <Markdown text={step.text} />
        <StepControls session={session} />
      </section>

      {e.feedback && (
        <p className="lesson-feedback" role="alert">
          {e.feedback}
        </p>
      )}
      {e.message && (
        <p className={`lesson-message ${e.message.tone}`} role="status">
          {e.message.text}
        </p>
      )}

      {shownHints.length > 0 && (
        <ol className="lesson-hints" aria-label="Hints">
          {shownHints.map((h, i) => (
            <li key={i}>
              <Markdown text={h} />
            </li>
          ))}
        </ol>
      )}

      <div className="lesson-actions" role="group" aria-label="Lesson step">
        {step.type === "do" && !e.complete && (
          <Button className="btn" onPress={() => session.check()}>
            Check
          </Button>
        )}
        {step.hints.length > 0 && (
          <Button className="btn" onPress={() => session.hint()} isDisabled={!e.hasMoreHints}>
            Hint {shownHints.length < step.hints.length ? `(${shownHints.length + 1} of ${step.hints.length})` : ""}
          </Button>
        )}
        <Button className="btn" onPress={() => session.resetStep()}>
          ⟲ Reset step
        </Button>
      </div>

      <nav className="lesson-nav" aria-label="Lesson navigation">
        <Button className="btn" onPress={() => session.back()} isDisabled={!e.canBack}>
          ← Back
        </Button>
        <Button className="btn primary" onPress={() => session.next()} isDisabled={!e.canNext}>
          {e.index === e.count - 1 ? "Finish" : "Next →"}
        </Button>
      </nav>

      <AuthorTools session={session} />
    </aside>
  );
}

function StepControls({ session }: { session: LessonSession }) {
  const e = session.engine;
  const s = e.current;
  const rec = e.record();
  switch (s.type) {
    case "predict-number":
    case "measure":
      return (
        <NumberEntry
          key={e.index}
          label={s.type === "measure" ? "Your reading" : "Your prediction"}
          unit={s.unit}
          done={rec.complete}
          initial={rec.answer && "number" in rec.answer ? (rec.answer.text ?? String(rec.answer.number)) : ""}
          submitLabel={s.type === "measure" ? "Check reading" : "Save prediction"}
          onSubmit={(number, text) => session.submit({ number, text })}
        />
      );
    case "predict-choice":
      return (
        <Choice
          key={e.index}
          options={s.options}
          label="Your prediction"
          initial={rec.answer && "choice" in rec.answer ? rec.answer.choice : undefined}
          submitLabel="Save prediction"
          onSubmit={(choice) => session.submit({ choice })}
        />
      );
    case "explain":
      return s.options ? (
        <Choice key={e.index} options={s.options} label="Your answer" initial={rec.answer && "choice" in rec.answer ? rec.answer.choice : undefined} submitLabel="Submit" onSubmit={(choice) => session.submit({ choice })} />
      ) : (
        <Explain key={e.index} initial={rec.answer && "text" in rec.answer ? (rec.answer.text ?? "") : ""} onSubmit={(text) => session.submit({ text })} />
      );
    case "observe": {
      const cmp = e.comparison();
      if (!cmp) return null;
      return (
        <dl className="lesson-compare" aria-label="Prediction and result">
          <dt>Your prediction</dt>
          <dd>{cmp.predicted}</dd>
          <dt>Measured</dt>
          <dd>{cmp.observed === undefined ? "—" : formatNumber(cmp.observed, cmp.unit)}</dd>
        </dl>
      );
    }
    case "troubleshoot":
      return (
        <div className="lesson-row">
          <Button className="btn" onPress={() => session.submitSelection()} isDisabled={rec.complete}>
            The selected part is faulty
          </Button>
          {rec.wrong.length > 0 && <span className="lesson-muted">Checked: {rec.wrong.join(", ")}</span>}
        </div>
      );
    default:
      return null;
  }
}

function NumberEntry(p: { label: string; unit?: string; done: boolean; initial: string; submitLabel: string; onSubmit: (n: number, text: string) => void }) {
  const [text, setText] = useState(p.initial);
  const [error, setError] = useState<string>();
  const submit = () => {
    const n = amount(text);
    if (n === null) return setError(`Type a number${p.unit ? `, such as 2.5 ${p.unit}` : ""}.`);
    setError(undefined);
    p.onSubmit(n, text.trim());
  };
  return (
    <form
      className="lesson-row"
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
    >
      <TextField className="lesson-field" value={text} onChange={setText} isInvalid={!!error}>
        <Label>
          {p.label}
          {p.unit ? ` (${p.unit})` : ""}
        </Label>
        <Input placeholder={p.unit ? `e.g. 2.5 ${p.unit === "A" ? "mA" : p.unit}` : ""} />
      </TextField>
      <Button className="btn" type="submit" isDisabled={!text.trim()}>
        {p.done ? "Update" : p.submitLabel}
      </Button>
      {error && (
        <p className="lesson-message error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Choice(p: { options: string[]; label: string; initial?: number; submitLabel: string; onSubmit: (choice: number) => void }) {
  const [value, setValue] = useState<string | null>(p.initial === undefined ? null : String(p.initial));
  return (
    <div className="lesson-choice">
      <RadioGroup value={value} onChange={setValue} aria-label={p.label}>
        {p.options.map((o, i) => (
          <Radio key={i} value={String(i)} className="lesson-radio">
            {o}
          </Radio>
        ))}
      </RadioGroup>
      <Button className="btn" isDisabled={value === null} onPress={() => value !== null && p.onSubmit(Number(value))}>
        {p.submitLabel}
      </Button>
    </div>
  );
}

function Explain(p: { initial: string; onSubmit: (text: string) => void }) {
  const [text, setText] = useState(p.initial);
  return (
    <div className="lesson-choice">
      <TextField className="lesson-field" value={text} onChange={setText}>
        <Label>Your explanation</Label>
        <TextArea rows={3} />
      </TextField>
      <Button className="btn" isDisabled={!text.trim()} onPress={() => p.onSubmit(text)}>
        Submit
      </Button>
    </div>
  );
}

/** LES-14: steps done, predictions next to results, hints used. */
function Summary({ session }: { session: LessonSession }) {
  const e = session.engine;
  const s = e.summary();
  return (
    <aside className="lesson-panel" aria-label={`Lesson: ${e.lesson.title}`}>
      <header className="lesson-head">
        <h2>{e.lesson.title}</h2>
        <p className="lesson-count">Lesson complete</p>
      </header>
      <p>
        You completed <strong>{s.done}</strong> of {s.count} steps and used <strong>{s.hints}</strong> hint{s.hints === 1 ? "" : "s"}.
      </p>
      {s.predictions.length > 0 && (
        <table className="lesson-summary">
          <caption>Your predictions</caption>
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">You predicted</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {s.predictions.map((p) => (
              <tr key={p.step}>
                <td>{p.step}</td>
                <td>{p.predicted}</td>
                <td>{p.actual ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {e.lesson.summary && <Markdown text={e.lesson.summary} />}
      <nav className="lesson-nav">
        <Button className="btn" onPress={() => session.back()}>
          ← Review steps
        </Button>
      </nav>
    </aside>
  );
}

function AuthorTools({ session }: { session: LessonSession }) {
  const c = useController();
  return (
    <details className="lesson-author">
      <summary>Author tools</summary>
      <Problems problems={session.problems} />
      <Button className="btn small" onPress={() => void copyStepSnapshot(c)}>
        Copy step snapshot as YAML
      </Button>
      <p className="lesson-muted">Copies a “do” step that checks the selected parts as they are now.</p>
    </details>
  );
}

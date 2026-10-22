import { useEffect, useMemo, useState } from "react";
import { Button, Heading, Input, SearchField } from "react-aria-components";
import { t } from "../messages";
import { groupExamples, loadExampleIndex, type ExampleIndex } from "./examples-index";
import { EXAMPLES_BASE, type FileSession } from "./session";

/** File → Examples (FIL-13, FIL-18): the Falstad library by category, with search. */
export function ExamplesDialog({ session, close }: { session: FileSession; close: () => void }) {
  const [index, setIndex] = useState<ExampleIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    loadExampleIndex((u) => session.platform.fetchText(u), EXAMPLES_BASE).then(
      (i) => live && setIndex(i),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [session]);

  const groups = useMemo(() => groupExamples(index?.circuits ?? [], query), [index, query]);

  const open = (file: string) => {
    close();
    void session.openExample(file);
  };

  return (
    <>
      <Heading slot="title">{t("files.examplesTitle")}</Heading>
      <SearchField className="files-search" aria-label={t("files.examplesSearch")} value={query} onChange={setQuery} autoFocus>
        <Input placeholder={t("files.examplesSearch")} />
      </SearchField>
      <div className="files-examples">
        {failed && <p className="hint">{t("files.examplesMissing")}</p>}
        {!failed && !index && <p className="hint">{t("files.loading")}</p>}
        {index && !groups.length && <p className="hint">{t("files.noMatches")}</p>}
        {groups.map((g) => (
          <section key={g.name}>
            <h3>{g.name}</h3>
            <ul>
              {g.entries.map((e) => (
                <li key={`${g.name}/${e.file}/${e.title}`}>
                  <Button className="part-btn files-example" onPress={() => open(e.file)}>
                    {e.title}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="hint files-credit">{index?.credit ?? t("files.examplesCredit")}</p>
      <div className="files-actions">
        <Button className="btn" onPress={close}>
          {t("files.close")}
        </Button>
      </div>
    </>
  );
}

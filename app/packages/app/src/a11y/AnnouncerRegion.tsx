import { useStore } from "../store";
import { useShell } from "../layout/use-shell";

/** The one polite live region (ACC-08); the Announcer rate-limits what reaches it. */
export function AnnouncerRegion() {
  const a = useStore(useShell().announcer.store, (s) => s);
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-seq={a.seq}>
      {a.text}
    </div>
  );
}

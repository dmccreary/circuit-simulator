import { Button } from "react-aria-components";
import { useController, useDocument } from "../ui/context";
import { t } from "../messages";

/** RLM-03: which world the circuit is in, always visible; opens the settings. */
export function RealismBadge() {
  const c = useController();
  const parts = useDocument((d) => d.settings.realisticParts);
  const ratings = useDocument((d) => d.settings.realisticRatings);
  const key = parts && ratings ? "both" : parts ? "parts" : ratings ? "ratings" : "ideal";
  return (
    <Button
      className={`btn realism-badge realism-${key}`}
      onPress={() => c.commands.run("view.settings")}
      aria-label={`${t(`realism.badge.${key}`)}. ${t("realism.badge.title")}`}
    >
      {t(`realism.badge.${key}`)}
    </Button>
  );
}

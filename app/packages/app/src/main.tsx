import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { AppController } from "./controller";
import { rcChargingCircuit } from "./demo-circuit";
import { prefersDark, readEmbedConfig, startEmbed } from "./embed";
import "./styles.css";

// Embed parameters first: they choose the theme, mode and capabilities (spec §19.1).
const config = readEmbedConfig(window);
const controller = new AppController(rcChargingCircuit(), { dark: prefersDark(config, window) });
const embed = startEmbed(controller, config, window);
// SET-04: an explicit embed theme overrides the learner's saved theme for this embed only.
if (config.theme !== "auto") controller.setDark(config.theme === "dark");

// Lesson mode (spec Section 20): the engine and YAML parser load only when asked for.
if (config.lesson) {
  const lesson = config.lesson;
  void import("./lesson/start").then((m) =>
    m.startLesson(controller, lesson, {
      embed,
      pageHref: window.location.href,
      page: config.embedded && document.referrer ? document.referrer : window.location.href,
      shell: () => document.querySelector(".shell"),
    }),
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App controller={controller} embed={embed.runtime} />
  </StrictMode>,
);

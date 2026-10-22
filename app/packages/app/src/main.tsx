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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App controller={controller} embed={embed.runtime} />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { AppController } from "./controller";
import { rcChargingCircuit } from "./demo-circuit";
import "./styles.css";

const dark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
const controller = new AppController(rcChargingCircuit(), { dark });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App controller={controller} />
  </StrictMode>,
);

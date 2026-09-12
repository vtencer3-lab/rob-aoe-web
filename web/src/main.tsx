import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { donactiDoplnkoveObrazky } from "./mapyNahledy.js";
import "./styl.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Náhledy map a další doplňkové obrázky až po hlavní stránce, v klidu.
donactiDoplnkoveObrazky();

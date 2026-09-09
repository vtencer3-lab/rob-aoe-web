// Náhledová stránka jen pro vizuální kontrolu okna Create Lobby proti hře.
// Není součástí aplikace; pouští se `npm --prefix web run dev` na /nahled/okno.html.
import { createRoot } from "react-dom/client";
import { OknoCreateLobby } from "../src/views/OknoCreateLobby.js";
import "../src/styl.css";

createRoot(document.getElementById("korel")!).render(
  <OknoCreateLobby nazevLobby="ROB-02" heslo="3792" nastaveni={{}} pocetHracu={2} />,
);

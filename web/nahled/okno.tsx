// Náhledová stránka jen pro vizuální kontrolu proti hře: nahoře postavené
// okno Create Lobby, pod ním modál režie se stejným nastavením.
// Není součástí aplikace; pouští se `npm --prefix web run dev` na /nahled/okno.html.
import { createRoot } from "react-dom/client";
import { doplnNastaveni } from "../../src/shared/lobbyKontrola.js";
import { OknoCreateLobby } from "../src/views/OknoCreateLobby.js";
import { PreLobby } from "../src/views/PreLobby.js";
import "../src/styl.css";

// Modál překrývá celou stránku, takže na samotné okno se dá kouknout jen bez
// něj: `?modal=0`.
const sModalem = !new URLSearchParams(location.search).has("bezmodalu");

createRoot(document.getElementById("korel")!).render(
  <>
    <OknoCreateLobby nazevLobby="ROB-02" heslo="3792" nastaveni={{}} pocetHracu={2} />
    {sModalem ? (
    <PreLobby
      nastaveni={doplnNastaveni({})}
      nazevLobby="ROB-03"
      heslo="5048"
      onZmena={() => {}}
      onNoveHeslo={() => {}}
      onZavrit={() => {}}
    />
    ) : null}
  </>,
);

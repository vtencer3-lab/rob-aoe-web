import { PravniStranka } from "./PravniStranka.js";
import { KONTAKT_SMAZANI } from "../pravniCesty.js";

/**
 * Podmínky použití. Odkaz na tuhle adresu čte Microsoft na souhlasné
 * obrazovce při přihlášení — bez něj tam visí věta „Vydavatel neposkytl
 * odkazy…“. Fakta o datech jsou samostatně na `/soukromi`, tady jde jen
 * o to, co ta služba je a za jakých podmínek ji používáš.
 */
export function Podminky() {
  return (
    <PravniStranka nazev="Podmínky použití" zmeneno="17. září 2026">
      <p>
        Tenhle web patří ke komunitním večerům Age of Empires II: Definitive Edition, které pořádá streamer
        Robdiesalot (Brohemians). Přihlásíš se přes Steam nebo Microsoft účet, web tě zapíše mezi hráče a ke
        každému zápasu, který Rob poskládá, ti vygeneruje odkaz rovnou do lobby.
      </p>
      <p>
        Web je zdarma a bez záruky. Provozuje ho soukromá osoba jako koníček vedle práce, ne firma — nikdo
        neručí za to, že bude vždycky fungovat bez chyby nebo výpadku, a nikdo za jeho používání nic neplatí.
      </p>
      <p>
        Co se přesně hraje, v jakém formátu a s jakými pravidly, určuje Rob. Web jen drží technickou stránku
        večera — přihlášky, sestavení zápasů, odkazy do lobby a chat.
      </p>
      <p>
        Kdo v chatu nebo ve hře kazí zážitek ostatním, může o přístup přijít: provozovatel má právo účet
        zablokovat nebo smazat, aniž by to musel dopředu oznamovat.
      </p>
      <p>
        O smazání účtu a dat, která o tobě web má, můžeš kdykoliv požádat provozovatele — napiš na{" "}
        <a href={`mailto:${KONTAKT_SMAZANI}`}>{KONTAKT_SMAZANI}</a> nebo Robovi.
      </p>
    </PravniStranka>
  );
}

import { PravniStranka } from "./PravniStranka.js";

/**
 * Zásady soukromí. Odkaz na tuhle adresu čte Microsoft na souhlasné
 * obrazovce při přihlášení — bez něj tam visí věta „Vydavatel neposkytl
 * odkazy…“. Každé tvrzení tu odpovídá skutečnému kódu (schéma `player`,
 * `src/external/*`, `src/auth/*`) — viz report v `.superpowers/sdd/`.
 */
export function Soukromi() {
  return (
    <PravniStranka nazev="Zásady soukromí" zmeneno="17. září 2026">
      <p className="pravni-stranka-zvyrazneni">
        Web od Microsoftu žádá jen právo ověřit tvůj Xbox profil (scope <code>XboxLive.signin</code>) — žádný
        e-mail, žádné kontakty, nic víc. Přístupový token, který od Microsoftu při přihlášení dostaneme, se
        navíc nikde neukládá: použije se v tu chvíli a hned se zahodí.
      </p>
      <p>
        Tenhle web provozuje soukromá osoba jako koníček ke komunitním večerům Robdiesalota, ne firma. Níž je
        přesně to, co se o tobě ukládá, odkud to je a jak dlouho to tam zůstává.
      </p>

      <h2>Co se ukládá o hráči</h2>
      <ul>
        <li>
          <strong>Identifikátor účtu</strong> — tvoje Steam ID, nebo u Microsoft přihlášení Xbox XUID. Podle
          něj tě web pozná při dalším přihlášení.
        </li>
        <li>
          <strong>Jméno</strong> — přezdívka ze žebříčku hry a jméno z platformy (Steam jméno nebo Xbox
          gamertag).
        </li>
        <li>
          <strong>Avatar</strong> — profilový obrázek ze Steamu, nebo Xbox „gamerpic“.
        </li>
        <li>
          <strong>Herní statistiky</strong> — ELO v 1v1 Random Map, tvoje nejvyšší ELO, kolik her jsi odehrál,
          kdy jsi hrál naposled a všechny tvoje žebříčky přesně tak, jak je ukazuje hra po najetí myší na jméno
          v lobby. Všechno se to bere z veřejného žebříčku Worlds Edge — nic z toho není soukromé.
        </li>
        <li>
          <strong>Země</strong> — vlajka, kterou máš nastavenou u žebříčku ve hře. Není odvozená z tvé IP
          adresy.
        </li>
        <li>
          <strong>Vlastnictví hry</strong> — jestli AoE II: DE vlastníš, podle Steam knihovny nebo Xbox herní
          historie.
        </li>
        <li>
          <strong>Odehrané hodiny</strong> — jen u Steam hráčů; Xbox tohle nezveřejňuje.
        </li>
        <li>
          <strong>Přístup do režie</strong> — jestli jsi admin (týká se jen Roba a případně jeho
          spolusprávce).
        </li>
        <li>Datum, kdy ses u nás poprvé přihlásil.</li>
      </ul>

      <h2>Odkud to je</h2>
      <p>
        Steam Web API (profil a knihovna her), Xbox Live (přihlášení, profil, herní historie) a veřejný
        žebříček hry Worlds Edge — podle toho, jestli ses přihlásil Steamem, nebo Microsoft účtem.
      </p>

      <h2>Cookies</h2>
      <ul>
        <li>
          Přihlašovací cookie tě drží přihlášeného <strong>30 dní</strong>. Nenese nic než náhodné id sezení.
        </li>
        <li>
          Microsoft přihlášení si mezi odchodem a návratem drží krátkodobou cookie, která žije jen{" "}
          <strong>10 minut</strong> a hned po přihlášení zmizí.
        </li>
      </ul>

      <h2>Chat a zápasy</h2>
      <p>
        Zprávy v chatu u zápasu zůstávají v databázi i po skončení večera — patří k tomu, jak zápas probíhal,
        ne k jednorázové konverzaci, co po večeru zmizí. Když moderace zprávu kvůli slušnosti smaže nebo
        upraví, původní znění zůstává jen v databázi pro dohledání, na obrazovce ho už nikdo neuvidí. Ke
        každému zápasu se taky ukládá nastavení lobby a tvoje ELO v tu chvíli, aby šel večer později přehrát.
      </p>

      <h2>Smazání účtu</h2>
      <p>
        O smazání účtu a všech dat, která o tobě web má, si kdykoliv řekni provozovateli — napiš Robovi nebo
        tomu, kdo web zrovna spravuje, a smažou ho. Samoobslužné tlačítko na to web nemá.
      </p>
    </PravniStranka>
  );
}

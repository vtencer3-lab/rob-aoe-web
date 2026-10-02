// Sonda Diplomacie (rob-aoe-web), format 3: kazde 2 herni sekundy prepise
// soubor profile\<scenar>.xsdat - JEN NA POCITACI GAME MASTERA. Rozlozeni:
//   int verze (3) | int cas (herni s)
//   | 8x int slot scenare -> cislo hrace ve hre (xsGetWorldPlayerId(1..8))
//   | 8x (string jmeno, string barva, float relikvie, int zije) podle cisla
//     hrace ve hre | 64x int diplomacie(a, b) | 256x int promenne triggeru
//   | int cas
// Cas je na zacatku i na konci: zapis nemusi byt atomicky, ctenar bere jen
// cteni, kde se obe hodnoty shoduji. Cisla hracu v XS jsou poradi v lobby,
// ne sloty scenare - proto prevod slotu a ke kazdemu cislu jmeno a barva.
// Promenna 200 + slot nese cislo pocitadla prideleneho sekundarniho cile
// (zapisuje ji web pri pribaleni sondy, viz sonda.py); 0 = bez cile.
// Atribut 7 = relikvie (cAttributeRelics).
// Kod je schvalne ciste ASCII (validator xs-check cte UTF-8).
void sondaZapis() {
  int t = xsGetGameTime();
  // Soubor nese tajne veci vsech hracu (kdo ma jaky sekundarni cil, tedy
  // i kdo je Nastupce, relikvie, kdo zije) a skript bezi u kazdeho hrace.
  // Zapisuje se proto jen tam, kde mistni hrac sedi na slotu Game Mastera:
  // 7 = seda, GM_BARVA modu. Zapis souboru neni stav simulace, takze ruzne
  // chovani na ruznych pocitacich hru nerozejde (super sonda cetla
  // xsUnsyncGetLocalPlayerId ve hre dvou lidi 34 minut bez desyncu).
  if (xsUnsyncGetLocalPlayerId() == xsGetWorldPlayerId(7)) {
    // 256 promennych v jedne smycce: vychozi strop smycek XS nezname, tenhle
    // prikaz bezel ve hre v super sonde.
    infiniteLoopLimit = 1000000;
    xsCreateFile(false);
    xsWriteInt(3);
    xsWriteInt(t);
    for (s = 1; < 9) {
      xsWriteInt(xsGetWorldPlayerId(s));
    }
    for (p = 1; < 9) {
      xsWriteString(xsGetPlayerName(p));
      xsWriteString(xsGetPlayerColorTag(p));
      xsWriteFloat(xsPlayerAttribute(p, 7));
      if (xsGetPlayerInGame(p)) {
        xsWriteInt(1);
      } else {
        xsWriteInt(0);
      }
    }
    for (a = 1; < 9) {
      for (b = 1; < 9) {
        xsWriteInt(xsGetDiplomacy(a, b));
      }
    }
    for (v = 0; < 256) {
      xsWriteInt(xsTriggerVariable(v));
    }
    xsWriteInt(t);
    xsCloseFile();
  }
}

rule _sondaTik
  active
  minInterval 2
  maxInterval 2
{
  sondaZapis();
}

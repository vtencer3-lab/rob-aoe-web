// Sonda Diplomacie (rob-aoe-web), format 8: kazdou herni sekundu prepise
// soubor profile\<scenar>.xsdat - NA KAZDEM POCITACI VE HRE (hraci i divaci).
// Rozlozeni:
//   int znacka 0x44424F52 (bajty "ROBD" - nase soubory pozna kazda
//   ctecka driv, nez cokoli dalsiho cte) | int verze (8) | int cas (herni s)
//   | 8x int slot scenare -> cislo hrace ve hre (xsGetWorldPlayerId(1..8))
//   | 8x (string jmeno, string barva, float relikvie, int zije) podle cisla
//     hrace ve hre | 8x (float x, float y) prvni kral hrace v dilcich, bez
//     krale -1 -1 | int pocet relikvii (nejvys 32) | pocet x (float x,
//     float y, float hrac - kdo ji nese nebo ma v klasteru, 0 = volna) | 64x int diplomacie(a, b) | 256x int promenne triggeru
//   | int cas
// Cas je na zacatku i na konci: zapis nemusi byt atomicky, ctenar bere jen
// cteni, kde se obe hodnoty shoduji. Cisla hracu v XS jsou poradi v lobby,
// ne sloty scenare - proto prevod slotu a ke kazdemu cislu jmeno a barva.
// Promenna 200 + slot nese cislo pocitadla prideleneho sekundarniho cile
// (zapisuje ji web pri pribaleni sondy, viz sonda.py); 0 = bez cile.
// Atribut 7 = relikvie (cAttributeRelics). Kral = objekt 434 (GM jich ma
// vic, bere se prvni; web GM na mape nekresli).
// Relikvie na mape (overeno ve hre 3. 10. 2026): volna je objekt 285 gaii;
// kdyz ji jednotka zvedne, relikvie zanikne a jednotka ji "drzi"
// (xsGetUnitAttributeHeld > 0; misionar 775 "Missionary with Relic" drzi 100,
// ale nest ji muze i jina jednotka). Ulozena v klasteru je jen v atributu 7
// hrace. Sonda proto pise volne relikvie (mimo 8 dilcu od trziste GM -
// zazemi GM na kraji mapy) a nosice vsech hracu (i GM). Nosic = jednotka
// tridy 943 (mnich s relikvii 286, misionar s relikvii 2557 - overeno ve hre
// 3. 10. 2026); mnich bez relikvie je trida 918 a "drzi" 100 viry, proto se
// "drzi neco" nepouziva (bralo i farmy, ovce a volne mnichy). Relikvie ulozena
// v klasteru je dal objekt 285 gaii, jen garrisonovana v budove: dostane
// barvu majitele budovy (xsGetGarrisonedInUnitId + xsGetUnitOwner).
// Promenne 240-247 sonda nepise ze scenare, ale sama: kolik hernich sekund
// mel hrac 1-8 (cislo ve hre, 240 = hrac 1) aspon 7 relikvii. Pri ztrate
// se jen zastavi, nenuluje - odpocet hry se nuluje, web ukazuje tenhle
// (uzivatel 3. 10. 2026). Scenar promenne 240+ nepouziva.
// Kod je schvalne ciste ASCII (validator xs-check cte UTF-8).
// Pole pro id kralu se pouziva znovu (treti parametr), ne nove kazdou sekundu.
int sondaKralove = -1;
int sondaRelikvie = -1;
int sondaTrhyGm = -1;
int sondaNosici = -1;
// Polohy relikvii pro zapis (nejvys 32): nejdriv se sesbiraji, pak zapise pocet.
int sondaMistaRelikvii = -1;
// Sekundy se 7+ relikviemi podle cisla hrace (index 1-8) a cas minuleho zapisu.
int sondaDrzeni = -1;
int sondaMinulyCas = -1;

void sondaZapis() {
  int t = xsGetGameTime();
  // Soubor se zapisuje u kazdeho, i kdyz nese tajne veci vsech hracu (kdo
  // ma jaky cil, tedy i kdo je Nastupce). XS divaka od hrace nerozezna:
  // u divaka vraci xsUnsyncGetLocalPlayerId hrace, na ktereho se prave diva
  // (overeno 2. 10. 2026). Data maji jit sbirat i z PC divaka, a uzivatel
  // rozhodl (2. 10. 2026): komunitni hra s prateli, bez sifrovani.
  // 256 promennych v jedne smycce: vychozi strop smycek XS nezname, tenhle
  // prikaz bezel ve hre v super sonde.
  infiniteLoopLimit = 1000000;
  if (sondaDrzeni < 0) {
    sondaDrzeni = xsArrayCreateInt(9, 0, "sondaDrzeni");
  }
  // Pravidlo bezi po sekunde, ale muze sklouznout: pricita se skutecny
  // rozdil herniho casu (nejvys 5 s - delsi mezera neni tik, ale napr. nacteni).
  int dt = t - sondaMinulyCas;
  if ((sondaMinulyCas < 0) || (dt < 0) || (dt > 5)) {
    dt = 0;
  }
  sondaMinulyCas = t;
  for (r = 1; < 9) {
    if (xsPlayerAttribute(r, 7) >= 7.0) {
      xsArraySetInt(sondaDrzeni, r, xsArrayGetInt(sondaDrzeni, r) + dt);
    }
  }
  xsCreateFile(false);
  // Znacka 0x44424F52 = 1145196370; XS bere nejvys 9ciferny literal.
  xsWriteInt(114519637 * 10);
  xsWriteInt(8);
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
  for (k = 1; < 9) {
    sondaKralove = xsGetPlayerUnitIds(k, 434, sondaKralove);
    if (xsArrayGetSize(sondaKralove) > 0) {
      vector poloha = xsGetUnitPosition(xsArrayGetInt(sondaKralove, 0));
      xsWriteFloat(xsVectorGetX(poloha));
      xsWriteFloat(xsVectorGetY(poloha));
    } else {
      xsWriteFloat(-1.0);
      xsWriteFloat(-1.0);
    }
  }
  if (sondaMistaRelikvii < 0) {
    sondaMistaRelikvii = xsArrayCreateVector(32, vector(-1, -1, -1), "sondaMistaRelikvii");
  }
  int pocetRelikvii = 0;
  int gm = xsGetWorldPlayerId(7);
  // Volne relikvie na mape, mimo zazemi GM u jeho trziste.
  sondaRelikvie = xsGetPlayerUnitIds(0, 285, sondaRelikvie);
  sondaTrhyGm = xsGetPlayerUnitIds(gm, 84, sondaTrhyGm);
  for (n = 0; < xsArrayGetSize(sondaRelikvie)) {
    vector volna = xsGetUnitPosition(xsArrayGetInt(sondaRelikvie, n));
    bool uGm = false;
    for (g = 0; < xsArrayGetSize(sondaTrhyGm)) {
      if (xsVectorLength(volna - xsGetUnitPosition(xsArrayGetInt(sondaTrhyGm, g))) < 8.0) {
        uGm = true;
      }
    }
    if ((uGm == false) && (pocetRelikvii < 32)) {
      // Treti slozka vektoru nese cislo hrace: 0 = volna, jinak majitel
      // budovy (klastera), ve ktere je relikvie ulozena.
      int budova = xsGetGarrisonedInUnitId(xsArrayGetInt(sondaRelikvie, n));
      int majitel = 0;
      if (budova >= 0) {
        majitel = xsGetUnitOwner(budova);
      }
      xsArraySetVector(sondaMistaRelikvii, pocetRelikvii, xsVectorSet(xsVectorGetX(volna), xsVectorGetY(volna), majitel));
      pocetRelikvii = pocetRelikvii + 1;
    }
  }
  for (h = 1; < 9) {
    // Nesene: kazda jednotka tridy 943 (s relikvii).
    sondaNosici = xsGetPlayerUnitIds(h, 943, sondaNosici);
    for (m = 0; < xsArrayGetSize(sondaNosici)) {
      if (pocetRelikvii < 32) {
        vector nesena = xsGetUnitPosition(xsArrayGetInt(sondaNosici, m));
        xsArraySetVector(sondaMistaRelikvii, pocetRelikvii, xsVectorSet(xsVectorGetX(nesena), xsVectorGetY(nesena), h));
        pocetRelikvii = pocetRelikvii + 1;
      }
    }
  }
  xsWriteInt(pocetRelikvii);
  for (q = 0; < pocetRelikvii) {
    vector misto = xsArrayGetVector(sondaMistaRelikvii, q);
    xsWriteFloat(xsVectorGetX(misto));
    xsWriteFloat(xsVectorGetY(misto));
    xsWriteFloat(xsVectorGetZ(misto));
  }
  for (a = 1; < 9) {
    for (b = 1; < 9) {
      xsWriteInt(xsGetDiplomacy(a, b));
    }
  }
  for (v = 0; < 256) {
    if ((v >= 240) && (v < 248)) {
      xsWriteInt(xsArrayGetInt(sondaDrzeni, v - 239));
    } else {
      xsWriteInt(xsTriggerVariable(v));
    }
  }
  xsWriteInt(t);
  xsCloseFile();
}

rule _sondaTik
  active
  minInterval 1
  maxInterval 1
{
  sondaZapis();
}

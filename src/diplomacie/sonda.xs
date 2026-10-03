// Sonda Diplomacie (rob-aoe-web), format 7: kazdou herni sekundu prepise
// soubor profile\<scenar>.xsdat - NA KAZDEM POCITACI VE HRE (hraci i divaci).
// Rozlozeni:
//   int znacka 0x44424F52 (bajty "ROBD" - nase soubory pozna kazda
//   ctecka driv, nez cokoli dalsiho cte) | int verze (7) | int cas (herni s)
//   | 8x int slot scenare -> cislo hrace ve hre (xsGetWorldPlayerId(1..8))
//   | 8x (string jmeno, string barva, float relikvie, int zije) podle cisla
//     hrace ve hre | 8x (float x, float y) prvni kral hrace v dilcich, bez
//     krale -1 -1 | int pocet relikvii (nejvys 32) | pocet x (float x,
//     float y) | 64x int diplomacie(a, b) | 256x int promenne triggeru
//   | int cas
// Cas je na zacatku i na konci: zapis nemusi byt atomicky, ctenar bere jen
// cteni, kde se obe hodnoty shoduji. Cisla hracu v XS jsou poradi v lobby,
// ne sloty scenare - proto prevod slotu a ke kazdemu cislu jmeno a barva.
// Promenna 200 + slot nese cislo pocitadla prideleneho sekundarniho cile
// (zapisuje ji web pri pribaleni sondy, viz sonda.py); 0 = bez cile.
// Atribut 7 = relikvie (cAttributeRelics). Kral = objekt 434 (GM jich ma
// vic, bere se prvni; web GM na mape nekresli).
// Relikvie na mape (overeno ve hre 3. 10. 2026): volna je objekt 285 gaii;
// kdyz ji jednotka zvedne, relikvie zanikne a nese ji jednotka - v LLC
// misionar (objekt 775, „Missionary with Relic“, neco drzi), jinde mnich
// s relikvii (286); ulozena v klasteru je jen v atributu 7 hrace. Sonda
// proto pise volne relikvie (mimo 8 dilcu od trziste GM - zazemi GM na kraji
// mapy), nosice vsech hracu (i GM - relikvie, se kterou GM pohne, je porad
// ve hre) a za kazdou ulozenou relikvii polohu prvniho klastera (104) hrace.
// Kod je schvalne ciste ASCII (validator xs-check cte UTF-8).
// Pole pro id kralu se pouziva znovu (treti parametr), ne nove kazdou sekundu.
int sondaKralove = -1;
int sondaRelikvie = -1;
int sondaTrhyGm = -1;
int sondaNosici = -1;
int sondaKlastery = -1;
// Polohy relikvii pro zapis (nejvys 32): nejdriv se sesbiraji, pak zapise pocet.
int sondaMistaRelikvii = -1;

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
  xsCreateFile(false);
  // Znacka 0x44424F52 = 1145196370; XS bere nejvys 9ciferny literal.
  xsWriteInt(114519637 * 10);
  xsWriteInt(7);
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
      xsArraySetVector(sondaMistaRelikvii, pocetRelikvii, volna);
      pocetRelikvii = pocetRelikvii + 1;
    }
  }
  for (h = 1; < 9) {
    if (h > 0) {
      // Nesene: misionar (775) nebo mnich s relikvii (286), ktery neco drzi.
      for (d = 0; < 2) {
        int druhNosice = 775;
        if (d == 1) {
          druhNosice = 286;
        }
        sondaNosici = xsGetPlayerUnitIds(h, druhNosice, sondaNosici);
        for (m = 0; < xsArrayGetSize(sondaNosici)) {
          int nosic = xsArrayGetInt(sondaNosici, m);
          if ((xsGetUnitAttributeHeld(nosic, -1) > 0.0) && (pocetRelikvii < 32)) {
            xsArraySetVector(sondaMistaRelikvii, pocetRelikvii, xsGetUnitPosition(nosic));
            pocetRelikvii = pocetRelikvii + 1;
          }
        }
      }
      // Ulozene v klasteru: kolik jich hrac ma, tolikrat poloha jeho klastera.
      float ulozenych = xsPlayerAttribute(h, 7);
      if (ulozenych > 0.5) {
        sondaKlastery = xsGetPlayerUnitIds(h, 104, sondaKlastery);
        if (xsArrayGetSize(sondaKlastery) > 0) {
          vector klaster = xsGetUnitPosition(xsArrayGetInt(sondaKlastery, 0));
          for (u = 0; < 32) {
            if ((u < ulozenych) && (pocetRelikvii < 32)) {
              xsArraySetVector(sondaMistaRelikvii, pocetRelikvii, klaster);
              pocetRelikvii = pocetRelikvii + 1;
            }
          }
        }
      }
    }
  }
  xsWriteInt(pocetRelikvii);
  for (q = 0; < pocetRelikvii) {
    vector misto = xsArrayGetVector(sondaMistaRelikvii, q);
    xsWriteFloat(xsVectorGetX(misto));
    xsWriteFloat(xsVectorGetY(misto));
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

rule _sondaTik
  active
  minInterval 1
  maxInterval 1
{
  sondaZapis();
}

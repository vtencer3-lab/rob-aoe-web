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
// zazemi GM na kraji mapy), kazdou jednotku vsech hracu (i GM), ktera neco
// drzi - jen jednotky (typ objektu 70), budovy drzi suroviny take (farma
// jidlo; 3. 10. 2026 se tak farmy ukazovaly jako relikvie), a krome tech, co
// nosi suroviny (vesnican 904, obchodni vuz 919, obchodni lod 902, rybarska
// lod 921) - a za kazdou ulozenou relikvii polohu prvniho klastera (104).
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
      // Treti slozka vektoru nese cislo hrace (0 = volna relikvie).
      xsArraySetVector(sondaMistaRelikvii, pocetRelikvii, xsVectorSet(xsVectorGetX(volna), xsVectorGetY(volna), 0.0));
      pocetRelikvii = pocetRelikvii + 1;
    }
  }
  for (h = 1; < 9) {
    if (h > 0) {
      // Nesene: kazda jednotka, ktera neco drzi a nenosi suroviny.
      sondaNosici = xsGetPlayerUnitIds(h, -1, sondaNosici);
      for (m = 0; < xsArrayGetSize(sondaNosici)) {
        int nosic = xsArrayGetInt(sondaNosici, m);
        int trida = xsGetUnitClass(nosic);
        if ((xsGetUnitType(nosic) == 70) && (trida != 904) && (trida != 919) && (trida != 902) && (trida != 921) && (pocetRelikvii < 32)) {
          if (xsGetUnitAttributeHeld(nosic, -1) > 0.0) {
            vector nesena = xsGetUnitPosition(nosic);
            xsArraySetVector(sondaMistaRelikvii, pocetRelikvii, xsVectorSet(xsVectorGetX(nesena), xsVectorGetY(nesena), h));
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
              xsArraySetVector(sondaMistaRelikvii, pocetRelikvii, xsVectorSet(xsVectorGetX(klaster), xsVectorGetY(klaster), h));
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
    xsWriteFloat(xsVectorGetZ(misto));
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

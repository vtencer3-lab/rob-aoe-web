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
// vic, bere se prvni; web GM na mape nekresli). Relikvie = objekt 285.
// xsGetPlayerUnitIds vraci jen relikvie volne na mape - zvednuta (nalozena
// v jednotce nebo klasteru) v nem chybi. Sonda si proto pamatuje id kazde
// relikvie, kterou jednou videla, a u nalozene zapise polohu toho, kdo ji
// nese (xsGetGarrisonedInUnitId). Relikvie, ktera na mape nikdy nelezela
// (trigger ji vlozi rovnou do klastera), se neukaze, dokud ji nikdo nepolozi.
// Kod je schvalne ciste ASCII (validator xs-check cte UTF-8).
// Pole pro id kralu se pouziva znovu (treti parametr), ne nove kazdou sekundu.
int sondaKralove = -1;
int sondaRelikvie = -1;
// Id relikvii, ktere sonda uz videla na mape (nejvys 32), a kolik jich je.
int sondaZnameRelikvie = -1;
int sondaPocetZnamych = 0;

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
  if (sondaZnameRelikvie < 0) {
    sondaZnameRelikvie = xsArrayCreateInt(32, -1, "sondaZnameRelikvie");
  }
  // Nove relikvie volne na mape do pameti.
  sondaRelikvie = xsGetPlayerUnitIds(0, 285, sondaRelikvie);
  for (n = 0; < xsArrayGetSize(sondaRelikvie)) {
    int idNove = xsArrayGetInt(sondaRelikvie, n);
    bool znama = false;
    for (z = 0; < sondaPocetZnamych) {
      if (xsArrayGetInt(sondaZnameRelikvie, z) == idNove) {
        znama = true;
      }
    }
    if ((znama == false) && (sondaPocetZnamych < 32)) {
      xsArraySetInt(sondaZnameRelikvie, sondaPocetZnamych, idNove);
      sondaPocetZnamych = sondaPocetZnamych + 1;
    }
  }
  // Zapisuji se zname relikvie, ktere porad existuji: volna na svem miste,
  // nalozena na miste jednotky nebo budovy, ktera ji nese.
  int pocetRelikvii = 0;
  for (e = 0; < sondaPocetZnamych) {
    if (xsDoesUnitExist(xsArrayGetInt(sondaZnameRelikvie, e))) {
      pocetRelikvii = pocetRelikvii + 1;
    }
  }
  xsWriteInt(pocetRelikvii);
  for (q = 0; < sondaPocetZnamych) {
    int idRelikvie = xsArrayGetInt(sondaZnameRelikvie, q);
    if (xsDoesUnitExist(idRelikvie)) {
      int nosic = xsGetGarrisonedInUnitId(idRelikvie);
      if (nosic >= 0) {
        idRelikvie = nosic;
      }
      vector misto = xsGetUnitPosition(idRelikvie);
      xsWriteFloat(xsVectorGetX(misto));
      xsWriteFloat(xsVectorGetY(misto));
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

rule _sondaTik
  active
  minInterval 1
  maxInterval 1
{
  sondaZapis();
}

// Super sonda Diplomacie (rob-aoe-web): kazdych 5 hernich sekund prepise
// profile\<scenar>.xsdat uplnym vypisem toho, co XS o hre vi. Slouzi ke
// zjisteni, jaka data jdou ze hry ziskat (katalog), ne k provozu - soubor ma
// ~150 kB. Rozlozeni cte nastroje/diplomacie/xsdat.py (verze 100); sekce jdou
// v pevnem poradi a kazda zacina retezcem se jmenem.
// Kod je schvalne ciste ASCII (validator xs-check cte UTF-8).

int ssPole = -1;

void ssHra() {
  xsWriteString("HRA");
  xsWriteInt(xsGetGameTime());
  xsWriteInt(xsGetTurn());
  xsWriteInt(xsGetNumPlayers());
  xsWriteInt(xsGetMapWidth());
  xsWriteInt(xsGetMapHeight());
  xsWriteInt(xsGetMapID());
  xsWriteInt(xsGetMapSeed());
  xsWriteString(xsGetMapName(true));
  xsWriteInt(xsGetVictoryType());
  xsWriteInt(xsGetVictoryCondition());
  xsWriteInt(xsGetVictoryPlayer());
  xsWriteInt(xsGetVictoryTime());
  xsWriteInt(xsGetDifficulty());
  xsWriteInt(xsUnsyncGetLocalPlayerId());
  xsWriteInt(xsGetContextPlayer());
}

// Slot scenare (1-8, obvykle = barva) -> cislo hrace ve hre (poradi v lobby).
void ssSloty() {
  xsWriteString("SLOTY");
  xsWriteInt(8);
  for (s = 1; < 9) {
    xsWriteInt(xsGetWorldPlayerId(s));
  }
}

void ssNazvyAtributu(int pocet = 0) {
  xsWriteString("ATRIBUTY");
  xsWriteInt(pocet);
  for (i = 0; < pocet) {
    xsWriteString(xsGetPlayerAttributeName(i, false));
  }
}

void ssHrac(int p = 0, int pocet = 0) {
  xsWriteInt(p);
  xsWriteString(xsGetPlayerName(p));
  xsWriteString(xsGetPlayerColorTag(p));
  xsWriteInt(xsGetPlayerCivilization(p));
  xsWriteString(xsGetPlayerCivName(p, false));
  xsWriteInt(xsGetPlayerType(p));
  if (xsGetPlayerInGame(p)) {
    xsWriteInt(1);
  } else {
    xsWriteInt(0);
  }
  xsWriteFloat(xsGetHandicapMultiplier(p));
  xsWriteInt(xsGetPlayerNumberOfTechs(p));
  xsWriteInt(pocet);
  for (i = 0; < pocet) {
    xsWriteFloat(xsPlayerAttribute(p, i));
  }
}

void ssHraci(int pocet = 0) {
  xsWriteString("HRACI");
  xsWriteInt(9);
  for (p = 0; < 9) {
    ssHrac(p, pocet);
  }
}

// Pocty zivych jednotek podle trid 900-965 (cArcherClass ... cSentinelEndClass).
void ssTridy() {
  xsWriteString("TRIDY");
  xsWriteInt(9);
  xsWriteInt(66);
  for (p = 0; < 9) {
    for (c = 900; < 966) {
      xsWriteInt(xsGetObjectCount(p, c));
    }
  }
}

void ssTechy(int pocet = 0) {
  xsWriteString("TECHY");
  xsWriteInt(pocet);
  for (t = 0; < pocet) {
    xsWriteString(xsGetTechName(t, 1, true));
  }
  for (p = 1; < 9) {
    for (t = 0; < pocet) {
      xsWriteInt(xsGetTechState(t, p));
    }
  }
}

void ssDiplomacie() {
  xsWriteString("DIPLOMACIE");
  xsWriteInt(8);
  for (a = 1; < 9) {
    for (b = 1; < 9) {
      xsWriteInt(xsGetDiplomacy(a, b));
    }
  }
}

void ssPromenne() {
  xsWriteString("PROMENNE");
  xsWriteInt(256);
  for (v = 0; < 256) {
    xsWriteInt(xsTriggerVariable(v));
  }
}

// Jednotky jednoho hrace podle tridy nebo cisla objektu: id, objekt, pozice, zivoty.
void ssSkupina(int p = 0, int kod = 0) {
  int n = 0;
  int u = 0;
  ssPole = xsGetPlayerUnitIds(p, kod, ssPole);
  if (ssPole >= 0) {
    n = xsArrayGetSize(ssPole);
  }
  if (n > 300) {
    n = 300;
  }
  xsWriteInt(p);
  xsWriteInt(kod);
  xsWriteInt(n);
  for (j = 0; < n) {
    u = xsArrayGetInt(ssPole, j);
    xsWriteInt(u);
    xsWriteInt(xsGetUnitObjectId(u));
    xsWriteVector(xsGetUnitPosition(u));
    xsWriteFloat(xsGetUnitHitpoints(u));
  }
}

// 959 kral, 943 mnich s relikvii, 918 mnich, 925 hrdina, 82 hrad,
// 104 klaster, 109 centrum, 276 div sveta; u Gaie (0) relikvie 942.
void ssJednotky() {
  xsWriteString("JEDNOTKY");
  xsWriteInt(65);
  ssSkupina(0, 942);
  for (p = 1; < 9) {
    ssSkupina(p, 959);
    ssSkupina(p, 943);
    ssSkupina(p, 918);
    ssSkupina(p, 925);
    ssSkupina(p, 82);
    ssSkupina(p, 104);
    ssSkupina(p, 109);
    ssSkupina(p, 276);
  }
}

void superSonda() {
  int cas = xsGetWorldTime();
  int techu = xsGetPlayerNumberOfTechs(1);
  infiniteLoopLimit = 1000000;
  if (techu > 1600) {
    techu = 1600;
  }
  xsCreateFile(false);
  xsWriteInt(100);
  xsWriteInt(cas);
  ssHra();
  ssSloty();
  ssNazvyAtributu(600);
  ssHraci(600);
  ssTridy();
  ssTechy(techu);
  ssDiplomacie();
  ssPromenne();
  ssJednotky();
  xsWriteInt(cas);
  xsWriteString("KONEC");
  xsCloseFile();
}

rule _superSondaTik
  active
  minInterval 5
  maxInterval 5
{
  superSonda();
}

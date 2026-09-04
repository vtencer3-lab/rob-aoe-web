// Testy nad databází (src/**/*.db.test.ts) volají TRUNCATE nad tabulkami
// cílové databáze. Jediná pojistka proti smazání vývojových dat je to, že
// operátor nastaví DATABASE_URL na testovací databázi. Tento soubor běží
// jako vitest setupFile před každým testovacím souborem a run zastaví dřív,
// než stihne proběhnout jediný TRUNCATE, pokud DATABASE_URL nemíří na
// databázi, jejíž jméno končí na "_test".

const url = process.env["DATABASE_URL"];

if (!url) {
  throw new Error(
    "Chybí DATABASE_URL. Testy nad databází (npm run test:db) potřebují testovací " +
      "databázi, např. postgres://postgres:postgres@localhost:5432/rob_aoe_test.",
  );
}

let nazevDb: string;
try {
  nazevDb = new URL(url).pathname.replace(/^\//, "");
} catch {
  throw new Error(`DATABASE_URL "${url}" není platná URL.`);
}

if (!nazevDb.endsWith("_test")) {
  throw new Error(
    `DATABASE_URL míří na databázi "${nazevDb}", jejíž jméno nekončí na "_test". ` +
      "Testy nad databází (npm run test:db) volají TRUNCATE nad tabulkami cílové databáze — " +
      'spouštět je proti čemukoliv jinému než testovací databázi (např. "rob_aoe_test") by smazalo ' +
      `data. Nastav DATABASE_URL na testovací databázi a zkus to znovu (aktuálně: "${nazevDb}").`,
  );
}

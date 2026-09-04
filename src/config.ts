function povinne(jmeno: string, proc?: string): string {
  const hodnota = process.env[jmeno];
  if (!hodnota) {
    throw new Error(`Chybí proměnná prostředí ${jmeno}.${proc === undefined ? "" : ` ${proc}`}`);
  }
  return hodnota;
}

export const config = {
  baseUrl: process.env["BASE_URL"] ?? "http://localhost:3000",
  port: Number(process.env["PORT"] ?? 3000),
  steamApiKey: process.env["STEAM_API_KEY"] ?? "",
  // Obojí se čte při každém přístupu, ne jednou při načtení modulu: startovní
  // kontrola i přihlašovací routa se tím dají otestovat podstrčeným prostředím.
  get adminSteamId(): string {
    return process.env["ADMIN_STEAM_ID"] ?? "";
  },
  /** Nouzový režim pro rozjezd bez Roba: první přihlášený se stane adminem. */
  get adminBootstrap(): boolean {
    return process.env["ADMIN_BOOTSTRAP"] === "true";
  },
  get jeProdukce(): boolean {
    return this.baseUrl.startsWith("https://");
  },
};

/**
 * Kontroluje prostředí dřív, než server začne poslouchat. Volá se jen z main.ts,
 * aby testy a `buildServer` zůstaly na prostředí nezávislé.
 *
 * ADMIN_STEAM_ID je tu proto, že jeho chybějící hodnota se navenek nijak
 * neprojeví — jen tiše ublíží: přihlašovací routa volá při KAŽDÉM přihlášení
 * `upsertPlayer(steamId, steamId === config.adminSteamId)` a `upsertPlayer`
 * dělá `ON CONFLICT DO UPDATE SET je_admin = EXCLUDED.je_admin`. Bez proměnné
 * je porovnání vždy nepravda, takže první Robovo přihlášení po restartu jeho
 * `je_admin` přepíše na false a režie zmizí bez jediné chybové hlášky.
 * Restartovat server po nastavení BASE_URL na tunelovou adresu je přitom přesně
 * to, co říká návod v README. Radši se nespustit, než se spustit napůl.
 */
export function zkontrolujProstredi(): void {
  povinne("DATABASE_URL", "Bez připojení k databázi web neobslouží ani jeden požadavek.");
  if (config.adminSteamId === "" && !config.adminBootstrap) {
    throw new Error(
      "Chybí proměnná prostředí ADMIN_STEAM_ID. Je to 64bitové Steam ID Robova " +
        "účtu. Bez něj by se Robovi při dalším přihlášení tiše odebrala práva " +
        "admina a panel režie by zmizel. Když Rob není po ruce, nastav místo " +
        "toho ADMIN_BOOTSTRAP=true — adminem se stane první, kdo se přihlásí.",
    );
  }
}

/**
 * Varování do logu při startu v nouzovém režimu. Kdo drží adresu, drží režii,
 * dokud se první člověk nepřihlásí — proto se to nesmí dít potichu.
 */
export function varovaniProstredi(): string | null {
  if (config.adminSteamId !== "" || !config.adminBootstrap) return null;
  return (
    "ADMIN_BOOTSTRAP je zapnutý: adminem se stane první, kdo se přihlásí. " +
    "Přihlas se dřív, než adresu komukoliv pošleš, a pak nouzový režim vypni."
  );
}

export { povinne };

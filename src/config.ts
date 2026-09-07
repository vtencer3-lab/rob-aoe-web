function povinne(jmeno: string, proc?: string): string {
  const hodnota = process.env[jmeno];
  if (!hodnota) {
    throw new Error(`Chybí proměnná prostředí ${jmeno}.${proc === undefined ? "" : ` ${proc}`}`);
  }
  return hodnota;
}

/**
 * Cesta, pod kterou web veřejně běží, odvozená z BASE_URL: pro
 * `https://jouki.cz/aoe` je to `/aoe`, pro `http://localhost:3000` prázdný
 * řetězec. Reverzní proxy (Traefik v Coolify) prefix před předáním serveru
 * odstraní, takže routy zůstávají na kořeni — prefix potřebují jen věci, které
 * jdou zpátky do prohlížeče: přesměrování a cesta cookie.
 */
export function zakladniCesta(baseUrl: string): string {
  try {
    return new URL(baseUrl).pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Název cookie se sezením. Ostrá a vývojová verze běží na téže doméně pod
 * cestami `/aoe` a `/aoe/dev`; cookie s cestou `/aoe` prohlížeč posílá i na
 * `/aoe/dev`, takže by se obě verze o jedno `sid` přetahovaly. Jiný název
 * pro každou cestu to řeší bez další konfigurace.
 */
export function nazevCookie(basePath: string): string {
  return `sid${basePath.replace(/\//g, "_")}`;
}

export const config = {
  get baseUrl(): string {
    return process.env["BASE_URL"] ?? "http://localhost:3000";
  },
  get basePath(): string {
    return zakladniCesta(this.baseUrl);
  },
  get cookieNazev(): string {
    return nazevCookie(this.basePath);
  },
  /** Kam se po přihlášení a ze zkušebních dveří vrací prohlížeč. */
  get domovskaCesta(): string {
    return `${this.basePath}/`;
  },
  /**
   * Na čem server poslouchá. Výchozí loopback: veřejný přístup vede vždy přes
   * tunel nebo proxy. V Docker kontejneru musí být 0.0.0.0, jinak se k němu
   * proxy nedostane.
   */
  get host(): string {
    return process.env["HOST"] ?? "127.0.0.1";
  },
  port: Number(process.env["PORT"] ?? 3000),
  steamApiKey: process.env["STEAM_API_KEY"] ?? "",
  // Obojí se čte při každém přístupu, ne jednou při načtení modulu: startovní
  // kontrola i přihlašovací routa se tím dají otestovat podstrčeným prostředím.
  /**
   * Steam ID účtů s režií, čárkou oddělený seznam (`id1,id2`). Dva admini
   * jsou normální stav: Rob a ten, kdo mu web spravuje. Prázdný seznam =
   * proměnná chybí.
   */
  get adminSteamIds(): string[] {
    return (process.env["ADMIN_STEAM_ID"] ?? "")
      .split(/[\s,;]+/)
      .map((id) => id.trim())
      .filter((id) => id !== "");
  },
  /** Nouzový režim pro rozjezd bez Roba: první přihlášený se stane adminem. */
  get adminBootstrap(): boolean {
    return process.env["ADMIN_BOOTSTRAP"] === "true";
  },
  /**
   * Zkušební dveře pro vyzkoušení večera nasucho: přihlášení bez Steamu a
   * naplnění akce falešnými hráči. Samotná proměnná nestačí — routy se navíc
   * zavírají, jakmile BASE_URL míří na https (viz devRoutes.ts).
   */
  get devPristup(): boolean {
    return process.env["DEV_PRISTUP"] === "true";
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
 * `upsertPlayer(steamId, config.adminSteamIds.includes(steamId))` a `upsertPlayer`
 * dělá `ON CONFLICT DO UPDATE SET je_admin = EXCLUDED.je_admin`. Bez proměnné
 * je porovnání vždy nepravda, takže první Robovo přihlášení po restartu jeho
 * `je_admin` přepíše na false a režie zmizí bez jediné chybové hlášky.
 * Restartovat server po nastavení BASE_URL na tunelovou adresu je přitom přesně
 * to, co říká návod v README. Radši se nespustit, než se spustit napůl.
 */
export function zkontrolujProstredi(): void {
  povinne("DATABASE_URL", "Bez připojení k databázi web neobslouží ani jeden požadavek.");
  if (config.adminSteamIds.length === 0 && !config.adminBootstrap) {
    throw new Error(
      "Chybí proměnná prostředí ADMIN_STEAM_ID. Je to 64bitové Steam ID Robova " +
        "účtu (víc účtů oddělených čárkou). Bez něj by se Robovi při dalším přihlášení tiše odebrala práva " +
        "admina a panel režie by zmizel. Když Rob není po ruce, nastav místo " +
        "toho ADMIN_BOOTSTRAP=true — adminem se stane první, kdo se přihlásí.",
    );
  }
}

/**
 * Varování do logu při startu. Riziko trvá jen dokud admin neexistuje: v tu
 * chvíli kdo drží adresu, drží režii. Jakmile admin je, ADMIN_BOOTSTRAP už
 * nikomu nic nepřidá, takže může zůstat zapnutý natrvalo jako pojistka a
 * nemá smysl na něj při každém startu upozorňovat.
 *
 * `adminUzExistuje` se předává zvenčí, aby tahle funkce nesahala na databázi.
 * Když se to nedá zjistit, volající má poslat `false` — radši varovat zbytečně
 * než mlčet, když je režie volná.
 */
export function varovaniProstredi(adminUzExistuje: boolean): string | null {
  if (config.adminSteamIds.length > 0 || !config.adminBootstrap) return null;
  if (adminUzExistuje) return null;
  return (
    "ADMIN_BOOTSTRAP je zapnutý a admin zatím neexistuje: stane se jím první, " +
    "kdo se přihlásí. Přihlas se dřív, než adresu komukoliv pošleš."
  );
}

/**
 * Zkušební dveře jsou tichá věc: v .env zůstanou zapnuté a nikde na stránce
 * nejsou vidět. Řádek při startu je jediné místo, kde se o nich Rob dozví —
 * a hlavně se dozví, že na tunelové adrese fungovat nebudou, takže je nemá
 * proč hledat, až mu tam přestanou.
 */
export function varovaniDevPristup(): string | null {
  if (!config.devPristup) return null;
  if (config.jeProdukce) {
    return "DEV_PRISTUP je zapnutý, ale BASE_URL míří na https — zkušební dveře jsou zavřené. Tak to má být.";
  }
  return "DEV_PRISTUP je zapnutý: /api/dev/login a /api/dev/naplnit obcházejí Steam. Na localhostu v pořádku, přes tunel se samy zavřou.";
}

export { povinne };

/**
 * Bez klíče se Steamu neptáme vůbec: nejsou avatary, jména ze Steamu ani
 * hodiny a v tabulce zůstanou pomlčky. Nikde jinde se to nepozná, tak aspoň
 * řádek při startu.
 */
export function varovaniSteamKlic(): string | null {
  if (config.steamApiKey !== "") return null;
  return "STEAM_API_KEY chybí: avatary, jména ze Steamu ani odehrané hodiny se nestahují. Klíč je zdarma na https://steamcommunity.com/dev/apikey.";
}

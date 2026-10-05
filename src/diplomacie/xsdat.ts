/**
 * Čtení souboru sondy (`<scénář>.xsdat`, src/diplomacie/sonda.xs) na serveru
 * — pro Streamer.bot hráčů, který posílá soubor tak, jak je (uživatel
 * 5. 10. 2026: osobní klíč mostu, data rovnou na web). Totéž umí
 * `nastroje/diplomacie/xsdat.py` (+ `most.py` skládá tělo); tady jen naše
 * soubory se značkou „ROBD“, formáty 5–8. Výsledek je tělo jako od mostu
 * (`POST /api/diplo/hra`), jeho tvar ověří `prectiSnimek`.
 */

/** První int32 našich souborů: bajty „ROBD“. */
const ZNACKA = 0x44424f52;
const ZNAME_FORMATY = new Set([5, 6, 7, 8]);
const MAX_RELIKVII = 32;

class Ctecka {
  private pos = 0;
  constructor(private readonly data: Buffer) {}
  int(): number {
    const v = this.data.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  float(): number {
    const v = this.data.readFloatLE(this.pos);
    this.pos += 4;
    return v;
  }
  retezec(): string {
    const delka = this.data.readUInt32LE(this.pos);
    this.pos += 4;
    if (delka > 1024) throw new Error(`nesmyslná délka řetězce ${delka}`);
    const t = this.data.toString("utf8", this.pos, this.pos + delka);
    this.pos += delka;
    return t;
  }
}

const zaokrouhli = (x: number) => Math.round(x * 100) / 100;

/**
 * Soubor sondy → tělo pro příjem snímku. `jmenoSouboru` je jméno souboru
 * ve hře (`ROB_DIPLO_3_v9.xsdat`), z něj je jméno scénáře. Vadný nebo
 * rozepsaný soubor (čas na začátku a na konci nesedí) = výjimka s českou větou.
 */
export function teloZXsdat(data: Buffer, jmenoSouboru: string, odesilatel: string): Record<string, unknown> {
  const c = new Ctecka(data);
  try {
    if (c.int() !== ZNACKA) throw new Error("není to soubor naší sondy (chybí značka ROBD)");
    const verze = c.int();
    if (!ZNAME_FORMATY.has(verze)) throw new Error(`soubor sondy formátu ${verze}, web zná 5–8`);
    const cas = c.int();
    const sloty = Array.from({ length: 8 }, () => c.int());
    const hraci: Record<string, unknown>[] = [];
    for (let p = 1; p <= 8; p++) {
      const jmeno = c.retezec();
      const barva = c.retezec();
      const relikvie = Math.trunc(c.float());
      const zije = c.int() !== 0;
      hraci.push({ cislo: p, jmeno, barva, relikvie, zije });
    }
    if (verze >= 6) {
      for (const h of hraci) {
        const x = c.float();
        const y = c.float();
        h["kral"] = x < 0 || y < 0 ? null : { x: zaokrouhli(x), y: zaokrouhli(y) };
      }
    }
    let relikvieNaMape: Record<string, number>[] | undefined;
    if (verze >= 7) {
      const pocet = c.int();
      if (pocet < 0 || pocet > MAX_RELIKVII) throw new Error(`nesmyslný počet relikvií ${pocet}`);
      relikvieNaMape = [];
      for (let i = 0; i < pocet; i++) {
        const r: Record<string, number> = { x: zaokrouhli(c.float()), y: zaokrouhli(c.float()) };
        if (verze >= 8) r["hrac"] = Math.round(c.float());
        relikvieNaMape.push(r);
      }
    }
    const diplomacie = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => c.int()));
    const promenne = Array.from({ length: 256 }, () => c.int());
    if (c.int() !== cas) throw new Error("soubor se zrovna zapisuje (čas na začátku a na konci nesedí)");
    return {
      v: 1,
      odesilatel,
      scenar: `${jmenoSouboru.replace(/\.xsdat$/i, "")}.aoe2scenario`,
      cas,
      sloty,
      hraci,
      diplomacie,
      promenne,
      ...(relikvieNaMape ? { relikvieNaMape } : {}),
    };
  } catch (e) {
    if (e instanceof RangeError) throw new Error("soubor sondy je zkrácený");
    throw e;
  }
}

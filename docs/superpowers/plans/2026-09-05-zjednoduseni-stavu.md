# Zjednodušení stavů akce a zápasu — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zúžit pět stavů akce na dva a šest stavů zápasu na tři, zrušit potvrzení hosta a odemknout viditelnost zápasu hned po složení.

**Architecture:** Tři samostatně nasaditelné úkoly, každý s vlastní migrací, aby mezi nimi kód nikdy neodkazoval na sloupec, který už neexistuje. Postup jde od nejméně provázaného (potvrzení hosta) přes akci k zápasu, jehož typ `MatchState` se dotýká nejvíc souborů.

**Tech Stack:** TypeScript ESM (NodeNext, strict), Fastify 5, PostgreSQL 17, React 19, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-05-zjednoduseni-stavu-design.md`](../specs/2026-09-05-zjednoduseni-stavu-design.md)

## Global Constraints

- Identifikátory i uživatelské texty česky, commity anglicky v rozkazovacím způsobu.
- Přípona `.js` v importech, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- `DATABASE_URL` pro `npm run test:db` **vždy** `postgres://postgres:postgres@localhost:5432/rob_aoe_test`. Nikdy `rob_aoe`.
- Typová kontrola frontendu **není** v `npx tsc --noEmit`; kontroluje ji až `npm run build`. Po zásahu do `src/shared/types.ts` doběhnout celý build a ověřit, že se změnil hash ve `web/dist/assets`.
- Po každém úkolu musí být zelené všechny tři sady: `npm test`, `npm run test:db`, `npm --prefix web test`.

**Odchylka od specifikace (vědomá):** spec mluví o jedné migraci `004_min_stavu.sql`. Plán ji dělí na tři (`004`, `005`, `006`), aby každý úkol zůstal samostatně nasaditelný a kód mezi úkoly nikdy nesahal na zahozený sloupec. Obsah je součtem totožný.

**Musí zůstat zelené beze změny** (kontrola, že se při mazání neustřelilo): zaslepení hesla a odkazů pro nezúčastněného v `redakce.test.ts`, `requireAdmin` na mutujících routách, invariant jedné otevřené akce, compare-and-swap ve `setZapasStav`.

---

### Task 1: Zrušit potvrzení hosta

Nezamyká nic už od Tasku 17 (Spectate se řídí jen existencí odkazu) a vložení nového odkazu ho tiše odškrtávalo. Nejméně provázaná část — nedotýká se žádného stavového typu.

**Files:**
- Create: `database/004_bez_potvrzeni_hosta.sql`
- Modify: `src/db/matches.ts` (`UcastnikRow` sousedí; `ZapasRow.hostPotvrdil`, `mapujZapas`, `setLobbyId`, smazat `setHostPotvrdil`)
- Modify: `src/shared/types.ts` (`ZapasView.hostPotvrdil`)
- Modify: `src/realtime/akceStav.ts` (`zapasView`)
- Modify: `src/http/routes/matches.ts` (smazat routu `/potvrzeni` a import `setHostPotvrdil`)
- Modify: `web/src/views/ObrazovkaHosta.tsx` (tlačítko a hláška), `web/src/views/Rezie.tsx` (stavový řádek)
- Test: `src/db/matches.db.test.ts`, `src/http/routes/matches.db.test.ts`, `src/realtime/redakce.test.ts`, `web/src/views/ObrazovkaHosta.test.tsx`, `web/src/views/Rezie.test.tsx`, `web/src/views/KartaHrace.test.tsx`, `web/src/zapas.test.ts`, `web/src/App.test.tsx`

**Interfaces:**
- Consumes: nic z dřívějších úkolů.
- Produces: `ZapasView` bez pole `hostPotvrdil`; `ZapasRow` bez pole `hostPotvrdil`. Task 3 na tenhle tvar navazuje.

- [ ] **Step 1: Napsat migraci**

```sql
-- database/004_bez_potvrzeni_hosta.sql
-- Potvrzení hosta nezamykalo nic už od chvíle, kdy se Spectate začal řídit
-- výhradně existencí odkazu do lobby. Zbyla z něj informace, kterou nikdo
-- nečetl, a past: vložení nového odkazu ji tiše rušilo, takže host nevěděl,
-- že má potvrzovat znovu.
ALTER TABLE zapas DROP COLUMN host_potvrdil;
```

- [ ] **Step 2: Spustit migraci a ověřit, že sloupec zmizel**

```
npm run db:migrate
DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test" npm run db:migrate
```

- [ ] **Step 3: Smazat testy, které potvrzení hosta ověřují**

V `src/db/matches.db.test.ts` smazat testy volající `setHostPotvrdil`. V `src/http/routes/matches.db.test.ts` smazat testy routy `/potvrzeni`. Ve všech frontendových fixturách odstranit řádek `hostPotvrdil: …`.

- [ ] **Step 4: Spustit sady a vidět, že padají na chybějícím sloupci i na typech**

```
DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test" npm run test:db
```
Expected: FAIL — `column "host_potvrdil" does not exist`.

- [ ] **Step 5: Odstranit sloupec z kódu**

`src/db/matches.ts`: z `ZapasRow` pryč `hostPotvrdil`, z `mapujZapas` pryč jeho mapování, ze `setLobbyId` pryč `host_potvrdil = NULL`:

```ts
export async function setLobbyId(zapasId: number, lobbyId: string): Promise<void> {
  await getPool().query("UPDATE zapas SET lobby_id = $2 WHERE id = $1", [zapasId, lobbyId]);
}
```

Smazat celou `setHostPotvrdil`. V `src/shared/types.ts` z `ZapasView` pryč `hostPotvrdil`. V `src/realtime/akceStav.ts` pryč z `zapasView`. V `src/http/routes/matches.ts` smazat celou routu `/api/zapas/:id/potvrzeni` a import `setHostPotvrdil`.

- [ ] **Step 6: Odstranit z UI**

`ObrazovkaHosta.tsx`: smazat celý blok `{zapas.hostPotvrdil ? … : <button …>Sedí to — jsme nachystaní</button>}` a prop `onPotvrdit`. `Rezie.tsx`: smazat `<p className="stavovy-radek">` s potvrzením hosta. `App.tsx`: přestat předávat `onPotvrdit`. `web/src/api.ts`: smazat `potvrdit`.

- [ ] **Step 7: Ověřit všechny tři sady a build**

```
npx tsc --noEmit && npm test && DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test" npm run test:db && npm --prefix web test && npm run build
```
Expected: vše zelené, build projde.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Drop the host confirmation that locked nothing"
```

---

### Task 2: Akce má jen dva stavy

**Files:**
- Create: `database/005_akce_dva_stavy.sql`
- Modify: `src/db/events.ts` (`AkceStav`), `src/http/routes/events.ts` (`STAVY`, závora přihlášky)
- Modify: `web/src/views/SpravaAkce.tsx`, `web/src/App.tsx`
- Test: `src/db/events.db.test.ts`, `src/http/routes/events.db.test.ts`, `src/http/routes/matches.db.test.ts`, `src/http/routes/stream.db.test.ts`, `web/src/views/SpravaAkce.test.tsx`, `web/src/App.test.tsx`, `web/src/useAkceStav.test.ts`

**Interfaces:**
- Consumes: nic z Tasku 1.
- Produces: `type AkceStav = "bezi" | "konec"`. Task 3 se ho nedotýká.

- [ ] **Step 1: Napsat migraci**

```sql
-- database/005_akce_dva_stavy.sql
-- Pět stavů akce bylo navržených pro turnaj o tuctu zápasů. Rob hraje jeden
-- večer a obvykle jeden zápas, takže „priprava“, „prihlasovani“ a „zavreno“
-- byly jen kliky navíc, na kterých se dalo v přímém přenosu zaseknout.
-- Zbývá „bezi“ a „konec“.
--
-- Index jedna_aktivni_akce z migrace 003 stojí na stav <> 'konec', takže po
-- slití platí dál a invariant „nejvýš jedna otevřená akce“ zůstává vynucený.
UPDATE akce SET stav = 'bezi' WHERE stav <> 'konec';
ALTER TABLE akce ALTER COLUMN stav SET DEFAULT 'bezi';
```

- [ ] **Step 2: Napsat padající test na povolenou závoru přihlášky**

Do `src/http/routes/events.db.test.ts`:

```ts
it("přihlásit se jde do každé běžící akce, ne jen do té ve stavu prihlasovani", async () => {
  const akce = await createAkce("večer");
  const odpoved = await app.inject({
    method: "POST",
    url: `/api/akce/${akce.id}/prihlaska`,
    cookies: { sid: await createSession(HRAC) },
  });
  expect(odpoved.statusCode).toBe(200);
});
```

- [ ] **Step 3: Spustit a vidět 409**

```
DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test" npm run test:db src/http/routes/events.db.test.ts
```
Expected: FAIL — 409 „Přihlašování do téhle akce není otevřené." (nová akce má po migraci `bezi`, ne `prihlasovani`).

- [ ] **Step 4: Zúžit typ a povolit závoru**

`src/db/events.ts`:
```ts
export type AkceStav = "bezi" | "konec";
```

`src/http/routes/events.ts`:
```ts
const STAVY: readonly AkceStav[] = ["bezi", "konec"];
```
a v routě přihlášky:
```ts
    const akce = await getAktivniAkce();
    // getAktivniAkce skončené akce nevrací, takže „akce běží“ a „hlásit se lze“
    // splývají v jedno — zvláštní stav pro otevřené přihlašování už neexistuje.
    if (!akce || akce.id !== akceId) {
      throw new HttpError(409, "Tahle akce neběží.");
    }
```

- [ ] **Step 5: Zjednodušit UI akce**

`SpravaAkce.tsx`: smazat `KROKY`, `POPIS_STAVU` i řádek „Stav akce: …". Zůstane název akce a „Ukončit akci" s potvrzením. `App.tsx`: `{me && akce.stav === "prihlasovani" ? …}` → `{me ? …}`.

- [ ] **Step 6: Ověřit sady a build**

```
npx tsc --noEmit && npm test && DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test" npm run test:db && npm --prefix web test && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Cut the event down to running and finished"
```

---

### Task 3: Zápas má tři stavy

Nejrozsáhlejší úkol — `MatchState` je sdílený typ a jeho zúžení rozsvítí chyby napříč databází, automatem, routami, redakcí i UI.

**Files:**
- Create: `database/006_zapas_tri_stavy.sql`
- Modify: `src/matches/stateMachine.ts`, `src/db/matches.ts` (`setZapasStav`), `src/http/routes/matches.ts` (`prejdi`, routa `/lobby`), `src/realtime/redakce.ts`, `web/src/views/Rezie.tsx`
- Test: `src/matches/stateMachine.test.ts`, `src/db/matches.db.test.ts`, `src/http/routes/matches.db.test.ts`, `src/http/routes/stream.db.test.ts`, `src/realtime/redakce.test.ts`, `web/src/views/Rezie.test.tsx`, `web/src/zapas.test.ts`, `web/src/views/KartaHrace.test.tsx`, `web/src/views/ObrazovkaHosta.test.tsx`, `web/src/App.test.tsx`

**Interfaces:**
- Consumes: `ZapasView` bez `hostPotvrdil` (Task 1).
- Produces: `type MatchState = "bezi" | "dohrano" | "zruseny"`; `canTransition(from: MatchState, to: MatchState): boolean`; `assertTransition(from: MatchState, to: MatchState): void`; `setZapasStav(zapasId: number, stav: MatchState): Promise<void>`. Typ `Actor` přestává existovat.

- [ ] **Step 1: Napsat migraci**

```sql
-- database/006_zapas_tri_stavy.sql
-- „nachystany“ znamenalo „Rob složil sestavu, nikdo to ještě nevidí“ a
-- redakce takový zápas ne-adminům nevydávala vůbec. Při první ostré zkoušce
-- přes tunel to dvakrát po sobě vypadalo jako porucha: admin zápas viděl,
-- hráč ne, a nic to nevysvětlovalo. Zadavatel viditelnost vědomě otevírá.
--
-- „lobby_otevrena“ nastavoval server sám při vložení odkazu, takže se pozná
-- podle toho, že odkaz existuje; „vyhlaseny“ a „hraje_se“ byly jen kliky.
UPDATE zapas SET stav = 'bezi' WHERE stav NOT IN ('dohrano', 'zruseny');
ALTER TABLE zapas ALTER COLUMN stav SET DEFAULT 'bezi';

-- Plnil ho jedině přechod na „hraje_se“; bez něj by zůstal navždy NULL.
-- Kdy zápas vznikl, drží vytvoren. konec zůstává — píše ho zápis výsledku.
ALTER TABLE zapas DROP COLUMN zacatek;
```

- [ ] **Step 2: Napsat padající testy**

Do `src/matches/stateMachine.test.ts`:
```ts
it("dovolí každý přechod mezi třemi stavy", () => {
  expect(canTransition("bezi", "dohrano")).toBe(true);
  expect(canTransition("bezi", "zruseny")).toBe(true);
  // Překliknutý výsledek musí jít vrátit, i když UI tlačítko nenabízí.
  expect(canTransition("dohrano", "bezi")).toBe(true);
});

it("přechod na sebe sama odmítne", () => {
  expect(canTransition("bezi", "bezi")).toBe(false);
});
```

Do `src/realtime/redakce.test.ts` — jádro celé změny:
```ts
it("složený zápas vidí i obyčejný hráč, žádné vyhlašování se nečeká", () => {
  const vysledek = redigujProDivaka(stav, { steamId: HRAC, jeAdmin: false });
  expect(vysledek.zapasy).toHaveLength(1);
});
```
(fixtura `zapas` v tom souboru musí mít `stav: "bezi"`.)

- [ ] **Step 3: Spustit a vidět, že padají**

```
npm test src/matches/stateMachine.test.ts src/realtime/redakce.test.ts
```
Expected: FAIL — `canTransition` má tři parametry, redakce zápas odfiltruje.

- [ ] **Step 4: Zúžit stavový automat**

`src/matches/stateMachine.ts` — celý soubor:
```ts
export type MatchState = "bezi" | "dohrano" | "zruseny";

export const MATCH_STATES: readonly MatchState[] = ["bezi", "dohrano", "zruseny"];

/**
 * Ze tří stavů nezbylo co zakazovat: hostovi po zrušení mezistavů žádný
 * přechod nepatří a Rob smí cokoliv, aby šlo překliknuté „Vyhrál tým 1“
 * vrátit. Jediné, co nedává smysl, je přechod na sebe sama.
 */
export function canTransition(from: MatchState, to: MatchState): boolean {
  return from !== to;
}

export class PrechodChyba extends Error {}

export function assertTransition(from: MatchState, to: MatchState): void {
  if (canTransition(from, to)) return;
  throw new PrechodChyba(`Zápas už ve stavu „${to}“ je, nic se nemění.`);
}
```

- [ ] **Step 5: Protáhnout zúžení databází a routami**

`src/db/matches.ts` — `setZapasStav` ztrácí parametr `actor` a zápis do `zacatek`; compare-and-swap zůstává:
```ts
export async function setZapasStav(zapasId: number, stav: MatchState): Promise<void> {
  const nacteny = await getZapas(zapasId);
  if (!nacteny) throw new Error(`Zápas ${zapasId} neexistuje.`);
  assertTransition(nacteny.zapas.stav, stav);

  const { rowCount } = await getPool().query(
    `UPDATE zapas SET stav = $2,
       konec = CASE WHEN $2 = 'dohrano' THEN now() ELSE NULL END
     WHERE id = $1 AND stav = $3`,
    [zapasId, stav, nacteny.zapas.stav],
  );
  if (!rowCount) {
    throw new PrechodChyba(
      `Stav zápasu ${zapasId} se mezitím změnil — někdo byl rychlejší. Načti si stránku znovu.`,
    );
  }
}
```

`src/http/routes/matches.ts`: `prejdi` ztrácí parametr `actor`, mizí import typu `Actor`; z routy `/lobby` mizí celý blok `if (zapas.stav === "vyhlaseny") { … setZapasStav … }` včetně `try/catch` na `PrechodChyba` (kontrola na `dohrano`/`zruseny` zůstává).

- [ ] **Step 6: Otevřít redakci**

`src/realtime/redakce.ts` — z `redigujProDivaka` pryč `.filter(...)`; zůstane jen `.map(redigujZapas…)`. Komentář o §7 nahradit vysvětlením, proč se filtr zrušil.

- [ ] **Step 7: Zjednodušit režii**

`Rezie.tsx`: z bloku `<div className="ovladani">` smazat tlačítka „Vyhlásit" a „Hraje se"; z hlavičky zápasu smazat `· {zapas.stav}`.

- [ ] **Step 8: Ověřit sady, build a mutační kontrolu**

```
npx tsc --noEmit && npm test && DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test" npm run test:db && npm --prefix web test && npm run build
```
Pak mutačně ověřit, že hranice, které měly zůstat, opravdu drží: dočasně vrátit do `redigujZapas` plný payload pro nezúčastněného a potvrdit, že `redakce.test.ts` spadne.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Cut the match down to running, played and cancelled"
```

---

### Task 4: Srovnat dokumentaci a ověřit naživo

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-03-aoe2-komunitni-hry-web-design.md` (odkaz na nahrazení §7)

- [ ] **Step 1: Projít README a opravit každou zmínku o zrušených stavech a o potvrzení hosta**

- [ ] **Step 2: Do staré specifikace doplnit u §7 poznámku, že ji nahrazuje spec z 5. 9. 2026**

- [ ] **Step 3: Přebuildovat, restartovat server na tunelové adrese a ověřit curlem**

Ověřit, že složený zápas vidí i nepřihlášený divák (bez hesla a bez odkazů) a že přihláška do běžící akce vrací 200.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Bring the docs in line with the smaller state machines"
```

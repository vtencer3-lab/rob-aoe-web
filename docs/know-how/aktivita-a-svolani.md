# Lhůta aktivity, „Jsem tu!“, zvonek a svolání

Přihláška do akce je slib „dnes hraju“. Kdo od počítače odejde, nesmí Robovi
zůstat v seznamu jako živý — z toho seznamu skládá zápasy. Proto má každá
přihláška **lhůtu**, po které hráč „usne“, a admin má nástroje, jak ho
vzbudit.

## Datový model

- `prihlaska.aktivni_do` (timestamptz) — dokud je v budoucnu, hráč je
  aktivní; `posledni_puls` — poslední projev života.
- Lhůta je **globální nastavení webu**: `nastaveni_webu.lhuta_aktivity_minut`
  (migrace `024_lhuta_globalni.sql`, jediný řádek `id = 1`, CHECK 2–120).
  Původně (migrace 021) byla sloupcem akce a nová akce ji dědila; uživatel ji
  chtěl vidět i mimo akci a mít ji přes akce stejnou, tak se z ní stalo jedno
  číslo pro celý web. Migrace převzala hodnotu z poslední akce.
- `prihlaska.svolan_v`, `svolal_hrac_id` (migrace 021, 023; sloupec se
  jmenoval `svolal_steam_id`, migrace 027 ho přejmenovala) — poslední
  svolání a kdo zvonil.

**Past v testech:** `TRUNCATE player, akce` globální lhůtu nevrátí; DB testy
ji v každém `beforeEach` nastavují zpět na 15, jinak hodnota z jednoho
souboru padá do dalšího.

## Server (`src/db/events.ts`)

- `signUp` — `INSERT … ON CONFLICT DO UPDATE`: plná lhůta od teď, `posledni_puls
  = NULL`, **a maže svolání** (`svolan_v = NULL`).
- `obnovAktivitu` („Jsem tu!“) — plná lhůta bez ohledu na to, jestli
  vypršela, `posledni_puls = now()`, a **také maže svolání** — svolání je tím
  vyřízené.
- `pulsAktivity` — puls z prohlížeče (hráč něco udělal): vypršelou lhůtu
  vrátí na plnou; běžící jen prodlouží o `PRODLOUZENI_MINUT = 5`, nejvýš
  jednou za `ODSTUP_PULSU_MINUT = 4` a nikdy nad plnou lhůtu od teď — jinak
  by se dala naklikat donekonečna. Vrací false, když se nic nezměnilo, ať se
  nerozesílá stav zbytečně.
- `setLhutaAktivity(minut)` — platí hned: bdícím hráčům se `aktivni_do`
  přepočítá od `COALESCE(posledni_puls, kdy)`, takže kdo mlčí déle než nová
  lhůta, usne teď.
- Všechny SQL berou lhůtu poddotazem `(SELECT lhuta_aktivity_minut FROM
  nastaveni_webu)`.

**Proč svolání mazat:** `svolan_v` se dřív nemazalo nikdy. Prohlížeč reaguje
na *změnu* času svolání u vlastní přihlášky; po odhlášení a novém přihlášení
se řádek „objevil“ se starým časem a hráč dostal okno „tě shání!“ při každém
přihlášení, i když nikdo nezvonil. Navíc prohlížeč mlčí ve snímku, kde se
vlastní přihláška teprve objevila (svolat jde jen přihlášeného, takže čas u
čerstvé přihlášky je vždy starý).

## Prahy (`src/shared/aktivita.ts`, sdílené server + prohlížeč)

```ts
AKTIVITA_MINUT = 15 (výchozí), LHUTA_MIN_MINUT = 2, LHUTA_MAX_MINUT = 120
jeAktivni(aktivniDo, ted)             // chybějící hodnota = aktivní (staré snímky, zkušební data)
zbyvaMs(aktivniDo, ted)               // záporné = spí
nabidnoutJsemTu(aktivniDo, ted, lhuta) // zbývá < lhůta − 1 min  → tlačítko „Jsem tu!“ u vlastního řádku
nabidnoutZvonek(aktivniDo, ted, lhuta) // zbývá ≤ lhůta − 5 min (ZVONEK_PO_MINUTACH), i spící → zvonek u cizího řádku
```

„Jsem tu!“ se nabízí minutu po začátku odpočtu, ne až po usnutí — kdo sedí u
počítače a vidí čas ubývat, si sáhne dřív, než ho seznam odsune. Prahy jsou
v jednom modulu, aby server (SQL super zvonku) i prohlížeč počítaly totéž.

## Tabulka: spící na konci

`podleAktivity(hraci, ted)` v `SeznamPrihlasenych.tsx` dá spící za všechny
aktivní (v obou skupinách zachová pořadí) — i při seřazeném seznamu v režii.
Spící řádek je ztlumený, má „Zzz“ a vykřičník s červenou září. Přechod
řádku dolů se animuje (viz `tabulka-prihlasenych.md`). Vlastní řádek ukazuje
odpočet (`MujCas`, číslice stejné šíře, ať se nepřelévá), admin ho vidí u všech.

## Zvonek a super zvonek

- **Zvonek** u cizího řádku (admin, ne u AI, ne u sebe), jen když
  `nabidnoutZvonek`; klik → `POST /api/akce/:id/hraci/:hracId/svolat` →
  `svolej` (`svolan_v = now()`, `svolal_hrac_id`). Po kliknutí chladne 5 s
  (`ZVONEK_CHLADNUTI_MS`, zašedlý, animace návratu), admin sám slyší poplach
  na 30 % Master Volume jako potvrzení. Zvonek se **nemění podle ničeho
  jiného** — dřívější „klik odečte 3 minuty“ uživatel zrušil.
- **Super zvonek** v hlavičce sloupce (dva zvonky, větší vzadu, menší
  vpředu se stínem): `POST /api/akce/:id/svolat-vsechny` → `svolejVsechny`:

  ```sql
  UPDATE prihlaska SET svolan_v = now(), svolal_hrac_id = $2
   WHERE akce_id = $1 AND stav = 'prihlasen' AND hrac_id <> $2
     AND aktivni_do <= now() + ((SELECT lhuta_aktivity_minut FROM nastaveni_webu) - $3) * interval '1 minute'
  ```
  Týž práh jako `nabidnoutZvonek` (včetně spících, admin sám ne). Ukáže se
  jen, když má koho svolat; chladne pod klíčem `*`. Hlavička sloupce musí
  být zarovnaná stejně jako buňky (na střed) — obecné pravidlo pro `th`
  ji dávalo doprava a zvonek byl 40 px vedle.

## Okno „X tě shání!“ (`web/src/views/Svolani.tsx`)

`App.tsx` porovnává `svolanV` u vlastní přihlášky mezi snímky stavu; změna →
`prehraj(poplachUrl, 100)` (vždy naplno, viz `zvuky.md`) a `alertdialog`
„{svolalJmeno} tě shání!“ s tlačítky **Jsem tu!** (→ `obnovAktivitu`) a
**Odhlásit se z akce**; klik mimo okno nezavře. Když prohlížeč poplach
zadržel (bez gesta), okno to napíše.

## Debug

- Pravé tlačítko na vlastním „Jsem tu!“ (zapnutý debug mód v patičce, i v
  pohledu uživatele) předvede svolání: zvuk naplno + totéž okno. Tlačítko
  „Jsem tu!“ je ale vidět jen v poslední minutě lhůty nebo ve spánku.
- Debug tlačítka u tabulky: zkušební hráči (`ZKUSEBNI_HRACI=true` na
  serveru), přetočení času o 15 / 1 min (`pretocCas` posune `aktivni_do`
  všem, ať jde spánek a zvonek vyzkoušet bez čekání).

## Přítomnost (`src/realtime/pritomnost.ts`)

Zavření **poslední karty** se počítá jako odhlášení z akce (ne z účtu).
Hlídá se podle SSE spojení, ne `beforeunload` (to se pouští i při obnovení
stránky). Odklad mezi zavřením a odhlášením musí přežít obnovení stránky.

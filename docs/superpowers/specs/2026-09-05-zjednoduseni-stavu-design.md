# Zjednodušení stavů akce a zápasu

Datum: 5. 9. 2026
Nahrazuje části návrhu [2026-09-03](2026-09-03-aoe2-komunitni-hry-web-design.md),
jmenovitě §7 (viditelnost sestavy) a stavový postup večerem.

## Proč

Web má dneska pět stavů akce (`priprava`, `prihlasovani`, `zavreno`, `bezi`,
`konec`) a šest stavů zápasu (`nachystany`, `vyhlaseny`, `lobby_otevrena`,
`hraje_se`, `dohrano`, `zruseny`). Ten postup je navržený pro turnaj o tuctu
zápasů. Rob takový provoz nemá — obvykle se hraje jeden zápas za večer.

Každý stav navíc je klik, na kterém se dá v přímém přenosu zaseknout. Při první
ostré zkoušce přes tunel se na tom zaseklo dvakrát po sobě: zápas zůstal
v `nachystany`, redakce ho ne-adminům nevydávala vůbec, a z pohledu režie to
vypadalo, že se aplikace chová nahodile — protože admin vidí i to, co nikdo jiný.
Ověřeno daty: na tomtéž stavu vracelo `/api/akce` adminovi jeden zápas a hráči
nula.

Cíl: **založit akci, naklikat lidi do zápasu, a tím to skončí.** Co se má komu
ukázat, ukáže se v ten okamžik.

## Rozhodnutí

1. **Akce má dva stavy:** běží a skončila. Zůstává jediné tlačítko „Ukončit
   akci". Přihlašování je otevřené po celou dobu, takže kdo dorazí pozdě, hlásí
   se i uprostřed večera.
2. **Zápas má tři stavy:** `bezi`, `dohrano`, `zruseny`. Že je lobby založená,
   se pozná podle toho, že existuje odkaz — není to samostatný stav.
3. **Potvrzení hosta se ruší celé.** Nic nezamykalo už od Tasku 17 (Spectate
   se řídí jen existencí odkazu) a vložení nového odkazu ho tiše odškrtávalo.
   Robovi zbývá lepší kontrola: vidí, že odkaz existuje, kdo na něj klikl, a
   hlavně si může dát Spectate a podívat se do lobby vlastníma očima.

## Co se mění

### 1. Datový model — migrace `004_min_stavu.sql`

Sloupce `stav` jsou prostý `TEXT` bez `CHECK`, takže migrace jen slévá hodnoty
a přepisuje `DEFAULT`. Celá běží v jedné transakci (`scripts/migrate.ts`).

```sql
UPDATE akce SET stav = 'bezi' WHERE stav <> 'konec';
ALTER TABLE akce ALTER COLUMN stav SET DEFAULT 'bezi';

UPDATE zapas SET stav = 'bezi' WHERE stav NOT IN ('dohrano', 'zruseny');
ALTER TABLE zapas ALTER COLUMN stav SET DEFAULT 'bezi';

ALTER TABLE zapas DROP COLUMN host_potvrdil;
ALTER TABLE zapas DROP COLUMN zacatek;
```

Index `jedna_aktivni_akce` z migrace 003 se **nemění** — stojí na
`stav <> 'konec'`, což po slití platí dál a invariant „nejvýš jedna otevřená
akce" zůstává vynucený databází.

`zacatek` padá proto, že ho nastavoval jedině přechod na `hraje_se`; bez něj by
zůstal navždy `NULL`. Kdy zápas vznikl, drží `vytvoren`. `konec` **zůstává** —
plní ho zápis výsledku a je to jediné časové razítko, které bude budoucí
statistika potřebovat.

### 2. Stavový automat (`src/matches/stateMachine.ts`)

`MatchState` se zúží na `"bezi" | "dohrano" | "zruseny"`. Hostovi po zrušení
přechodů `vyhlaseny → lobby_otevrena` a `lobby_otevrena → hraje_se` nezbyl
žádný, takže mizí `HOST_PRECHODY` i typ `Actor`; `canTransition` se scvrkne na
`from !== to`. `PrechodChyba` a podmíněný zápis stavu (compare-and-swap
v `setZapasStav`) **zůstávají** — dvojklik na „Vyhrál tým 1" musí dál vracet
srozumitelné 409, ne 500.

Admin smí přejít kamkoliv. Je to schválně: překliknuté „Vyhrál tým 1" jde tím
přes API vrátit, i když mu UI nabídne jen tři tlačítka.

Hostovi zbývá jediná pravomoc: vložit odkaz do lobby. `roleVZapase` tedy
zůstává, jen ji už nikdo nepoužije k rozhodnutí o přechodu.

Ze `setZapasStav` musí zmizet i zápis do `zacatek` — sloupec padá s migrací a
plnil ho jedině přechod na `hraje_se`. `konec` se v témž `UPDATE` píše dál.

### 3. Redakce (`src/realtime/redakce.ts`)

Padá filtr `zapas.stav !== "nachystany"`. Zápas je vidět od okamžiku složení.

**Zaslepení zůstává beze změny.** Nezúčastněný divák dál nedostane `heslo`,
`lobbyId`, `joinUri` ani `spectatorUri`; účastník nedostane `spectatorUri`.
To je bezpečnostní hranice, ne pohodlí, a tahle změna se jí nedotýká.

### 4. API

- `POST /api/akce/:id/stav` přijímá už jen `bezi` a `konec`.
- `POST /api/akce/:id/prihlaska` **musí povolit závoru.** Dnes odmítá 409
  „Přihlašování do téhle akce není otevřené", kdykoliv
  `akce.stav !== "prihlasovani"` — kdyby ten stav zmizel a podmínka zůstala,
  nepřihlásil by se do akce už nikdo nikdy. Nově stačí, že akce existuje a je
  ta aktivní; `getAktivniAkce` skončené sama nevrací, takže „hlásit se lze" a
  „akce běží" splývají v jedno.
- `POST /api/zapas/:id/stav` přijímá už jen `bezi`, `dohrano`, `zruseny`.
- `POST /api/zapas/:id/potvrzeni` **se ruší** i s `setHostPotvrdil` a
  `zrusHostPotvrdil`.
- `POST /api/zapas/:id/lobby` přestane posouvat stav (posouval `vyhlaseny →
  lobby_otevrena`); nadále jen uloží číslo lobby. Odmítnutí odkazu pro
  `dohrano`/`zruseny` zůstává.
- `hostPotvrdil` mizí z `ZapasView`.

### 5. UI

**`SpravaAkce`** — mizí `KROKY` i `POPIS_STAVU`. Když akce neběží, ukáže se
formulář na založení; když běží, jen její název a „Ukončit akci" s potvrzením
(to je nevratné, potvrzení zůstává). Řádek „Stav akce: …" mizí — ze dvou stavů,
z nichž jeden znamená „akce tu není", neinformuje.

**`App`** — přihlašovací tlačítko přestane viset na `akce.stav ===
"prihlasovani"`. `getAktivniAkce` vrací jen akci, která neskončila, takže
existující akce už sama o sobě znamená „hlásit se lze".

**`Rezie`** — z pěti tlačítek zápasu zůstanou tři: „Vyhrál tým 1", „Vyhrál tým
2", „Zrušit". Mizí „Vyhlásit", „Hraje se" i řádek „Host zatím nepotvrdil
nastavení". Hlavička přestane vypisovat název stavu.

**`ObrazovkaHosta`** — mizí tlačítko „Sedí to — jsme nachystaní" i hláška
„Potvrzeno. Rob se může dívat."

### 6. Testy

Padnou testy na zrušené přechody, na `nachystany` v redakci a na potvrzení
hosta. Přibydou:

- hermetický: `canTransition` dovolí adminovi cokoliv mezi třemi stavy a
  odmítne přechod na sebe sama;
- databázový: složený zápas dostane `bezi` a `redigujProDivaka` ho vydá
  i ne-adminovi — to je jádro téhle změny;
- databázový: migrace 004 slije `nachystany`/`vyhlaseny`/`lobby_otevrena`/
  `hraje_se` na `bezi` a nechá `dohrano`/`zruseny` být;
- databázový: přihlásit se do běžící akce jde kdykoliv, i když už jsou zápasy
  složené — hlídá to povolenou závoru, na které jinak celá aplikace stojí.

**Musí zůstat zelené beze změny** (kontrola, že se při mazání neustřelilo):
zaslepení hesla a odkazů pro nezúčastněného, `requireAdmin` na mutujících
routách, invariant jedné otevřené akce, compare-and-swap ve `setZapasStav`.

## Co se nemění

Přihlašování přes Steam, role admina (`player.je_admin`), skládání sestav
(`assignSeats`, barvy, týmy, výběr hosta podle odehraných her), odvození obou
odkazů z jednoho čísla lobby, SSE s celým stavem na jednom kanálu, záchranné
dotazování, zkušební dveře.

## Co se tím vědomě ztrácí

- **Skládání dvojic přestane být tajné.** Specifikace §7 říkala „Rob složil
  sestavu, nikdo to ještě nevidí", aby se dvojice daly vyhlašovat naživo na
  streamu. Nově se sestava objeví lidem na obrazovce v ten okamžik, kdy ji Rob
  naklikne.
- **Lobby vědomě neodklikne nikdo kromě Roba.** Že je Veřejná, má Allow
  Spectators a správné týmy, zjistí až Robovým Spectate.

Obojí je vědomá volba zadavatele, ne přehlédnutí.

## Mimo rozsah

Statistika účasti a výher („kdo kolikrát hrál a kolikrát vyhrál v jakém
režimu") je samostatná funkce na později. Tahle změna pro ni jen **nesmí
zahodit data**, na kterých bude stát: `zapas.format`, `zapas.vitezny_tym`,
`zapas.konec`, `zapas.vytvoren` a tabulka `ucastnik` zůstávají celé.

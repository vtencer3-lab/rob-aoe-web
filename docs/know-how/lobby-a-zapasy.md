# Lobby a zápasy

## Jedna číslice, dva odkazy (`src/aoe/lobbyUri.ts`)

`aoe2de://0/<id>` připojí do lobby jako hráče, `aoe2de://1/<id>` do téže
lobby jako diváka. **Ukládá se jen `<id>`** (`zapas.lobby_id`), oba odkazy se
z něj odvozují (`joinUri`, `spectatorUri`). `parseJoinUri` odmítne divácký
odkaz (`divacky_odkaz`) — host by ho vložil omylem a nikdo by se nepřipojil.
Nikdy neukládat sestavené URI.

## Hledání lobby v seznamu hry

Hra má veřejný seznam otevřených lobby (Worlds Edge; klíče nastavení a
stránkování jsou zmapované v
[`../analyza-automaticke-hledani-lobby.md`](../analyza-automaticke-hledani-lobby.md)).
`src/matches/hledaniLobby.ts` — `najdiLobby(ucastnici, inzeraty)`: název
ani heslo nejsou podmínkou (hosté si je nastaví jinak), rozhodují **hráči
webu v lobby** (`hracId`, od 16. 9. 2026 přeložení z `profile_id` přes
`player.we_profil_id` — funguje pro Steam i Microsoft hráče stejně, viz
`docs/prehled-praci-a-zameru.md` §3.57), od nejjistějšího: host zápasu ji
hostuje, host v ní sedí, hostuje ji jiný účastník, sedí v ní jiný účastník.
Seznam je jeden pro
všechny zápasy (~100 kB), dotazy se sdružují. Web si lobby hledá sám
(`HledaniLobby`, hostovi rychleji po kliknutí na „Spustit hru“), fáze
`lobby` / `hraje_se` se drží v paměti serveru (`realtime/fazeLobby.ts`,
„hraje se“ až po několika nepřítomnostech v seznamu za sebou).

## Kontrola lobby (`src/shared/lobbyKontrola.ts`, `views/KontrolaLobby.tsx`)

`POST /api/zapas/:id/kontrola-lobby` najde lobby a porovná ji se sestavou a
očekávaným nastavením zápasu. Výsledek je seznam řádků `{ klic, stav, text,
sekce }` ve **čtyřech stavech**: `ok` (zelená fajfka), `spatne` (červený
křížek), `varovani` (žlutá, heslo), `jedno` (šedé „–“, admin nastavil „je to
jedno“); sekce `prelobby` / `hlavni` / `dalsi`. Rob to čte v přenosu, proto
věty, ne tabulka hodnot. Lobby je „v pořádku“ = nikde nic červeného.
Kontrola se opakuje sama každých 5 s, dokud se v lobby sedí.

**Poslední známé nastavení (migrace 025):** každá úspěšná kontrola se uloží
k zápasu (`zapas.posledni_kontrola` JSONB + čas). Když lobby ze seznamu
zmizí (hra běží), route přibalí `posledni` a komponenta ukáže sbalenou sekci
**„Nastavení hry — poslední známé, z HH:MM“** se stejnými třemi podsekcemi.
Kontrola proběhne jednou i mimo automatický režim hned po připojení
komponenty — jinak by po obnovení stránky sekce chyběla (stav žije na
serveru, ne v komponentě).

**Sbalování s animací (`Skladaci`):** `<details>` prohlížeč umí jen skokem.
Klik na `<summary>` se zachytí: při otevření se `open` nastaví hned a tělo
dojede z nuly na `scrollHeight` (Web Animations, `SKLADANI_MS = 280`,
+ opacity); při zavření tělo napřed sjede na nulu a `open` se odebere až
po dojetí. V jsdom (bez `animate`) a při `prefers-reduced-motion` se jen
přepne. Každá podsekce si pamatuje sbalení v localStorage
(`kontrola.sekce.*`), stav sdílí živá kontrola i „Nastavení hry“.

## Úprava založeného zápasu jako návrh (`views/EditaceZapasu.tsx`)

Nastavení lobby, jméno lobby a sestava jsou **per zápas** (obtisk nastavení
akce při založení, `zapas.nastaveni`; starší zápasy bez obtisku berou živé
nastavení akce). Okno pracuje s `navrh`: platný návrh se propíše sám po
`ODKLAD_PROPISU_MS = 1 200` ms klidu, zavření (Uložit vlevo dole, nebo klik
vedle) ho propíše hned. `chybyNavrhu` kontroluje **jen sestavu**
(`zkontrolujSestavu`; Players v Pre-Lobby je jen počet slotů, AI obtížnost
není povinná) a zvýrazní hráče se stejnou barvou v různých týmech. Neplatný
návrh okno nepustí; křížek nabídne „Chcete zahodit všechny změny?“ (Ano vrátí
stav z otevření). Jméno lobby z Pre-Lobby se ukládá hned a do zahození
nespadá.

## Heslo večera

Jedno heslo pro všechny lobby akce (`akce.pristi_heslo`, generuje
`generatePassword` v `src/matches/composition.ts` už při založení akce).
Okno Pre-Lobby ho ukazuje k opsání do hry, kostka u hesla vygeneruje nové
(`POST /api/akce/:id/pristi-heslo`). Heslo i číslo lobby jsou tajemství —
SSE kanál je jeden pro celou akci, redakce podle diváka
(`redigujProDivaka`) je zaslepí těsně před odesláním.

## Mazání akce bez výsledku

`POST /api/akce/:id/stav` s `konec` po změně stavu zavolá
`smazAkciBezVysledku`: `DELETE FROM akce WHERE id = $1 AND NOT EXISTS (SELECT
1 FROM zapas WHERE akce_id = $1 AND stav = 'dohrano' AND vitez IS NOT NULL)`.
Prázdné akce, akce jen se zrušenými a na přání uživatele i s rozehranými
zápasy nemají výpovědní hodnotu; přihlášky, zápasy, chat i události jdou
s ní (`ON DELETE CASCADE` od migrace 001). Nevratné. Jen jedna akce smí být
otevřená (migrace 003, unikátní index) — bez toho se odběratelé SSE staré
akce zasekli.

## Výběr mapy s minimapami (`views/VyberMapy.tsx`)

Mřížka náhledů map s hledáním (pravý klik do pole maže text), 8 map vedle
sebe, pevná velikost při filtrování, výška podle obrazovky. Náhledy vznikají
skriptem `nastroje/grafika/mapy_nahledy.py`: hra má ikony v
`resources/_common/wpfg/resources/mapicons/` (předpony `rm_`, `rwm_`, `sm_`,
`br_`), web zná mapy podle id z jazykového souboru (`src/shared/mapy.ts`),
skript páruje název na soubor (normalizace + přibližná shoda + ruční
`RUCNE`) a ukládá `web/src/assets/mapy/<id>.webp` (192 px). Náhledy se
donačítají až po načtení stránky (`web/src/mapyNahledy.ts`), nespárovaná
mapa má zástupný obrázek.

## Karty a obrazovky

- `ObrazovkaHosta` (host): kroky Zakládáš! → Kontrola lobby → Výborně; okno
  Create Lobby k opsání; „(Lobby zakládáš ručně)“.
- `KartaHrace` (účastník): barva a tým velkým písmem, „Připojuješ se!“ s
  tlačítkem do hry, heslo, kontrola lobby, strany zápasu s VS
  (`StranyZapasu.tsx`, vždy vedle sebe — `flex: 1 1 0`, sloupce
  `minmax(0, 1fr)`, jen pod 40 rem pod sebou).
- `Rezie` (admin): sestava, Spectate, kontrola, výsledek, chat s push-to-talk.

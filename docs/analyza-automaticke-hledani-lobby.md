# Analýza: může web najít lobby sám, bez vkládání odkazu?

*Stav k 7. 9. 2026. Zdroje jsou uvedené na konci; co je ověřené naživo, je tak označené.*

## Odpověď zkrátka

**Ano, jde to.** Oficiální backend hry (Worlds Edge, stejný, ze kterého web už
bere ELO) má veřejný, nepřihlášený endpoint se seznamem všech otevřených
lobby. Vrací pro každou lobby její číslo, název, Steam ID hosta, jestli má
heslo, jestli povoluje diváky a kdo v ní právě sedí. Web přitom hostovi sám
předepisuje název lobby (`ROB-01`) a zná jeho Steam ID, takže má dva
nezávislé klíče, podle kterých svoji lobby v seznamu pozná.

Ruční krok „host klikne Copy a vloží odkaz“ se tím dá nahradit: web se po
složení zápasu každých pár vteřin podívá do seznamu, a jakmile se tam objeví
lobby s hostovým Steam ID, uloží si její číslo a všem naskočí odkazy stejně,
jako by je host vložil. Ruční vložení zůstane jako záloha.

Navíc to přinese něco, co dnes web neumí: **kontrolu lobby před startem**.
Ze stejné odpovědi se pozná, jestli host zapomněl heslo nebo diváky, a kdo se
už opravdu připojil (ne jen kdo klikl na odkaz).

**Ověřeno 7. 9. 2026:** založená lobby dala v odkazu `aoe2de://0/504953429`
a v seznamu byla tatáž lobby s `id: 504953429`, hostem `/steam/76561198014056480`,
`isobservable: 1`. Číslo ze seznamu je přesně číslo z odkazu. Implementováno
ve verzi 0.4.0 jako tlačítko „Vyhledat hru“ (`POST /api/zapas/:id/hledat-lobby`);
hledá se podle Steam ID hosta a účastníků, název lobby ani heslo nerozhodují.

---

## 1. Co endpoint vrací (ověřeno naživo 7. 9. 2026)

```
GET https://aoe-api.worldsedgelink.com/community/advertisement/findAdvertisements?title=age2
```

Bez klíče, bez přihlášení, HTTP 200, odpověď kolem 125 kB. V okamžiku sondy
(neděle ráno) 55 otevřených lobby. Struktura:

```json
{
  "result": { "code": 0, "message": "SUCCESS" },
  "matches": [ { …lobby… }, … ],
  "avatars": [ { "profile_id": 19819620, "name": "/steam/76561198068499427", "alias": "…", "country": "cn", … }, … ]
}
```

Pole jedné lobby v `matches`:

| Pole | Význam | K čemu nám je |
|---|---|---|
| `id` | číslo lobby (advertisement id), např. `504951855` | **velmi pravděpodobně přesně to číslo z `aoe2de://0/<id>`** |
| `steamlobbyid` | Steam lobby id | druhá cesta dovnitř: `steam://joinlobby/813780/<steamlobbyid>/<hostSteamId>` |
| `host_profile_id` | Worlds Edge profil hosta | přes `avatars` se převede na `/steam/<steamId64>` |
| `description` | název lobby přesně tak, jak ho host napsal | shoda s `nazev_lobby` (`ROB-01`) |
| `passwordprotected` | 0/1 | kontrola, že host nastavil heslo |
| `isobservable`, `observernum`, `observermax`, `hasobserverpassword` | diváci | kontrola, že je zaškrtnuté Allow Spectators, tedy že se Rob dostane dovnitř |
| `matchmembers[]` | `{ profile_id, teamid, civilization_id, … }` | kdo v lobby opravdu sedí |
| `slotinfo` | base64+zlib JSON se sloty (tým, připravenost) | rozestavení, kdyby bylo potřeba |
| `options` | base64+zlib nastavení hry | mapa, rychlost, typ hry |
| `state`, `visible`, `maxplayers`, `mapname`, `relayserver_region` | stav a metadata | filtrování |

Všech 55 lobby v sondě mělo `state: 0` a `visible: 1`, tj. seznam ukazuje
**otevřené veřejné lobby před startem**. To je přesně okno, ve kterém se
odkaz potřebuje získat; jakmile hra začne, lobby ze seznamu zmizí, ale číslo
už web má uložené a Spectate funguje i za běhu (ověřeno 4. 9. 2026).

U každé lobby se host podařilo dohledat v `avatars` (55 z 55), takže převod
na Steam ID je spolehlivý.

## 2. Jak by to ve webu fungovalo

Nic se nemění na tom, na čem web stojí: ukládá se jen číslo lobby, oba odkazy
se z něj odvozují. Mění se jen to, **odkud číslo přijde**.

1. Rob složí zápas. Host dostane obrazovku jako dnes, ale místo pole na odkaz
   vidí „Založ lobby podle obrázku, web si ji najde sám.“ Pole na ruční
   vložení zůstane sbalené níž jako záloha.
2. Server od té chvíle každých ~10 s zavolá `findAdvertisements` (jen dokud
   existuje běžící zápas bez `lobby_id`; jinak se neptá vůbec).
3. V odpovědi hledá lobby, jejíž host má Steam ID hosta zápasu. Jako druhý
   klíč se porovná `description` s `nazev_lobby`; shoda obojího = jistota,
   shoda jen hosta = taky bereme, ale v režii se ukáže varování „lobby se
   jmenuje jinak“.
4. Nalezené `id` se uloží přes existující `setLobbyId()` a zavolá se
   `broadcastAkce()`. Od té chvíle je všechno jako dnes: hráči mají odkaz,
   Rob Spectate.
5. Dokud lobby v seznamu je, server z ní každý cyklus přebírá kontrolní
   informace do stavu akce: heslo ano/ne, diváci ano/ne, kdo sedí uvnitř.
   Režie tak před startem vidí zelené/červené fajfky místo dnešního „klikl
   na připojení“, které jen říká, že hráč klikl.

Změny v kódu (odhad jeden den práce včetně testů):

| Kde | Co |
|---|---|
| `src/external/worldsEdgeLobby.ts` | klient + čistý parser odpovědi (fixtura z živé sondy), stejný styl jako `worldsEdge.ts` |
| `src/matches/hledaniLobby.ts` | smyčka: dokud je zápas `bezi` bez `lobby_id`, ptát se; při nálezu `setLobbyId` + broadcast |
| `src/db/matches.ts`, migrace 007 | volitelně sloupce pro kontrolní stav lobby (`ma_heslo`, `povoluje_divaky`, `v_lobby_od`) nebo jen držet v paměti a posílat v payloadu |
| `src/shared/types.ts` | rozšíření `ZapasView` o kontrolní stav a seznam připojených |
| `web/src/views/ObrazovkaHosta.tsx` | „hledám tvoji lobby“ místo pole, pole jako záloha |
| `web/src/views/Rezie.tsx` | fajfky heslo / diváci / připojení |

Ruční cesta (`POST /api/zapas/:id/lobby`) zůstane beze změny.

## 3. Co je potřeba ověřit před implementací

**Rovnost čísel.** Že `id` z `findAdvertisements` je totéž číslo jako v odkazu
z tlačítka Copy. Důkazy pro: (a) aoe2.net, který ze stejného backendu
stavěl svůj prohlížeč lobby, používal `aoe2de://1/<match_id>` pro Spectate;
(b) fórum AoE popisuje schéma jako `aoe2de://<režim>/<match ID>`, kde match
ID je identifikátor zápasu z herního backendu; (c) čísla z odkazů v návrhu
(`234230181`, září 2026) a z dnešní sondy (`504 584 778` až `504 951 855`)
jsou ze stejné řady. Důkaz proti: žádný, ale ani přímý.

Ověření: host založí lobby, klikne Copy, a číslo z odkazu se porovná s `id`
lobby, u které je v `avatars` jeho Steam ID. Dá se udělat na příštím večeru
nebo kdykoliv s jedním účtem.

Kdyby se čísla lišila, zůstává druhá cesta přes `steamlobbyid`:
`steam://joinlobby/813780/<steamlobbyid>/<hostSteamId>` otevře lobby přes
Steam (tenhle tvar používají existující webové prohlížeče lobby). Nevýhoda:
neexistuje k němu divácká varianta, Spectate by pak potřeboval `aoe2de://1/`
a tím i to původní číslo. Takže pro Roba je rovnost čísel důležitá, pro
hráče ne.

## 4. Rizika a omezení

- **Nezdokumentovaný endpoint.** Stejné riziko, jaké web už nese u žebříčku;
  design s tím počítá (sekce 9 a 10 návrhu). Když endpoint zmizí, web se
  vrátí k ručnímu vkládání, které zůstane v kódu. Nesmí to být jediná cesta.
- **Neznámý limit dotazů.** Sonda proběhla bez omezení, ale nikdo neručí za
  víc. Návrh se ptá jen v okně mezi složením zápasu a založením lobby
  (minuty za večer), v intervalu 10 s, s jedním dotazem pro všechny zápasy
  najednou. To je řádově méně než jeden otevřený herní klient s lobby
  prohlížečem.
- **Jen veřejné lobby.** Seznam obsahuje jen `visible: 1`. Robovy lobby musí
  být veřejné tak jako tak (jinak nejde zapnout diváky), takže to nic nemění.
- **Velikost odpovědi.** Kolem 125 kB na dotaz při 55 lobby; ve špičce může
  být několikanásobná. Parsovat se má jen `matches` a `avatars`, `slotinfo`
  a `options` dekódovat až u nalezené lobby.
- **Zpoždění.** Lobby se v seznamu objeví do několika vteřin po založení;
  s intervalem 10 s je odkaz u hráčů do zhruba 15 s. Dnes to trvá tak dlouho,
  jak dlouho hostovi trvá odkaz zkopírovat a vložit.
- **Dva hosté se stejným jménem lobby.** Nemůže se stát: primární klíč je
  Steam ID hosta, název je jen kontrola.
- **Host založil lobby dřív, než Rob složil zápas.** Nevadí, seznam ji
  obsahuje, dokud je otevřená. První cyklus po složení ji najde.
- **Verze z Microsoft Store.** Steam ID by v `avatars` bylo `/xboxlive/…`;
  hráč bez Steamu se ale na web ani nepřihlásí, takže totéž omezení jako dnes.

## 5. Co se tím získá navíc

Dnes web ví jen to, že hráč klikl na odkaz. Se seznamem lobby by režie před
startem viděla skutečnost:

- **heslo nastavené** (`passwordprotected`),
- **diváci povolení** (`isobservable`), tedy že se Rob dostane dovnitř, což
  je dnes nejčastější důvod, proč Spectate selže,
- **kdo sedí v lobby** (`matchmembers` → Steam ID → jméno), tedy kdo ještě
  chybí, bez dotazování na streamu,
- volitelně rozestavení týmů ze `slotinfo`, tj. jestli si hráči nastavili
  barvu a tým podle karty.

To je větší přínos než samotné ušetření jednoho Ctrl+V. Doporučení: dělat
obojí najednou, v jednom kroku, protože stojí na stejném dotazu.

## Zdroje

- Živá sonda endpointu 7. 9. 2026 (55 lobby, struktura výše).
- Existující klient žebříčku ve webu: `src/external/worldsEdge.ts` (stejný backend).
- Prohlížeče lobby třetích stran postavené nad tímto backendem, resp. nad
  aoe2.net, který ho zrcadlil: [AoE2 Insights – Lobby Browser](https://www.aoe2insights.com/lobbies/),
  [AOE2Lobby](https://aoe2lobby.com/lobby), [musavvirn/Lobby (GitHub)](https://github.com/musavvirn/Lobby)
  (používá `steam://joinlobby/813780/<steam lobby id>`).
- Schéma `aoe2de://<režim>/<match id>`: [fórum AoE, „URL Scheme to launch the game and spectate a match“](https://forums.ageofempires.com/t/url-scheme-to-launch-the-game-and-spectate-a-match/88216).
- Spectate z aoe2.net: [AoEZone, „AoE2.net Spectate button no longer working“](https://aoezone.net/threads/resolved-aoe2-net-spectate-button-no-longer-working-someone-please-help-me.178544/).
- Návrh webu, sekce 3.1 a 3.4: `docs/superpowers/specs/2026-09-03-aoe2-komunitni-hry-web-design.md`.


## 6. Zmapované klíče nastavení lobby (7. 9. 2026)

Zmapováno naživo s dvouhrannou lobby: každá položka se ve hře přepnula a
porovnal se seznam lobby před a po. Endpoint vrací **nejvýš 100 lobby na
stránku** (nejnovější první), starší jsou na `start=100`, `start=200`, …;
web proto stahuje všechny stránky.

| Nastavení | Klíč v `options` | Hodnoty |
|---|---|---|
| Civilization Set | `101` | 0 All, 1 Age of Empires II, 2 Chronicles |
| Game Mode | `5` | 0 Random Map, 1 Regicide, 2 Death Match, 3 Scenario, 5 King of the Hill, 6 Wonder Race, 7 Defend the Wonder, 8 Turbo Random Map, 10 Capture the Relic, 11 Sudden Death, 12 Battle Royale, 13 Empire Wars — podle herního `OptionsGameMode` (Control API hry), ověřeno 9. 9. 2026 dvěma nezávislými zdroji a živým seznamem lobby. **Do 9. 9. 2026 tu byla tabulka z aoe2.net, která od čtyřky výš seděla o jedna vedle** (4 byla „King of the Hill“ místo 5, „Capture the Relic“ posílalo 8 = Turbo Random Map) a režimy 1, 11, 12, 13 neznala vůbec |
| Location (mapa) | `10` | id řetězce z jazykového souboru hry, viz `src/shared/mapy.ts` |
| Map Size | `8` | dílce: 120 Tiny, 144 Small, 168 Medium, 200 Normal, 220 Large, 240 Giant, 480 Ludicrous (120 a 480 ověřené naživo 9. 9. 2026) |
| AI Difficulty | `61` | 4 Easiest, 3 Standard, 2 Moderate, 1 Hard, 0 Hardest, **−1 Extreme** (ne 5, jak tu stálo do 9. 9. 2026 — ověřeno naživo 9. 9. 2026, kdy lobby s Extreme poslala `-1`; dřív ověřeno 3 a 1) |
| Resources | `37` | 0 Standard, 1 Low, 2 Medium, 3 High, 4 Ultra High, 5 Infinite, 6 Random (ověřeno 0 a 3) |
| Population | `28` | jen z herní nabídky: po 25 do 250, pak 300, 400, 500 (odečteno z herní nabídky 9. 9. 2026) |
| Game Speed | `41` | 1 Slow, 2 Normal, 3 Fast |
| Reveal Map | `82` | 0 Normal, 1 Explored, 2 All Visible (ověřeno; „No Fog“ jako 3 tu stálo do 9. 9. 2026, hra ho nezná) |
| Starting Age | `0` | 0 Standard, 2 Dark, 3 Feudal, 4 Castle, 5 Imperial, 6 Post-Imperial (ověřeno 0, 3, 6) |
| Ending Age | `4` | 0 Standard, 2 Dark, 3 Feudal, 4 Castle, 5 Imperial (ověřeno 0 a 4) |
| Treaty Length | `57` | minuty, ale jen z herní nabídky: 0 „[None]“, pak po pěti až 60, a rovnou 90 (odečteno z herní nabídky 9. 9. 2026) |
| Victory | `81` | 1 Conquest, 7 Time Limit, 8 Score, 9 Standard, 11 Last Man Standing (ověřeno 1 a 9) |
| Lock Teams | `66` | y/n (ověřeno naživo 9. 9. 2026 přepnutím tam a zpět) |
| Team Together | `78` | y/n |
| Team Positions | `77` | y/n (jen s Team Together) |
| Shared Exploration | `76` | y/n |
| Lock Speed | `65` | y/n |
| Allow Cheats | `1` | y/n |
| Turbo Mode | `79` | y/n |
| Full Tech Tree | `62` | y/n |
| Empire Wars | `89` | y/n; v režimu Empire Wars (`5` = 13) hra zaškrtávátko odškrtne a zamkne — panel to zrcadlí |
| Sudden Death | `90` | y/n |
| Regicide | `91` | y/n |
| Antiquity Mode | `100` | y/n (Chronicles ho zapíná) |
| Record Game | `75` | y/n |
| Handicap | — | do seznamu se nepropisuje vůbec |

Sloty hráčů (`slotinfo`, metadata slotu): `ScenarioPlayerIndex` 0–7 = barva
1–8 (−1 = random), `Team` 1 = „–“, 2–5 = tým 1–4, 6 = „?“. Pole `teamID`
slotu se plní nespolehlivě, kontrola ho nepoužívá.

**Sloty AI** (ověřeno naživo 9. 9. 2026 na vlastní lobby): počítač má
`profileInfo.id` = −1 stejně jako prázdný slot, pozná se až podle
`status` — **0 sedí člověk, 1 slot je prázdný, 2 sedí AI** — a podle toho,
že má vyplněná `metaData` (prázdný slot má `"AA=="`). Barva, tým i
civilizace se z nich čtou stejně jako u člověka; klíč `1` je herní id
civilizace, hodnota s nastaveným horním slovem (65537 = 0x10001) znamená
náhodnou volbu. Vzájemně se AI rozlišit nedají — žádné id nemají.

**Pre-lobby (okno „Create Lobby“) v inzerátu.** Nastavení ze zakládání lobby
neleží v `options`, ale přímo v inzerátu vedle jména. Změřeno naživo
9. 9. 2026 na lobby se zpožděním diváků 3 minuty:

| Volba v okně | Pole inzerátu | Poznámka |
|---|---|---|
| Lobby Name | `description` | |
| Lobby Type | `matchtype_id` | Unranked = 0 |
| Visibility | `visible` | Public = 1 |
| Players | `maxplayers` | 2–8 |
| Set Password | `passwordprotected` | 0/1, samotné heslo se neposílá |
| Allow Spectators | `isobservable` | |
| Spectator Delay | `observerdelay` | **v sekundách** (3 minuty = 180) |
| Server | `relayserver_region` | „Default“ se propíše na skutečný region |
| Hide Civilizations | `options[85]` | 1 = zapnuto |
| Co-Op Campaign, Data Mod | — | neposílají se nikam |

`options[96]` **není** Hide Civilizations, jak to 9. 9. 2026 chvíli vypadalo:
je to duplikát `passwordprotected` z inzerátu (y = lobby má heslo). Ověřeno
statistikou přes 112 otevřených lobby, kde se obojí shoduje na 100 %.
Zmatek vznikl tím, že se mezi dvěma měřeními změnilo Hide Civilizations
i heslo naráz — dvě samostatné volby, které se hnuly zároveň. Kdyby `96`
byl obrácený `85`, nemohla by existovat kombinace `85=0` a `96=n`, která
je přitom v seznamu nejčastější (90 ze 114 lobby).

`Server` = „Default“ se v inzerátu objeví jako skutečný region (u nás
`westeurope`), takže „Default“ se proti lobby porovnat nedá — ověřit jde jen
konkrétní region.

**Kvalita spojení na servery** (herní tabulka Connection Quality z Robova
připojení, 9. 9. 2026, v ms): westeurope 32, ukwest 43, eastus 118,
southcentralus 137, centralindia 145, westus3 156, southeastasia 177 (zelené);
brazilsouth 216, chilecentral 225, koreacentral 240 (žluté);
australiasoutheast 313 (červený). Je to všech 11 regionů z nabídky —
zbylé dvě položky (`Default`, `Use Local Lan Server`) regiony nejsou.

Nabídka okna (odečteno z hry 9. 9. 2026): Lobby Type Unranked / Ranked 1v1
Death Match / Ranked Team Death Match; Visibility Public / Private (Private
zakáže diváky); Players 2–8; Spectator Delay None / 1 / 2 / 3 / 4 / 5 / 10
minut; Server Default a 12 regionů plus „Use Local Lan Server“; Data Mod
jen „Definitive Set“.

**Panel hry se umí rozejít s tím, co hra posílá.** 9. 9. 2026 hlásila
kontrola „Lock Teams: vypnuto, má být zapnuto“, zatímco v herním panelu
bylo políčko zaškrtnuté. Inzerát měl pravdu: přepnutí Game Mode Lock Teams
vnitřně shodilo (jako ostatní modifikátory), ale zaškrtnutí v UI zůstalo.
Odškrtnutí a zaškrtnutí ve hře stav srovnalo a `66` se do inzerátu propsalo
okamžitě — zpoždění tam žádné není, každá změna zaškrtávátka odchází hned.

Pro kontrolu z toho plyne, že **ukazuje skutečný stav lobby, ne to, co je
nakreslené v panelu hry** — a že takový rozpor umí odhalit. Hlášku proto
brát vážně i tehdy, když se zdá, že v panelu je všechno správně; pomůže
volbu ve hře přepnout tam a zpět.

**Typ AI se nepropisuje.** Hra nabízí „AI“, „AI (CD version)“ a „AI (HD
version)“; v lobby vypadají všechny tři úplně stejně (`status` 2, tatáž
`metaData`), takže druh počítače z dat poznat nejde — kontrole to nevadí,
bere všechny tři jako AI. Slot „Closed“ se od volného slotu taky nijak
neliší (`status` 1), což nevadí: zajímají nás jen obsazené. Ověřeno
naživo 9. 9. 2026 na lobby se všemi třemi druhy naráz.

**Režim s vlastním zaškrtávátkem.** Empire Wars (`5` = 13), Regicide
(`5` = 1) a Sudden Death (`5` = 11) mají v Advanced Settings i zaškrtávátko
(`89`, `91`, `90`). V takovém režimu ho hra odškrtne a znepřístupní — režim
ho už obsahuje. Ověřeno naživo 9. 9. 2026 u všech tří.

**Co režim přepne** (ověřeno naživo 9. 9. 2026, měřeno rozdílem snímků
`options` před a po přepnutí):

| Režim | Co udělá |
|---|---|
| Empire Wars (13) | `Starting Age` (`0`) na Feudal (3), `Victory` (`81`) na Standard (9) |
| Sudden Death (11) | `Victory` (`81`) na Conquest (1) |
| všechny tři | odškrtne modifikátory: Allow Cheats (`1`), Turbo (`79`), Full Tech Tree (`62`), Empire Wars (`89`), Sudden Death (`90`), Regicide (`91`) |

Antiquity (`100`) zůstává vždycky, jak bylo. Zamčené je jen zaškrtávátko
toho režimu, s ostatními jde dál hýbat. **Neověřeno:** jestli modifikátory
shazuje i přepnutí na obyčejný režim (Random Map, Death Match) — u
Regicide se to odvozuje z chování zbylých dvou, přímo změřené to není.

Čísla číselníků (režimy, obtížnost AI, věky, suroviny, odkrytí, vítězství,
velikosti map) jsou od 9. 9. 2026 z herního `Options*` v Control API hry —
`OptionsGameMode`, `OptionsAIDifficulty` a spol. Dřív pocházela z aoe2.net
a část z nich seděla vedle. **Pozor:** `OptionsLocation` z téhož zdroje se
pro mapy použít nedá — lobby v `options[10]` posílá id řetězce
z jazykového souboru (Arabia = 10875), ne interní číslo mapy (Arabia = 9).

Web klíče čte v `nastaveniZOptions` (`src/external/worldsEdgeLobby.ts`) a
porovnává v `zkontrolujLobby` (`src/shared/lobbyKontrola.ts`): mapa, velikost,
rychlost, populace, victory a cheaty patří do hlavní sekce kontroly, zbytek do
„Dalšího nastavení“, které verdikt „lobby v pořádku“ neovlivňuje.

**Past se stránkováním (7. 9. 2026):** seznam občas lobby na jedno stažení
vynechá — když mezi stažením první a druhé stránky nějaká novější lobby
zanikne, starší se posunou o jednu nahoru a jedna propadne mezi stránkami.
Sledování fáze proto prohlásí „hraje_se“ až po třech nepřítomnostech za sebou
(`src/realtime/fazeLobby.ts`), návrat do „lobby“ je okamžitý.

Přímo v záznamu lobby: `visible`, `maxplayers`, `passwordprotected`,
`isobservable`, `observerdelay`, `hasobserverpassword`, `relayserver_region`
(Server), `matchtype_id`. Data Mod a Hide Civilizations se nastavují jen při
založení lobby a zatím zmapované nejsou.

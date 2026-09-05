# Web pro komunitní hry Robdiesalot (AoE2 DE) — návrh

Datum: 2026-09-03

> **Částečně nahrazeno.** Stavový automat zápasu (§7) a stavový postup večerem
> platí jen do 5. 9. 2026. Pět stavů akce se zúžilo na dva, šest stavů zápasu na
> tři a viditelnost sestavy se otevřela hned po složení. Viz
> [2026-09-05-zjednoduseni-stavu-design.md](2026-09-05-zjednoduseni-stavu-design.md).
> Zbytek dokumentu platí beze změny.

## 1. Proč to vzniká

Robdiesalot pořádá při streamu komunitní custom hry v Age of Empires II: Definitive
Edition. Dnes se to celé odbývá na Discordu a bolí to na třech místech:

1. Lidé se hlásí ručně do Discordu a k tomu vypisují jméno ve hře, 1v1 ELO a
   odehrané hodiny. Údaje si píšou sami, takže sedí, jak komu vyhovuje.
2. Založení custom lobby lidé pravidelně pokazí — špatné nastavení, špatné týmy,
   špatné barvy.
3. Rob se na hry dívá a komentuje je. Pokud lobby nemá domluvené jméno, nenajde ji
   a nedostane se do spectate.

Web má tyhle tři věci vyřešit: přihlašování s ověřenými údaji, jednoznačné pokyny
k nastavení lobby, a hlavně **spolehlivé tlačítko Spectate pro Roba**.

## 2. Rozsah

**Součástí je:**

- Přihlášení účastníků přes Steam.
- Automatické stažení jména ve hře, 1v1 ELO a odehraných hodin.
- Živý seznam přihlášených během streamu.
- Robův panel pro skládání dvojic a čtveřic.
- Automatické přidělení týmů a barev, generování názvu lobby a hesla.
- Osobní pokyny pro každého účastníka a kontrolní obrazovka pro hosta.
- Odkazy na připojení do hry a na spectate pro Roba.
- Záznam výsledků.

**Součástí není:**

- Automatické zakládání lobby za člověka. Vyžadovalo by to desktopovou aplikaci
  u každého účastníka (viz sekce 3.4).
- Vlastní ELO, žebříčky, turnajové pavouky.
- Podpora jiných her než AoE2 DE.
- Podpora jiných formátů než 1v1 a Coop Kings 2v2. Další se přidají, až budou.

## 3. Zjištěná fakta o AoE2 DE

Tahle sekce je výsledek průzkumu a je pro projekt zásadní. Bez ní návrh nedává smysl.

### 3.1 Odkazy do hry

AoE2 DE má vlastní protokol. Ve hře je v lobby tlačítko „Copy", které zkopíruje
odkaz ve tvaru:

```
aoe2de://0/234230181
```

Číslo za lomítkem je identifikátor lobby. **První číslo je režim připojení:**

| Odkaz | Význam |
|---|---|
| `aoe2de://0/<id>` | připojit se jako hráč |
| `aoe2de://1/<id>` | připojit se jako **divák** |

Ověřeno ve zdrojových kódech Empire League, soubor `src/tournament-spectator.mjs`
(MIT licence):

```js
export function tournamentSpectatorUri(lobbyUri) {
  const match = /^aoe2de:\/\/0\/(\d+)$/.exec(lobbyUri ?? "");
  return match ? `aoe2de://1/${match[1]}` : null;
}
```

Empire League spectate odkaz používá i u zápasů ve stavu „probíhá", takže se jím
jde napojit i na rozehranou hru. Odkazy zpracovává `Tools_Builds\AOEURLHelper.exe`,
který je součástí instalace hry a registruje protokol `aoe2de://` v systému.

**Ověřeno na živé hře (2026-09-04):** oba odkazy fungují — divák se připojí jak do
otevřené lobby před startem, tak do už běžící hry. Divák v lobby navíc vidí
rozestavení hráčů, takže pořadatel může špatně nastavenou lobby zarazit před
startem.

**Známá omezení:**

- Je hlášeno, že URL helper funguje spolehlivě jen tehdy, když hráč v dané
  herní relaci už byl v lobby prohlížeči. Empire League tenhle problém obchází tak,
  že před otevřením spectate odkazu **násilně ukončí běžící proces hry** a nechá
  helper spustit čistou instanci.
- Chování na verzi z Microsoft Store / Xbox aplikace není ověřené a není jak ho
  otestovat (nikdo z týmu tu verzi nemá).

### 3.2 Podmínky pro diváky

Aby se Rob do hry dostal, musí platit všechno tohle najednou:

1. **Lobby je veřejná.** AoE2 povolí „Allow Spectators" jen u veřejných lobby.
   Empire League to má výslovně zdokumentované a proto turnajové zápasy hostuje
   veřejně, ne privátně.
2. **Lobby má heslo**, aby dovnitř nelezli náhodní lidé. Divákovi se heslo nezadává.
3. **Host zaškrtl „Allow Spectators".**

Bez bodu 3 se Rob nedostane dovnitř ani odkazem.

### 3.3 Statistiky hráčů

Oficiální backend žebříčků AoE2 DE (Worlds Edge / Relic) odpovídá na dotaz podle
Steam ID. Ověřeno naživo 2026-09-03:

```
GET https://aoe-api.worldsedgelink.com/community/leaderboard/getPersonalStat
      ?title=age2&profile_names=["/steam/<steamid64>"]
```

Z odpovědi se použije:

| Pole | K čemu |
|---|---|
| `alias` | jméno ve hře — přesně to, které se hráči zobrazí v lobby |
| `rating` u `leaderboard_id: 3` | 1v1 ELO (žebříček `SOLO_RM_RANKED`) |
| `highestrating` | nejvyšší dosažené 1v1 ELO |
| `wins` + `losses` | počet odehraných ranked her |
| `lastmatchdate` | jestli hráč vůbec ještě hraje |
| `country` | vlajka u jména |

Endpoint umí hledat i podle přesného `alias`. To je náhradní cesta pro hráče,
kteří se nepřihlásí přes Steam — Steam i Xbox hráči jsou v jednom společném
žebříčku. Seznam žebříčků vrací
`/community/leaderboard/getAvailableLeaderboards?title=age2`.

**Endpoint je nezdokumentovaný.** Je to backend, na kterém stojí oficiální
žebříčky, ne veřejné API se závazky. Může se kdykoliv změnit. Návrh s tím počítá
(sekce 9 a 10).

Odehrané hodiny tenhle endpoint nezná. Berou se ze Steam Web API:

```
GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/
      ?key=<klíč>&steamid=<steamid64>&appids_filter[0]=813780
```

Pole `playtime_forever` je v minutách. Vyžaduje bezplatný Steam Web API klíč a
hráč musí mít v profilu **veřejné herní detaily**. Tohle nebylo otestováno —
klíč zatím neexistuje.

### 3.4 Proč se lobby nezakládá automaticky

Hra nemá API pro zakládání lobby, nemá parametry příkazové řádky pro hostování a
nemá soubor s předvolbami nastavení. Jediná fungující cesta je automatizace
uživatelského rozhraní: posílání zpráv Win32 (`WM_LBUTTONDOWN`, `WM_CHAR`) do okna
hry na souřadnice přepočtené z návrhového prostoru 3840×2160, s ověřováním pixelů
mezi kroky. Empire League to má popsané jako 21 kroků pro hosta a 11 pro
připojujícího se hráče, a souřadnicový soubor je svázaný s konkrétním buildem hry.

Zavrženo ze dvou důvodů: rozbije se to při každém větším UI patchi hry, a hlavně
by si desktopovou aplikaci musel nainstalovat **každý účastník**. To je větší
překážka, než je Discord, od kterého se odchází.

## 4. Zvolený přístup

Čistá webová aplikace. Nikdo si nic neinstaluje. V celém řetězci je právě jeden
manuální krok: **host po založení lobby klikne ve hře „Copy" a vloží odkaz na web.**
Od té chvíle má web identifikátor lobby a odvodí si z něj jak odkaz pro hráče, tak
odkaz pro Roba.

Uvažovaná a zavržená alternativa: drobná aplikace v liště jen pro Roba, která by
zavřela běžící hru, spustila `AOEURLHelper.exe` se spectate odkazem a nahodila
CaptureAge. Řešila by hlášenou nespolehlivost protokolu z prohlížeče. **Odloženo
do druhé fáze** — instalovala by si ji jen jedna osoba, takže to nezpůsobí problém
s přijetím, ale nemá smysl to stavět dřív, než se ukáže, jestli je to potřeba.

## 5. Architektura

**Jeden Node proces plus Postgres.** Ne serverless. Realtime provoz vyžaduje
dlouhoběžící spojení; na serverless by to znamenalo externí službu navíc a řešení
rozpadu stavu mezi instancemi. Jeden proces to má jako frontu v paměti.

Vedlejší, ale podstatný důsledek: prostředí na vývojářově PC a v ostrém provozu
má stejný tvar, takže přesun na VPS není migrace.

**Technologie:**

| Vrstva | Volba | Proč |
|---|---|---|
| Jazyk | TypeScript | typy na hranicích externích API, kde se nejvíc chybuje |
| Backend | Fastify | jeden proces obsluhuje API, SSE i statické soubory; žádná magie kolem streamování |
| Frontend | React + Vite | sestaví se do statických souborů, které servíruje Fastify |
| Databáze | PostgreSQL | |
| Migrace | číslované SQL soubory (`001_*.sql`) | čitelné, bez ORM navíc |
| Realtime | Server-Sent Events | provoz je jednosměrný; SSE jede přes běžné HTTP a samo se připojuje zpět |

**Realtime posílá celý stav zápasu, ne přírůstky.** Zpráv je za večer pár desítek,
takže úspornost nemá cenu řešit, a obnova po výpadku spojení je pak triviální:
přijde další zpráva a klient je synchronizovaný. Přes Cloudflare Tunnel je nutné
poslat hlavičky `Cache-Control: no-cache` a `X-Accel-Buffering: no`, jinak proxy
události zadržuje.

**Veškerý stav je v Postgresu**, včetně relací. Když proces spadne uprostřed
vysílání, po restartu se večer vrátí do stejného bodu a prohlížeče se samy
připojí zpátky. U aplikace běžící na domácím počítači to není luxus.

### Členění

| Modul | Zodpovídá za | Nezná |
|---|---|---|
| `auth` | Steam OpenID, relace, kdo je admin | zápasy |
| `players` | profily, stažené statistiky, stárnutí cache | losování |
| `event` | otevírání a zavírání přihlašování | podobu lobby |
| `matches` | stavový automat, přidělení týmů a barev | zobrazení |
| `aoe` | odvození a validace odkazů | HTTP, databázi |
| `realtime` | rozesílání stavu do prohlížečů | proč se stav změnil |

Modul `aoe` je záměrně čistá funkce bez závislostí. Je to jádro celého projektu a
musí jít otestovat bez databáze i bez sítě.

## 6. Datový model

**`player`** — klíčem je Steam ID64.

| Sloupec | Poznámka |
|---|---|
| `steam_id` | primární klíč |
| `alias` | jméno ve hře z Worlds Edge |
| `steam_name`, `avatar_url`, `country` | ze Steamu / Worlds Edge |
| `elo_1v1`, `elo_nejvyssi`, `odehrano_her`, `posledni_zapas` | z Worlds Edge |
| `steam_hodiny` | ze Steam Web API; `NULL` znamená „nezveřejněno" |
| `staty_stazeny_v`, `staty_chyba` | aby web vždy věděl, jak čerstvá data ukazuje |
| `je_admin` | Robův účet |

**`akce`** — jeden herní večer. Název, formát, stav
(`priprava` → `prihlasovani` → `zavreno` → `bezi` → `konec`).

**`prihlaska`** — akce + hráč, unikátní dvojice. Stav `prihlasen` / `odhlasen`.

**`zapas`** — akce, pořadové číslo, formát, stav, host, `nazev_lobby`, `heslo`,
`lobby_id`, časy, vítězný tým.

**`ucastnik`** — zápas + hráč, k tomu `tym`, `barva`, `je_host`.

**`udalost`** — append-only log: co se stalo, kdy, kdo to udělal. Když se během
vysílání někdo dohaduje, kdo co odklikl, je tohle jediná věc, která to rozsoudí.

Dvě rozhodnutí, na kterých záleží:

**Ukládá se jen `lobby_id`, tedy holé číslo.** Ani join odkaz, ani spectate odkaz.
Oba se odvozují při zobrazení. Kdyby se ukládaly, dřív nebo později se rozejdou —
a to je přesně ta třída chyb, kvůli které projekt vzniká.

**Účastník má vlastní barvu, ne slot.** Coop Kings znamená, že dva lidé mají
stejnou barvu, a tím sdílí civilizaci:

| Formát | Účastníci |
|---|---|
| `1v1` | A: tým 1, barva 1 (modrá) · B: tým 2, barva 2 (červená) |
| `coop_kings_2v2` | A, B: tým 1, barva 1 (modrá) · C, D: tým 2, barva 2 (červená) |

Stejná barva = sdílená civilizace. Model to říká sám a nejde to zapsat špatně.

## 7. Stavový automat zápasu

| Stav | Znamená | Kdo posune dál |
|---|---|---|
| `nachystany` | Rob složil sestavu, nikdo to ještě nevidí | Rob |
| `vyhlaseny` | Účastníci vidí pokyny, host má kontrolní obrazovku | host |
| `lobby_otevrena` | Host vložil odkaz, web má `lobby_id` | host, Rob |
| `hraje_se` | Hra běží | Rob |
| `dohrano` | Zapsaný vítěz | — |
| `zruseny` | Někdo nedorazil nebo technický problém | Rob |

Rob smí kterýkoliv přechod přeskočit nebo vrátit. Host smí jen ty svoje. Jde o to,
aby Rob nebyl úzké hrdlo u každé maličkosti, ale mohl cokoliv přebít, když se to
v přímém přenosu zasekne.

## 8. Obrazovky

Tři pohledy na tentýž zápas, každý s jiným úkolem.

**Hráč** — dominuje barva a tým („MODRÁ / tým 1"), pod tím s kým sdílí civilizaci a
tlačítko Připojit. Nic k odškrtávání: web nevidí do hry, takže by odškrtnutí bylo
jen čestné prohlášení a budilo by dojem kontroly, která neexistuje. Dole záložní
cesta — název lobby k vyhledání ve hře, heslo, číslo lobby.

**Host** — potvrzení, že lobby stojí a nastavení sedí, zrcadlo cílového rozestavení
lobby (kdo má mít jakou barvu a tým), a jedno tlačítko **„Sedí to — jsme
nachystaní"**. Tohle je jediné místo v systému, kde někdo lobby opravdu zkontroluje.
Kontroluje ji člověk, který na ni kouká, a je to nejzkušenější z účastníků.

**Rob (režie)** — účastníci se stavem, ELO, a tlačítko Spectate, které naskočí,
jakmile host vloží odkaz. Nečeká se na jeho potvrzení: ověřeno na živé lobby, že
se divák připojí i před startem hry, takže Rob vidí rozestavení a může špatně
nastavenou lobby zavčas zarazit — zamykat mu to by ho blokovalo přesně tam, kde
je nejužitečnější. Potvrzení hosta se vedle toho zobrazuje jako stav, ne jako
zámek. Trvale viditelné jsou název lobby,
heslo a číslo lobby, aby se Rob dostal dovnitř i tehdy, když technika zlobí.

Stav účastníka u Roba se pojmenuje **„klikl na připojení"**, ne „je v lobby". Web
ví jen to, že člověk klikl na odkaz — ne že skutečně dorazil. Nepřesné
pojmenování by Roba na streamu dostalo do sporu s realitou.

**Konvence:**

- Název lobby: `ROB-<pořadové číslo>`, např. `ROB-07`. Krátký, bez diakritiky.
  Není to kosmetika — přesně tohle Rob napíše do vyhledávání, když odkaz selže.
- Heslo: 8 znaků z abecedy `abcdefghjkmnpqrstuvwxyz23456789` (bez znaků, které si
  lidé pletou).
- Host se navrhne automaticky jako účastník s nejvíc odehranými hrami. Rob to může
  přepsat. Hostuje ten, kdo to nejmíň pravděpodobně pokazí.

## 9. Externí integrace

| Služba | K čemu | Jak často |
|---|---|---|
| Steam OpenID 2.0 | přihlášení, získání Steam ID64 | při přihlášení |
| Worlds Edge `getPersonalStat` | alias, ELO, odehrané hry | při přihlášení, pak nejvýš 1× za 15 minut na hráče |
| Steam Web API `GetOwnedGames` | odehrané hodiny | stejně |
| Steam Web API `GetPlayerSummaries` | avatar, přezdívka | stejně |

Statistiky se cachují v tabulce `player`, nesahá se na ně při každém zobrazení.
Worlds Edge endpoint je nezdokumentovaný a bez známých limitů, takže se k němu
aplikace chová zdrženlivě.

**Selhání kteréhokoliv z těchto volání nesmí zablokovat přihlášení.** Člověk se
přihlásí i bez statistik; doplní se při dalším pokusu.

## 10. Chybové stavy

| Situace | Chování |
|---|---|
| Host vloží nesmysl místo odkazu | validace `^aoe2de://0/\d+$` s konkrétní hláškou |
| Host vloží omylem spectate odkaz (`://1/`) | pozná se a řekne se mu to jmenovitě |
| Host se odmlčí | Rob přehodí hostování; staré `lobby_id` se zahodí, aby se nikdo nepřipojoval do mrtvé lobby |
| Hráč nedorazí | Rob ho vymění nebo zápas zruší; barvy a týmy se přepočítají |
| Odkaz `aoe2de://` nezabere | záložní cesta je trvale na obrazovce (název lobby, heslo, číslo) — jediné opatření proti neotestovatelné Xbox verzi |
| Worlds Edge spadne nebo změní formát | zobrazí se poslední stažené hodnoty s časem stažení |
| Skrytý Steam profil | „hodiny nezveřejněny", ne prázdno a ne nula |
| Steam přihlašování mimo provoz | nový se nepřihlásí, existující relace dohrají večer |
| Rob obnoví stránku nebo otevře dvě záložky | bez následku, pravda je v databázi |
| Rob nalosuje mezitím odhlášeného hráče | vytvoření zápasu je jedna transakce, která to odmítne |
| Spadne proces | stav je v Postgresu, po restartu se večer obnoví |

## 11. Testování

Testuje se to, kde se dá udělat tichá chyba:

- **Modul `aoe`** — odvození spectate odkazu, validace, odmítnutí nesmyslů. Čistá
  funkce bez databáze a sítě.
- **Přidělování barev a týmů** — že dvojice v Coop Kings dostane vždy stejnou barvu
  a soupeři různé týmy, pro oba formáty.
- **Stavový automat** — povolené přechody a oprávnění; zvlášť to, že host nesmí do
  Robových přechodů.
- **Externí API** — testy jedou z uložených odpovědí, nikdy nesahají na síť.
  Včetně případů „API spadlo" a „skrytý profil", protože právě ty v praxi nastanou.

## 12. Nasazení

**Pilot:** na vývojářově PC za Cloudflare Tunnelem. Ne port forwarding — tunel
neukazuje domácí IP adresu stovce lidí během živého vysílání, dá HTTPS zadarmo a
funguje i za CGNAT a s dynamickou IP. Postgres zůstává na `localhost`, tunel míří
výhradně na port aplikace.

**Ostrý provoz:** malý VPS (~4 € měsíčně), až se ukáže, že se to bude používat
pravidelně. Ne kvůli výkonu, ale aby akce nezávisela na tom, jestli je něčí
počítač zapnutý.

Základní URL, na kterou se Steam po přihlášení vrací, jde z proměnné prostředí.
Adresa se během života projektu změní minimálně dvakrát.

Hygiena i na pilotu, protože se přihlašují skuteční lidé se svými účty: relační
cookie `HttpOnly` a `Secure`, Steam API klíč mimo git, v databázi nic citlivějšího
než Steam ID a veřejné statistiky.

## 13. Krok nula, ještě před psaním kódu

**Ověřit rukama s Robem, že ty odkazy fungují.** Celý projekt na tom stojí, zatím
je to ověřené jen ze zdrojových kódů Empire League, a známe dvě díry: hlášenou
nespolehlivost URL helperu a neznámé chování Xbox verze.

Postup, zabere to asi dvacet minut:

1. Založit veřejnou lobby s heslem a zapnutým „Allow Spectators".
2. Zkopírovat odkaz tlačítkem „Copy".
3. U druhého člověka ho otevřít z prohlížeče a ověřit, že se připojí.
4. Robovi dát `aoe2de://1/<stejné číslo>` a ověřit, že se dostane do spectate.
5. Zkusit to samé v okamžiku, kdy už hra běží.

**Kdyby krok 4 nebo 5 nefungoval, mění se návrh** — proto se dělá dřív, než kolem
toho vznikne webová aplikace.

## 14. Otevřené otázky

| Otázka | Kdy se rozhodne |
|---|---|
| ~~Funguje spectate odkaz na Robově stroji?~~ | **zodpovězeno 2026-09-04: ano, před startem i za běhu hry** |
| Funguje cokoliv z toho na verzi z Microsoft Store? | až se objeví někdo, kdo ji má; zatím kryje záložní cesta |
| Doména pro pilot | před prvním ostrým večerem |
| Chce Rob veřejnou stránku „co se právě hraje" pro diváky? | po prvním večeru |
| Ukládat výsledky dlouhodobě a stavět z nich statistiky? | mimo rozsah první verze |

## Zdroje

- Empire League (MIT), zdrojové kódy: https://github.com/ForgeableSum/empire-league
  — zejména `src/tournament-spectator.mjs`, `docs/aoe2-ui-automation.md`,
  `src/main/ipc/gameHandlers.ts`
- Empire League, popis projektu: https://empireleague.gg/
- Worlds Edge leaderboard backend: `https://aoe-api.worldsedgelink.com/community/leaderboard/`
- Hlášená nespolehlivost URL helperu: https://forums.ageofempires.com/t/url-helper-crashes-game/231094
- Připojení podle čísla lobby: https://steamcommunity.com/app/813780/discussions/0/3385031179212298821/
- Parser záznamů zápasů: https://github.com/aoe2ct/aoe2rec

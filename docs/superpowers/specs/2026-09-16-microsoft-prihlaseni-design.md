# Přihlášení Microsoft účtem (hráči z Microsoft Store a Game Passu)

Návrh z 16. 9. 2026. Výchozí stav: `dev` 1.7.5.

## 1. Zadání

Do komunitních večerů se dnes dostane jen ten, kdo má hru na Steamu — přihlášení
stojí na Steam OpenID a `player.steam_id` je primární klíč celého webu. Kdo má
AoE2 DE z Microsoft Store nebo přes PC Game Pass, se na web nepřihlásí vůbec.

Cíl: **Microsoft hráč má fungovat úplně stejně jako Steam hráč.** Přihlásit se,
mít jméno a avatar, být v tabulce přihlášených, mít ELO a žebříčky, být vidět
v lobby, dostat instrukce, chatovat a hostovat zápas. Žádná druhá kategorie
uživatele.

Rozsah **nezahrnuje**: slučování Steam a Microsoft účtu jednoho člověka (model
to umožní, obrazovka pro to ne), PlayStation hráče, změnu záložní cesty
(název lobby + heslo + číslo zůstává, jak je).

## 2. Co je ověřené

Sondy na živé Worlds Edge API 16. 9. 2026 z autorova stroje.

### 2.1 Xbox hráči v seznamu lobby

Jedna stránka `findAdvertisements` (271 profilů v `avatars`):

| platforma v `name` | počet |
|---|---|
| `/steam/<steamid64>` | 229 |
| `/xboxlive/<40 hex znaků>` | 24 |
| `/playstation/<…>` | 18 |

**Identifikátor u `/xboxlive/` není XUID**, ale 40 znaků hexa — hash, který
z Microsoft přihlášení nedostaneme ani ho neumíme spočítat. Tohle je hlavní
překážka celého úkolu a řeší ji sekce 5.

### 2.2 Statistiky Xbox hráče jdou stáhnout

`getPersonalStat?title=age2&…` odpovědělo plnými daty (ELO, žebříčky, výhry,
země) na všechny tři tvary dotazu:

| parametr | stav |
|---|---|
| `profile_names=["/xboxlive/<hash>"]` | ověřeno |
| `aliases=["<alias>"]` | ověřeno — a v odpovědi vrátí i `name` a `profile_id` |
| `profile_ids=[<číslo>]` | ověřeno |

Dotaz podle aliasu je ta spojka, která celý návrh drží: z herního jména
dostaneme kanonický profil.

### 2.3 Živá sonda přihlášení (16. 9. 2026)

Registrace v Microsoft Entra (`Personal Microsoft accounts only`) + jedno
skutečné přihlášení autora. **Celý řetěz prošel.**

| co | výsledek |
|---|---|
| `XboxLive.signin` naší registraci | **povolen** — souhlasná obrazovka oprávnění nabídla a token se vrátil se `scope=XboxLive.signin` |
| XBL `user/authenticate` s `RpsTicket: d=…` | HTTP 200, vrátil user token |
| XSTS pro `http://xboxlive.com` | HTTP 200, `DisplayClaims.xui[0]` obsahuje **`gtg`** (gamertag), **`xid`** (XUID), `uhs`, `agg`, `usr`, `utr`, `prv`, `ugc` |
| gamerpic přes `profile.xboxlive.com` | HTTP 200, `GameDisplayPicRaw` vrátil adresu na `images-eds-ssl.xboxlive.com` |
| `titlehub` herní historie | HTTP 200, 127 titulů |
| **AoE2 DE v historii** | `titleId` **`2064168993`**, `name` `Age of Empires II: Definitive Edition`, `titleHistory.lastTimePlayed` vyplněné |
| Worlds Edge podle gamertagu | HTTP 200, našel profil `/xboxlive/<40 hex>` s `alias` **shodným s gamertagem** |

**Klíčové potvrzení:** `alias` Xbox profilu ve hře **je** gamertag. Na tom
stojí celá sekce 5.1 a byl to největší nepodložený předpoklad návrhu.

#### Dvě věci, které sonda ukázala navíc

**`titlehub` vidí i hru hranou přes Steam.** Autor hraje ze Steamu, a přesto
má AoE2 DE v historii Xboxu — hra se totiž k Xbox Live přihlašuje bez ohledu
na to, odkud je nainstalovaná. Ikona vlastnictví (sekce 6.2) tedy znamená
„tenhle Microsoft účet tu hru hrál", což je přesně to, co má znamenat, a
u hráče z Game Passu to platí stejně.

**Jeden člověk může mít dva herní profily.** Steamový a xboxový vedle sebe,
každý s vlastním ELO a vlastní historií. Autorův `/xboxlive/` profil má
`xp: 1`, `level: 1` — vznikl jen tím, že se hra k Xbox Live přihlásila, a
je prakticky prázdný. **Důsledek pro návrh:** kdo má hru na Steamu a přihlásí
se Microsoftem, dostane svůj prázdný profil místo skutečného. Řeší to text
u tlačítka (sekce 8) a sekce 9 níž.

### 2.4 Co ověřené pořád není

| co | jak se to ověří |
|---|---|
| Funguje `aoe2de://` na verzi z Microsoft Store? | tester, příloha B |
| Chování `titlehub` při skrytém soukromí herní historie | tester (na minutu si přepne nastavení soukromí) |
| Sedí gamertag s aliasem i u hráče, který hru **má** z Game Passu? | tester — u účtu s prázdným profilem to sedělo, u skutečného hráče to chce potvrdit |

## 3. Identita a datový model

### 3.1 Proč se musí přejmenovat klíč

Microsoft hráč žádné Steam ID nemá. Dokud je `player.steam_id` primární klíč
a cíl cizích klíčů v šesti tabulkách, nedá se takový hráč do databáze vůbec
zapsat. Klíč hráče proto musí přestat být identifikátorem platformy.

Zvolený model (varianta „neutrální klíč, sloupec na platformu“) zároveň
umožňuje, aby jeden člověk měl obě identity — to se teď nevyužije, ale nic
se tím nezavírá.

### 3.2 Migrace `027_microsoft_ucet.sql`

```sql
-- Klíč hráče přestává být Steam ID. Hodnota se u stávajících řádků nemění,
-- takže se nesahá na data ani na cizí klíče — mění se jen jméno sloupce.
ALTER TABLE player    RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE session   RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE prihlaska RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE prihlaska RENAME COLUMN svolal_steam_id TO svolal_hrac_id;
ALTER TABLE ucastnik  RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE zprava    RENAME COLUMN steam_id TO hrac_id;
-- udalost.kdo se nejmenuje steam_id, mění se jen cíl reference (automaticky)

ALTER TABLE player ADD COLUMN platforma TEXT NOT NULL DEFAULT 'steam'
  CHECK (platforma IN ('steam', 'xbox'));
ALTER TABLE player ADD COLUMN steam_id      TEXT UNIQUE;
ALTER TABLE player ADD COLUMN xbox_xuid     TEXT UNIQUE;
ALTER TABLE player ADD COLUMN xbox_gamertag TEXT;
ALTER TABLE player ADD COLUMN we_profil     TEXT;
ALTER TABLE player ADD COLUMN we_profil_id  INTEGER UNIQUE;

UPDATE player SET steam_id = hrac_id;   -- dosavadní hráči jsou všichni ze Steamu
```

Tvar hodnoty `hrac_id`:

| platforma | hodnota | poznámka |
|---|---|---|
| Steam | `76561198014056480` | beze změny, 17 číslic |
| Microsoft | `xbox:2535412345678901` | prefix `xbox:` + XUID |

Rozlišitelné regulárem, takže `ADMIN_STEAM_ID` může obsahovat obojí a
v Coolify se u tří aplikací nemusí nic přenastavovat. Proměnná si jméno
nechá — přejmenovat ji je riziko (viz komentář u `zkontrolujProstredi`:
chybějící hodnota tiše odebere Robovi admina), zisk žádný. V README
a `.env.example` se dopíše, že bere i `xbox:<xuid>`.

`we_profil_id` je **číselný profil ve Worlds Edge a platí pro obě platformy.**
Steam hráčům se doplní sám při nejbližší obnově statistik, žádná migrace dat.
Sekce 7 na něm staví rozpoznání v lobby.

### 3.3 Přejmenování v kódu

`steamId` → `hracId` napříč repem (939 výskytů) jedním skriptem ve
scratchpadu, podle §7 „Poučení“ v přehledu prací. Vlastní commit, nulová
změna chování, zelené testy jako důkaz.

`steamId` **zůstane** tam, kde opravdu jde o Steam: `src/external/steam.ts`,
`src/auth/steamOpenId.ts`, sloupec `player.steam_id`.

Hodnota `zapas.vitez` ve tvaru `hrac:<steam_id>` (migrace 007) se nemění —
uvnitř je `hrac_id`, které si u Steam hráčů hodnotu nechává.

## 4. Přihlašovací tok

Nové routy vedle stávajících Steam rout, stejná cookie, stejné sezení.

```
GET /api/auth/microsoft
  → 302 login.microsoftonline.com/consumers/oauth2/v2.0/authorize
      client_id, response_type=code, redirect_uri=<BASE_URL>/api/auth/microsoft/return,
      scope=XboxLive.signin, state=<náhoda>, code_challenge=<S256>, code_challenge_method=S256

GET /api/auth/microsoft/return
  1. state z krátkodobé cookie == state v dotazu, jinak 401
  2. POST .../consumers/oauth2/v2.0/token   → access_token
  3. POST user.auth.xboxlive.com/user/authenticate
       RelyingParty "http://auth.xboxlive.com", RpsTicket "d=" + access_token
       → uzivatelskyToken, uhs
  4. POST xsts.auth.xboxlive.com/xsts/authorize
       RelyingParty "http://xboxlive.com", SandboxId "RETAIL", UserTokens [uzivatelskyToken]
       → xstsToken, DisplayClaims.xui[0] = { uhs, xid, gtg }
  5. upsertHrac("xbox:" + xid, platforma "xbox", gamertag gtg)
  6. mimo přihlašovací cestu: gamerpic (5.3), titlehub (6.2), herní profil (5.1)
  7. cookie se sezením → 302 na domovskou cestu
```

**Prefix `d=` u `RpsTicket` je povinný** pro vlastní Azure registraci (bez něj
Xbox ticket odmítne). Je to jediné místo, kde se náš tok liší od oficiálního.

**Microsoft tokeny se neukládají.** Jakmile máme XUID a gamertag, jsou
k ničemu — proto se nežádá ani `offline_access`. XSTS token žije jen po dobu
obsluhy návratu, dokud doběhnou dotazy z kroku 6.

Krok 6 nesmí přihlášení zdržet ani shodit: běží stejným způsobem jako dnešní
`deps.obnovStaty` — `void Promise.resolve().then(…).catch(() => {})`. Když
kterýkoliv selže, hráč je přihlášený a chybí mu jen ta jedna věc.

Známé chybové kódy XSTS, které se musí přeložit do češtiny:

| kód | význam | hláška |
|---|---|---|
| 2148916233 | účet nemá Xbox profil | „Tenhle Microsoft účet nemá Xbox profil. Založ si ho na xbox.com a zkus to znovu.“ |
| 2148916238 | dětský účet bez rodiny | „Dětský účet se musí nejdřív přidat do rodiny na Xboxu.“ |

## 5. Herní profil a statistiky

### 5.1 Dohledání profilu

Po přihlášení `getPersonalStat?title=age2&aliases=["<gamertag>"]`.

**Přijmout jen výsledek, jehož `name` začíná `/xboxlive/`.** Bez té kontroly
by Microsoft hráč dostal statistiky Steam hráče, který má shodou okolností
stejnou přezdívku — žebříček je pro obě platformy společný.

Uloží se `we_profil` (`/xboxlive/<hash>`) a `we_profil_id`.

### 5.2 Obnova statistik

Od druhého dotazu dál se používá `profile_ids=[we_profil_id]`, ne alias.
Profil je stabilní, alias si hráč může ve hře změnit. Stejná patnáctiminutová
cache jako dnes, stejné místo v kódu (`src/players/refresh.ts`).

Steam hráčům se `we_profil_id` doplní z odpovědi, kterou už dnes dostávají —
žádný dotaz navíc.

Když se profil nenajde: hráč je přihlášený a plnohodnotný, jen bez ELO.
`staty_chyba` dostane text, který karta hráče ukáže („herní profil se
nepodařilo dohledat podle jména“), a zkusí se to znovu při dalším načtení.
Co s hráčem, kterému se nenajde nikdy, řeší příloha A.

### 5.3 Avatar

Při přihlášení, dokud XSTS token žije:

```
GET profile.xboxlive.com/users/xuid(<xid>)/profile/settings?settings=GameDisplayPicRaw
    Authorization: XBL3.0 x=<uhs>;<xstsToken>
    x-xbl-contract-version: 3
```

Vrácená adresa gamerpicu se uloží do `avatar_url` — dál se s ní zachází
přesně jako se Steam avatarem, frontend nic nepozná. Když dotaz selže nebo
adresu nevrátí, zůstane `avatar_url` prázdné a použije se výchozí erb; na
přihlášení to nemá vliv.

## 6. Ikona hry a platforma

### 6.1 Vlastnictví hry zjistit nejde

Ověřeno v dokumentaci Microsoftu: entitlementy (`collections.mp.microsoft.com`,
relying party `https://licensing.xboxlive.com`) smí číst jen **vydavatel hry**
s produktem nakonfigurovaným v Partner Center, a stav předplatného Game Pass
jen tehdy, je-li k tomu ten vydavatel autorizovaný. Robův web na cizí hru
takový dotaz položit nemůže. **Rozdíl mezi „koupil si ji“ a „má Game Pass“
je pro nás nedostupný.**

### 6.2 Co zjistit jde: jestli ji na tom účtu hrál

```
GET titlehub.xboxlive.com/users/xuid(<xid>)/titles/titlehistory/decoration/detail
    Authorization: XBL3.0 x=<uhs>;<xstsToken>
    x-xbl-contract-version: 2
```

Hledá se AoE2 DE v seznamu titulů. Hráč si může herní historii v nastavení
soukromí skrýt — a to je přesně ten stav, kvůli kterému má dnešní `steam_hra`
hodnotu `soukromy`. Tři stavy sloupce tedy sedí i na Microsoft hráče beze
změny schématu i beze změny UI:

| stav | Steam (dnes) | Microsoft |
|---|---|---|
| `ma` | hra v knihovně | titul v herní historii |
| `nema` | v knihovně není | v historii není |
| `soukromy` | skrytá knihovna | skryté soukromí herní historie |

Význam ikony se tím u obou platforem posouvá na „tuhle hru na tomhle účtu
hrál“, což je to nejpřesnější, co web může tvrdit. Bublina u ikony to řekne
i slovy.

Titul se hledá podle `titleId` **`2064168993`** (naměřeno sondou 16. 9. 2026).
Jméno `Age of Empires II: Definitive Edition` slouží jen jako záloha, kdyby
Microsoft id někdy změnil — `titleId` je stabilnější než lokalizovatelný název.

**Pozor na Return of Rome a Age of Empires Online.** Sonda našla v historii
i `1297289123` (AoE Online), takže hledání podle jména obsahujícího „Age of
Empires" by sedlo na špatnou hru. Porovnávat se musí přesné `titleId`.

### 6.3 Co Microsoft hráči chybí

`steam_hodiny` zůstane `null` a tabulka ukáže pomlčku — to už dnes umí.
Odehrané hodiny Microsoft nezveřejňuje.

## 7. Rozpoznání v lobby

Dnešní `mapaSteamId()` ve `worldsEdgeLobby.ts` zahodí všechno, co nezačíná
`/steam/`, a Xbox host proto dostane `hostSteamId: null`.

Nahradí ji mapa přes **`profile_id`**, které je v `avatars` u obou platforem
a které máme v `player.we_profil_id`:

```
avatars[].profile_id  →  player.we_profil_id  →  player.hrac_id
```

Jedna cesta pro Steam i Xbox, žádné větvení podle prefixu. Vedlejší zisk:
hráče, který ještě není na webu, poznáme podle `alias` z `avatars` stejně
jako dnes.

Přejmenování v typech: `LobbyInzerat.clenoveSteamIds` → `clenoveHraci`,
`PoznatekLobby.hostSteamId` → `hostHracId`.

## 8. Uživatelské rozhraní

- Přihlašovací obrazovka: druhé tlačítko „Přihlásit se Microsoft účtem“ vedle
  Steamu, ve stejném herním kabátku. Pod ním věta, komu je určené („hra
  z Microsoft Store nebo Game Passu“).
- Karta hráče: platforma u jména. Steam hráči se vizuálně nemění.
- Zbytek webu se nemění — v tom je celý smysl.

## 9. Chybové stavy a záložní cesta

| co selže | co se stane |
|---|---|
| `XboxLive.signin` scope neprojde | Tlačítko se nenasadí, v logu jasná hláška. Řeší příloha A. |
| XSTS vrátí známý kód (sekce 4) | Česká hláška na přihlašovací obrazovce, hráč ví, co udělat. |
| gamertag ≠ alias ve hře | Hráč je přihlášený bez ELO. Řeší příloha A. |
| gamerpic nedostupný | Výchozí erb. |
| `titlehub` nedostupný | Ikona hry se neukáže, jako když chybí Steam klíč. |
| Worlds Edge nedostupné | Stejné chování jako dnes u Steam hráčů. |

| Steam hráč se přihlásí Microsoftem | Dostane svůj **prázdný** `/xboxlive/` profil místo skutečného (sonda 16. 9., §2.3). Karta hráče proto u profilu bez odehrané hry řekne, že vypadá prázdně, a nabídne přihlášení Steamem. |

Dva Microsoft účty se stejným gamertagem nastat nemohou — gamertag je
u Microsoftu unikátní.

## 10. Bezpečnost a soukromí

- **PKCE (S256) i `state`.** `state` v krátkodobé cookie se stejnými
  vlastnostmi jako sezení (`httpOnly`, `sameSite: lax`, cesta = domovská).
- **Žádné Microsoft tokeny v databázi ani v logu.** Do logu nesmí access
  token, XSTS token ani `uhs`.
- **Scope jen `XboxLive.signin`.** Bez `offline_access`, bez e-mailu, bez
  profilu — web se neptá na nic, co nepotřebuje.
- `MS_CLIENT_SECRET` patří do Coolify, nikdy do repa (repo je veřejné).
- Přihlašovací routy dostanou stejné zacházení jako Steam návrat: kontrola
  proti cizímu návratu dřív, než se pošle jediný dotaz ven.

## 11. Konfigurace a nasazení

Jedna registrace v Microsoft Entra, typ účtů **„Personal Microsoft accounts
only“**, čtyři redirect URI:

```
https://jouki.cz/aoe/api/auth/microsoft/return
https://jouki.cz/aoe/dev/api/auth/microsoft/return
https://jouki.cz/aoe/experimental/api/auth/microsoft/return
http://localhost:3000/api/auth/microsoft/return
```

Nové proměnné (do Coolify u všech tří aplikací, do `.env.example` bez hodnot):

```
MS_CLIENT_ID=
MS_CLIENT_SECRET=
```

Když obě chybí, tlačítko se nenasadí a web se chová jako dnes — stejný vzor
jako `varovaniSteamKlic()`, včetně řádku do logu při startu.

## 12. Milníky

Každý je vlastní commit ve větvi `dev`. Verze: milník 2 a 3 `minor`
(migrace a nová funkce), zbytek `patch`.

1. **Sonda.** Azure registrace + nejmenší možný skript (scratchpad, ne repo),
   tester se jednou přihlásí. Ověří se: projde `XboxLive.signin`, vrací XSTS
   `gtg` a `xid`, sedí gamertag s aliasem ve hře, jak vypadá `titlehub`
   odpověď. **Brána: když scope neprojde, mění se přístup (příloha A), ne
   detaily.** Výstup je zápis do tohoto dokumentu, žádný kód k udržení.
2. **Migrace `hrac_id` a přejmenování v kódu.** Nulová změna chování.
3. **Microsoft přihlašovací cesta** a dohledání herního profilu.
4. **Avatar, ikona hry, rozpoznání v lobby přes `profile_id`.**
5. **UI:** tlačítko na přihlašovací obrazovce, platforma na kartě hráče.

## 13. Testy

| soubor | co hlídá |
|---|---|
| `src/auth/microsoftOAuth.test.ts` | stavba authorize URL, PKCE, parsování XSTS odpovědi včetně chybových kódů — hermetické, bez sítě |
| `src/auth/routes.db.test.ts` | rozšíření o Microsoft návrat: cizí `state`, chybějící claim, založení hráče |
| `src/external/worldsEdge.test.ts` | dohledání podle aliasu, **odmítnutí Steam profilu u Microsoft hráče** |
| `src/external/worldsEdgeLobby.test.ts` | Xbox host už nedostane `null` (dnešní test se obrací) |
| fixtury | živé odpovědi ze sond 16. 9. 2026 |

Zelená sada není důkaz, že UI funguje — vizuální kontrola zůstává na
uživateli, podle CLAUDE.md.

## 14. Co ověří tester

Tester má hru z Microsoft Store. Dostane:

- **návod na registr a živou zkoušku `aoe2de://`** (příloha B),
- žádost o **gamertag** a o **jméno, které vidí ve hře v lobby** — porovná se
  proti živému API, čímž se ověří spolehlivost párování podle aliasu,
- žádost, ať na pár minut **založí veřejnou lobby**, aby se dala najít
  v seznamu a ověřilo se čtení slotů u Microsoft hosta,
- po milníku 1 **jedno přihlášení** na `/aoe/dev`.

## Příloha A — záložní párování, když Xbox cesta selže

Použije se, když Microsoft `XboxLive.signin` naší registraci nepovolí, nebo
u hráče, jehož alias ve hře neodpovídá gamertagu.

1. Hráč se přihlásí Microsoft účtem (jen identita, bez Xboxu) nebo je už
   přihlášený a chybí mu profil.
2. Web mu řekne: *„Založ ve hře veřejnou lobby se jménem `ROB-4821`.“*
   Kód je náhodný a platí deset minut.
3. Sledování seznamu lobby (`src/matches/seznamLobby.ts`, běží stejně jako
   dnes) tu lobby najde a přečte `profile_id` jejího hosta.
4. Ten profil se hráči přiřadí — vlastnictví je prokázané hrou samotnou,
   ne Microsoftem.

Je to silnější důkaz než gamertag (hráč musí hru skutečně spustit), ale stojí
hráče jeden rituál při prvním přihlášení. Proto záloha, ne hlavní cesta.

## Příloha B — návod pro testera

**PowerShell** (ne cmd), výstup poslat celý:

```powershell
# 1) Je protokol aoe2de na tomhle stroji zaregistrovaný a čím se otevírá?
reg query "HKCR\aoe2de" /s
reg query "HKCU\Software\Classes\aoe2de" /s

# 2) Kde je hra ze Storu nainstalovaná
Get-AppxPackage *AgeOfEmpires* | Select-Object Name, PackageFullName, InstallLocation

# 3) Jaké protokoly balíček hry sám deklaruje
Get-AppxPackage *AgeOfEmpires* | ForEach-Object {
  Select-String -Path "$($_.InstallLocation)\AppxManifest.xml" -Pattern "Protocol|windows.protocol" -Context 1,3
}
```

Živá zkouška: **Win+R** → `aoe2de://0/123456789` → Enter. Zajímá nás, jestli
se spustí hra, objeví se dialog „Vyberte aplikaci“, nebo Windows protokol
neznají. Číslo je vymyšlené, do lobby se nedostane — jde jen o to, jestli
odkaz něco probudí.

## Zdroje

- Živé sondy Worlds Edge 16. 9. 2026 (`findAdvertisements`, `getPersonalStat`
  třemi způsoby) — sekce 2.
- [xboxlive-auth: vlastní Azure aplikace](https://github.com/XboxReplay/xboxlive-auth/blob/master/docs/02-Custom_Azure_Application.md)
- [xboxlive-auth: RelyingParty a DisplayClaims](https://github.com/XboxReplay/xboxlive-auth/blob/master/docs/04-RelyingParty.md)
- [Microsoft Learn: Query user entitlements from your services](https://learn.microsoft.com/en-us/gaming/gdk/docs/store/commerce/service-to-service/xstore-query-user-entitlements)
- [wiki.vg: Microsoft Authentication Scheme](https://wiki.vg/Microsoft_Authentication_Scheme)

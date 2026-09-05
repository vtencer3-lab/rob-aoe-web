# Nasazení na Robův počítač

Web běží na stroji, na kterém Rob streamuje. Vychází to z toho, že se lidé hlásí
až za vysílání — bez Robova počítače by se stejně nikdy nehrálo, takže nemá cenu
platit server, který by devatenáct hodin denně stál naprázdno.

**Pozor na past:** nechat počítač zapnutý pořád je dražší než pronajatý server.
Herní sestava v nečinnosti táhne 70–100 W, což je 50–70 kWh měsíčně, tedy
300–450 Kč za elektřinu. VPS stojí kolem 165 Kč. Tohle nasazení dává smysl jen
tehdy, když počítač běží jen během streamu.

## Co se nainstaluje

| Co | Odkud | K čemu |
|---|---|---|
| Node.js 24+ | <https://nodejs.org> (LTS, MSI) | běh serveru |
| PostgreSQL 17 | <https://www.postgresql.org/download/windows/> | databáze; instalátor ji rovnou zaregistruje jako službu Windows |
| cloudflared | `winget install --id Cloudflare.cloudflared` | tunel ven |

Postgres se při instalaci ptá na heslo uživatele `postgres` — poznamenej si ho,
poleze do `DATABASE_URL`. Port nech výchozí 5432 a **nikam ho neprokliká ven**;
databáze zůstane jen na `localhost`.

## Adresa, na které to poběží

**Tohle je jediné otevřené rozhodnutí a je potřeba ho udělat dřív než zbytek.**

Bezplatný „quick" tunel, na kterém to zkoušíme teď, dostane při každém spuštění
**jinou adresu**. To by znamenalo, že Rob musí před každým streamem poslat nový
odkaz a někdo mu musí přepsat `BASE_URL` a restartovat server — čili nic z toho
nejde nastavit a zapomenout. Pro ostrý provoz je potřeba **stálá adresa**, a to
znamená pojmenovaný tunel Cloudflare. Ten vyžaduje, aby doménu spravoval
Cloudflare (jen samotnou subdoménu zaregistrovat nejde).

Tři cesty, jak to vyřešit:

1. **Vlastní levná doména pro tenhle účel** (např. `robhry.cz`, 150–300 Kč/rok).
   Na Cloudflare se dá jenom ona, `robdiesalot.com` se nikdo ani nedotkne.
   Nejmenší riziko — doporučuju tuhle.
2. **Přesunout DNS `robdiesalot.com` na Cloudflare** a udělat
   `hry.robdiesalot.com`. Zdarma a Cloudflare je dobrý DNS hosting, ale je to
   zásah do infrastruktury živého webu včetně e-mailových záznamů. Dá se vrátit,
   ale chce to dělat s rozmyslem a ne půl hodiny před streamem.
3. **Zůstat na quick tunelu** a smířit se s tím, že Rob posílá odkaz pokaždé
   nový. Zadarmo a hned, ale žádné „zapnu a jede".

Zbytek návodu předpokládá stálou adresu; kde na ní záleží, je to označené.

## Příprava aplikace

```
git clone <repo> C:\rob-aoe
cd C:\rob-aoe
npm install
npm --prefix web install
```

Založ databázi (psql bývá v `C:\Program Files\PostgreSQL\17\bin`):

```
createdb -U postgres rob_aoe
```

Vytvoř `.env` v kořeni:

```
DATABASE_URL=postgres://postgres:<heslo>@localhost:5432/rob_aoe
BASE_URL=https://hry.robdiesalot.com
PORT=3000
ADMIN_STEAM_ID=<Robovo 64bitové Steam ID>
STEAM_API_KEY=<klíč z https://steamcommunity.com/dev/apikey>
LOG_LEVEL=info
```

`ADMIN_STEAM_ID` vyplň **Robovým** ID. Tím se režie natrvalo přiváže k jeho účtu
a nikdo jiný ji nedostane, ani kdyby se přihlásil první. `DEV_PRISTUP` sem
nepatří vůbec — a i kdyby ho tam někdo napsal, zkušební dveře se samy zavřou,
jakmile `BASE_URL` míří na `https`.

Pak migrace a build:

```
npm run db:migrate
npm run build
```

Ověř, že to jede, dřív než se to bude automatizovat:

```
npm start
```

a otevři `http://localhost:3000`.

## Aby to startovalo samo

Rob nemá nic spouštět ručně. Tři kusy, tři služby.

**PostgreSQL** už službou je — instalátor ji nastavil na automatický start.
Zkontroluj v `services.msc`, že `postgresql-x64-17` má typ spouštění
„Automaticky".

**Server** se přidá jako služba přes NSSM (`winget install NSSM.NSSM`):

```
nssm install RobAoeWeb "C:\Program Files\nodejs\node.exe" "--env-file-if-exists=.env" "dist\src\main.js"
nssm set RobAoeWeb AppDirectory C:\rob-aoe
nssm set RobAoeWeb AppStdout C:\rob-aoe\log\server.log
nssm set RobAoeWeb AppStderr C:\rob-aoe\log\server.log
nssm set RobAoeWeb DependOnService postgresql-x64-17
nssm start RobAoeWeb
```

`DependOnService` je tam schválně: bez něj server nastartuje dřív než databáze,
spadne na chybějícím připojení a Rob to pozná až ve chvíli, kdy stránka nejede.

**Tunel** se instaluje jako služba sám. U pojmenovaného tunelu (varianta 1 nebo 2
výše) to je zhruba:

```
cloudflared tunnel login
cloudflared tunnel create rob-aoe
cloudflared tunnel route dns rob-aoe hry.robdiesalot.com
cloudflared service install
```

Konfigurace tunelu (`%USERPROFILE%\.cloudflared\config.yml`) míří na
`http://localhost:3000`.

## Po aktualizaci hry nebo webu

```
cd C:\rob-aoe
git pull
npm install
npm --prefix web install
npm run db:migrate
npm run build
nssm restart RobAoeWeb
```

Migrace pouštěj vždycky, i když se zdá, že se nic nezměnilo — přidaná migrace
bez spuštění se pozná až tím, že server spadne na chybějícím sloupci.

## Co hlídat

- **Zálohy.** Databáze je na jednom disku v jednom počítači. `pg_dump` do
  OneDrive jednou denně je pět řádků v Plánovači úloh a ušetří to večer, až se
  ten disk jednou rozhodne skončit.
- **Steam API klíč je v `.env` na Robově stroji.** Když si ho vygeneruje znovu,
  ten starý přestane platit a statistiky se tiše přestanou tahat.
- **Windows Update.** Restart uprostřed večera shodí server i tunel. Služby
  najedou samy, ale spojení se všem přeruší; SSE si je obnoví, jen to chvíli
  potrvá. Stojí za to mít aktualizace nastavené mimo streamovací hodiny.
- **Nedostaneš se k tomu na dálku.** Když se něco pokazí, opravuje to Rob podle
  telefonu, ne ty přes SSH. To je hlavní cena za nulový nájem.

## Ověření, že to celé sedí

Po nastavení projít naostro, ideálně den před prvním večerem:

1. Restartovat počítač a **nic nespouštět ručně** — po naběhnutí musí být
   stránka na veřejné adrese dostupná.
2. Přihlásit se přes Steam. Musí to projít a nahoře musí být Robova přezdívka
   s panelem režie.
3. Otevřít tutéž adresu v anonymním okně a ověřit, že se přihlášení do akce
   objeví i tam, bez ručního obnovení stránky.
4. Zkusit `https://<adresa>/api/dev/login?jmeno=Pepa` — **musí to odmítnout**.
   Když by to prošlo, `BASE_URL` nemíří na `https` a je to potřeba spravit dřív,
   než adresu dostane kdokoliv další.

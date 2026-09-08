# Grafický kabátek: co, proč a jak se dělá znovu

Web je od 8. 9. 2026 (větev `experimental`) oblečený do
podoby herního rozhraní Age of Empires II: Definitive Edition s českou
heraldikou. **Rozvržení se nezměnilo ani o pixel** — všechno jsou barvy,
písma, obrázky a rámy. Kdo hledá, jak stránka funguje, ať jde do
[`README.md`](../README.md); tenhle dokument je o tom, jak vypadá.

Grafika není stažená ani koupená. Vznikla lokálně na RTX 5090 modelem
Flux.2-dev v ComfyUI, plus kusy vytažené přímo z instalace hry (Rob i hráči
je znají, takže web působí jako pokračování herního rozhraní). Prompty,
seedy a všechny nástroje jsou v repu, takže se dá kdykoliv vygenerovat
znovu nebo dodělat nový kus ve stejném rukopisu.

---

## 1. Odkud se bere vzhled

| Vrstva | Zdroj |
|---|---|
| **Barvy** | vytažené z loga Brohemians nástrojem `nastroje/grafika/paleta.py`, ne odhadnuté od oka |
| **Písmo** | Cinzel (OFL, hostujeme si ho sami) na nadpisy, Georgia na text |
| **Pozadí, rám, praporec, ozdoba, textury** | vygenerované lokálně (Flux.2-dev), viz §4 |
| **Erby civilizací, ikony map, snímek dialogu Create Lobby, znak Bohemians** | přímo z instalace hry, viz `CONTRIBUTING.md` → „Data ze hry“ |
| **Tlačítka, pole, zaškrtávátka, přepínače, tabulky** | kreslené v CSS, žádné obrázky |

**Proč tlačítka v CSS a ne z obrázku:** zůstanou ostrá v každé velikosti a
při každém zvětšení stránky, nepotřebují devítidílný řez a nedělají další
požadavky na server. Obrázky nesou jen to, co se nakreslit nedá — malovaná
scéna, řezbované dřevo, látka praporce.

---

## 2. Barvy a písmo

Paleta je v `web/src/styl.css` v bloku `:root`. Vytažená z loga:

| Proměnná | Hodnota | Role |
|---|---|---|
| `--zlato-svetle` | `#f2dda6` | text nadpisů, horní hrana kovu |
| `--zlato` | `#d8a83a` | rámečky, hlavní akce, ozdoby |
| `--zlato-tmave` | `#9a6b18` | okraje polí a tlačítek |
| `--zlato-stin` | `#5a3208` | spodní hrana raženého kovu |
| `--krev-svetla` / `--krev` / `--krev-tmava` | `#a81419` / `#6d0d10` / `#2a0705` | praporce, teplý nádech desek |
| `--purpur` / `--purpur-tmavy` | `#9b6be6` / `#3d1372` | ametysty v rozích rámu |
| `--pergamen` | `#f2e0b0` | světlé plochy |
| `--drevo` / `--drevo-tmave` | `#241610` / `#160d08` | výplň panelů |
| `--chyba` / `--varovani` / `--ok` | `#e2695c` / `#e0c46a` / `#a8c47c` | významové barvy, ztlumené do teplé palety |

Osm barev hráčů (`--b1`…`--b8`) zůstalo beze změny **schválně**: musí sedět
s barvami ve hře, jinak hráč nepozná, že je „modrý“. Jsou to jediné syté
barvy na stránce a je to tak správně.

**Písmo.** Nadpisy, tlačítka, štítky a hlavičky tabulek jsou Cinzel — římská
kapitálka blízká nápisům ve hře. Běžný text je Georgia. Popisky polí
v Nastavení Lobby jsou schválně Georgia, ne Cinzel: sloupec dvaceti štítků
v kapitálce se čte hůř a přetahoval pozornost z nadpisů sekcí.

Cinzel je variabilní řez 400–900, dvě sady (`latin`, `latin-ext`), dohromady
40 kB, uložený v `web/src/assets/font/`. **Česká diakritika je pokrytá celá** —
ověřeno `fontTools` proti seznamu `ěščřžýáíéúůďťň`.

---

## 3. Stavební prvky

### Deska s rámem

Panely (`.karta`, `.zapas`, `.host`, `.sprava-akce`, `.panel-prihlaseni`, …)
mají devítidílný rám:

```css
border: 34px solid transparent;
border-image: url(./assets/ui/ram.webp) 250 / 34px / 0 repeat;
```

- Řez `250` je v pixelech **předlohy** (rám je 650×650, takže na střed zbývá 150 px).
- `34px` je tloušťka na obrazovce. Pod 22 px se z rohové ozdoby stane fleček;
  nad 40 px rám ukusuje moc z vnitřní šířky.
- Výplň desky (dřevo + přechod) se kreslí **pod rám**, ne až za něj —
  `background-clip: padding-box` tam nechával prosvítat stránku.

Vnitřní panely (skládání, nastavení, sestava v zápase) rám ani výplň nemají:
dva rámy v sobě dělají matrjošku a druhá vrstva dřeva jen ztmaví desku.

Vedlejší kusy (veřejný řádek zápasu, lišta zkušebních hráčů) mají jen zlatou
linku a tmavý podklad. Rám by z drobného řádku udělal oltář.

### Praporec v záhlaví

Nadpis `h1` sedí na praporci, který je taky `border-image`, ale jen
vodorovně dělený:

```css
border-width: 0 104px;
border-image: url(./assets/ui/praporec.webp) 0 336 fill / 0 104px repeat stretch;
padding: 34px 2.8rem 74px 4rem;   /* svisle v px, viz níž */
filter: drop-shadow(0 10px 12px rgba(0, 0, 0, 0.55));
```

- `fill` kreslí prostřední díl jako pozadí prvku, takže látka roste s délkou
  nadpisu, zatímco zlaté nárožníky s cípy zůstávají.
- `repeat stretch` = vodorovně **dlaždicovat**, svisle natáhnout. Roztažení
  vodorovně by z výšivky růží udělalo šmouhu.
- **Výška musí sedět na poměr předlohy**, jinak se látka svisle zmáčkne.
  Pravidlo: `výška = výška předlohy × (šířka nárožníku na obrazovce / řez)`.
  Předloha 966×463, řez 336, nárožník 104 px → 463 × 104/336 ≈ 143 px. Proto
  je svislé odsazení v pixelech, ne v rem.
- Stín pod látkou dělá `drop-shadow` nad celým prvkem. `box-shadow` by
  u praporce s vlaštovčími cípy a průhledným pozadím visel ve vzduchu.

Předloha se na trojdílný pás převádí nástrojem `praporec.py`, který:
změří **periodu výšivky autokorelací** (aby dlaždice nekončila v půlce růže),
z prostředního proužku odečte podélný světelný přechod a srovná jeho tón na
poslední sloupec nárožníku. Bez těch tří kroků byly v pásu vidět pruhy a
svislý schod na styku.

Logo přesahuje přes levý nárožník (`margin-right: -46px`, vyšší `z-index`)
a vrhá na látku vlastní stín. Přesah jen přes nárožník, ne přes celý konec:
pod štítem má zůstat vidět, že látka někde začíná.

### Ozdoba pod nadpisem

`.nadpis-seznamu`, `main > h2` a `.hlavicka-akce h2` mají pod textem zlatou
rozetu. **Výška se zadává natvrdo** (`... / min(100%, 24rem) 0.95rem`), ne
přes `auto` — z poměru šířky vyrostla ozdoba širokému nadpisu do textu.

### Vodoznak: zrušený

V prázdné půlce sloupce se sestavou byl chvíli vodoznak — nejdřív zlatá
rytina pražského orloje, pak český lev „vyřezaný do dřeva“. Obojí bylo
poskládané ručně a obojí vypadalo špatně: první jako nálepka na desce, druhý
jako fušeřina, a navíc si s sebou nesl artefakt z předlohy. Vodoznak je teď
pryč. Až se k němu vrátíme, musí ho nakreslit nástroj, ne skládání kopií.

### Dvouocasý lev: nedořešeno

Lev na praporcích v pozadí má podle státního znaku **dva ocasy**. Difuzní
model mu ve scéně spolehlivě kreslí jeden, i když se v promptu dvakrát řekne
opak, a Qwen-Image-Edit druhý ocas na hotovém obrázku nepřidá taky.

Vyzkoušená a **zamítnutá** cesta: vygenerovat scénu s prázdnými praporci
(`zadani/pozadi3.json`), lva zvlášť (`zadani/lev.json`, tam vychází správně)
a vsadit ho perspektivní transformací (`vsad_znak.py`). Technicky to fungovalo,
výsledek byl ale horší než původní vygenerovaná scéna — lvi seděli jinak, měli
jinou barvu a celé to působilo slepené. Nástroj v repu zůstává, ale
**nepoužívá se**; pozadí je čistě vygenerované (`namesti2_04`).

Správná cesta je nechat opravu udělat model, který umí cílenou editaci
obrázku (GPT-Image, Scenario), ne skládat kusy ručně. Do té doby má lev na
pozadí jeden ocas a je to známý nedodělek.

---

## 4. Vygenerované assety

Všechno vzniklo lokálně, bez placených služeb. Prompty jsou v
`nastroje/grafika/zadani/*.json`, seedy níž. Modely a jejich zprovoznění:
`docs/generovani-obrazku.md` v projektu Koshishatsi (tam je i instalace
ComfyUI a stažení vah).

| Soubor ve `web/src/assets/ui/` | Předloha | Seed | Rozměr generování |
|---|---|---|---|
| `pozadi.webp` | `namesti2` var. 04 | 4235347553055014676 | 1536×864 |
| `ram.webp` | `ram` var. 02 | 4923907625749824255 | 1024×1024 |
| `praporec.webp` | `praporec2` var. 04 | 384470600565535280 | 2048×512 |
| `oddelovac.webp` | `oddelovac` var. 03 | 6271939320368049132 | 1536×384 |
| `drevo.webp` | `drevo` var. 01 | 3567542112645301907 | 1024×1024 |
| `pergamen.webp` | `pergamen` var. 00 | 1398608127076758676 | 1024×1024 |
| — | vodoznak zrušen, viz §3 | — | — |

Všechno generováno **bez LoRA** (`lora: 0.0`), 24 kroků, guidance 4,0.
Dohromady zabírají necelých 600 kB.

### Jak vygenerovat znovu

```bash
# 1. ComfyUI musí běžet na http://127.0.0.1:8188
C:\Users\<ty>\ComfyUI\ComfyUI_windows_portable\run_nvidia_gpu.bat

# 2. Dávka podle zadání; hotové soubory přeskakuje, seedy píše do manifest.json
python nastroje/grafika/davka.py nastroje/grafika/zadani/pozadi.json -o ../_grafika/navrhy/pozadi

# 3. Posoudit kontaktní list (nezmenšovat — z náhledu se rozhodnout nedá)
python nastroje/grafika/prehled.py prehled.png "../_grafika/navrhy/pozadi/*.png" --sloupce 3

# 4. Z vybraného rámu udělat devítidílný rámeček
python nastroje/grafika/devitidil.py ram_02_nobg.png -o ram.png --roh 250 --pas 150 --alfa-ze-vstupu --otvor-z ram_02.png --nahled zkouska.png

# 5. Odstranit pozadí přes Scenario (stojí kredity, jen na pokyn uživatele)
python nastroje/grafika/scenario_bg.py oddelovac_03.png -o oddelovac_03_nobg.png
python nastroje/grafika/klic.py oddelovac_03_nobg.png -o oddelovac.png --alfa-ze-vstupu

# 5a. Vlastní záplava od rohů, když Scenario není po ruce (horší, viz 4.1)
python nastroje/grafika/klic.py oddelovac_03.png -o oddelovac.png --prah 55

# 5b. Praporec do trojdílného pásu (změří periodu výšivky, srovná tón)
python nastroje/grafika/praporec.py praporec2_04_nobg.png -o praporec.png \
    --orez 264,1786 --cap 336 --prah 6 --vyhlad 0.55 --alfa-ze-vstupu --nahled zkouska.png

# 5c. Lva na prázdné praporce v pozadí
python nastroje/grafika/vsad_znak.py pozadi.png lev.png -z praporce.json -o hotovo.png --nahled

# 6. Do webu jako webp
python nastroje/grafika/export.py pozadi.png -o web/src/assets/ui/pozadi.webp -q 80 --sirka 2560
python nastroje/grafika/export.py drevo_01.png -o web/src/assets/ui/drevo.webp -q 78 --sirka 512 --bezesve
```

---

## 4.1 Odstranění pozadí: Scenario, ne vlastní záplava

Difuze neumí průhlednost, takže se assety generují na černé pozadí a alfa se
dodělává až potom. Dělaly to vlastní záplavy od rohů (`klic.py` a totéž uvnitř
`devitidil.py` i `praporec.py`). Od 9. 9. 2026 je dělá **Scenario Remove
Background** (`nastroje/grafika/scenario_bg.py`) a nástroje pak dostanou
`--alfa-ze-vstupu`, aby cizí masku nepřepisovaly vlastní.

Naměřený rozdíl (jas okrajových pixelů proti jasu plochy — čím zápornější,
tím silnější černý lem; a čím víc poloprůhledných pixelů, tím vybledlejší
asset):

| Asset | Záplava | Scenario |
|---|---|---|
| `oddelovac` | 8 393 okrajových px, lem −72 | 4 191 px, lem −16 |
| `praporec` | 5 814 px, lem −18 | 5 786 px, bez tmavého lemu |
| `ram` | 128 144 px, lem −52 | 9 132 px, lem −4 |

Rám nakonec nestojí ani na jednom: 9. 9. 2026 poslal uživatel vlastní
vyčištěnou verzi (`navrhy/prvky/ram_02_vycisteny.png`), která má odstraněné
pozadí **i otvor uprostřed** a jen 3 068 poloprůhledných okrajových pixelů —
třetinu oproti Scenariu. Skládá se proto bez `--otvor-z`:

```bash
python nastroje/grafika/devitidil.py ram_02_vycisteny.png -o ram.png --roh 250 --pas 150 --alfa-ze-vstupu
```

U rámu je to nejvíc vidět: záplava mu udělala poloprůhlednou skoro celou
dřevěnou desku (proto vypadal vybledlý a ztratil fialový pásek), Scenario ji
nechá plnou. Soubor je i tak menší, 60 kB místo 149 kB.

**Jedna věc Scenario neumí:** vyřízne předmět z okolí, ale otvor uvnitř rámu
za pozadí nepovažuje. Devítidílný rám by pak měl v rozích neprůhledné cáry.
Otvor se proto bere záplavou od středu z **původního** renderu (`--otvor-z`),
kde má kde skončit; v obrázku s odstraněným pozadím je venek dokonale černý
a záplava by po něm protekla i do tmavého dřeva.

**Projekt na Scenariu.** Uživatel určil `proj_9Epp9mVRGdKPcaiZwwQ9JjMS`.
Projekt se předává parametrem adresy (`POST /assets?projectId=...`), jenže klíč
v `~/.scenario_api.json` do něj **nemá přístup** — vrací 403 „You cannot access
this team or project“. Assety proto padají do projektu, kam patří klíč
(`proj_HcK68Stx6KTqWcyQqjEG6PEr`). Než bude po ruce klíč z určeného projektu,
posílá `scenario_bg.py` `projectId` v těle požadavku, kde ho server ignoruje.

## 5. Co se při tom naučilo

- **Stylová LoRA `koshishatsi_flux2` scénu zabije.** Je natrénovaná na
  izolované předměty na černém, takže celoplošnému pozadí přimaluje černou
  vinětu a udělá z něj ostrůvek. Na pozadí a velké scény generovat bez LoRA.
- **Styl drží popis, ne LoRA.** Věta „painted concept art in the style of the
  Age of Empires II Definitive Edition main menu artwork“ stačila; hlavní
  menu hry (`mainmenu/mainmenu_bg.jpg`) je dobrá předloha, když by nestačila.
- **Kompozici je potřeba říct, kde má být klid.** Do promptu patří „the centre
  of the picture is calm open sky and haze, the detail sits at the left and
  right edges“ — jinak model narve zajímavosti doprostřed, kde pak stojí panel.
- **Devítidílný rám se nedá vzít rovnou z generovaného obrázku.** Strany
  nejsou stejné a vnitřní otvor je nakřivo. `devitidil.py` proto vezme jeden
  roh a jeden **proužek hned vedle rohu** (ne ze středu strany — jen tak na
  sebe zlaté linky navazují) a zbytek rámu z nich odvodí otáčením a zrcadlením.
  Model maluje každou stranu trochu jinak; dokud se braly čtyři různé, dolní
  hrana barevně nesedla se svislými. Proužek navíc projde srovnáním jasu podél
  hrany (jinak z opakování vzniknou pruhy) a posunem tónu na poslední sloupec
  rohu (jinak je na styku schod).
- **Difuze neumí spočítat do dvou.** Lev na praporcích má mít dva ocasy;
  z promptu i z editace hotového obrázku vycházel jeden. Když je lev jediným
  motivem obrázku, model ho nakreslí správně — ale **vsadit ho pak do scény
  po svém je slepá ulička**: výsledek vyšel hůř než původní vygenerovaná
  scéna. Co má obrázek změnit, musí změnit model, ne skládání kopií.
- **Zaškrtávátko se nafouklo z odsazení.** Obecné pravidlo pro `input, select`
  dává polím vnitřní odsazení; u `box-sizing: border-box` se pod jeho součet
  šířka stáhnout nedá, takže ze čtverečku 17 × 17 px byl obdélník 21 × 17 a
  žádné `max-width` to nespravilo. Pravidlo pro zaškrtávátka proto stojí až
  za ním a odsazení výslovně nuluje.
- **Ozdoba jako pozadí nadpisu se ořezává jeho šířkou.** V pružném řádku je
  nadpis široký jen podle textu, takže z ozdoby zbyla půlka. Patří do
  vlastního bloku (`::after`), který smí být širší než nadpis.
- **Klíčování prahem podle jasu nefunguje** na věcech, které mají vlastní
  tmavá místa. Záplava od rohů obrázku ano — ale práh je citlivý: praporec
  při `--prah 60` „vytekl“ do tmavě rudé látky a zbyly z něj cáry, při 18
  vyšel čistě.
- **Zaškrtávátka a posuvník nechat systémové nejde.** Modrý systémový
  checkbox a světlý posuvník na zlatohnědé desce působí jako cizí těleso.
- **Vzorník ušetří spoustu času.** `_grafika/nastroje/vzornik.mjs` složí
  jednu stránku se všemi prvky včetně těch, na které se v provozu jen tak
  nedostaneš (kontrola lobby, chybová hláška, toast). Odhalil přetékající
  ozdobu nadpisu, které si ve skutečné stránce nikdo nevšiml.

---

## 6. Jak zkontrolovat, že se nic nerozbilo

Zelené testy o vzhledu nic neříkají. Na to jsou snímky:

```bash
cd ../_grafika/nastroje
npm i -D playwright && npx playwright install chromium   # jednorázově
node snimky.mjs pred      # sada obrazovek do ../snimky/pred
node sirky.mjs            # 1280 / 1440 / 1600 / 1920 + hlášení přetečení
node vzornik.mjs          # vzorník všech prvků
```

Snímky potřebují **běžící lokální server se zkušebními dveřmi**
(`DEV_PRISTUP=true`), protože se přes ně přihlašují a plní hráče.

Ověřené šířky: 1280, 1440, 1600 a 1920 px bez vodorovného přetečení.

---

## 7. Pravidla pro nové UI

- Nový panel → `border-image` rám jen tehdy, když je to samostatná deska.
  Uvnitř desky se rám nedává.
- Nadpis → Cinzel, barva `--zlato-svetle`. Text → Georgia, `--text`.
- Tlačítko → `button` (tmavé) nebo `.cta` / `.tlacitko` / `button.vytvorit`
  (zlaté, hlavní akce). Nic mezi tím; dvě váhy stačí.
- Tlačítko, které má vypadat jako text (jméno, řazení, kopírování), musí
  dostat `background: none; border: none; box-shadow: none` — jinak si vezme
  reliéf ražené destičky.
- Nová barva → nejdřív se koukni, jestli ji nemá paleta. Napevno zapsaná
  barva v pravidle je chyba, ne zkratka.

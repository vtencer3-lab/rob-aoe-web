# Grafický kabátek: co, proč a jak se dělá znovu

Web je od 8. 9. 2026 (větev `experimental`, verze `0.16.4-17.0`) oblečený do
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
border-width: 0 68px;
border-image: url(./assets/ui/praporec.webp) 0 300 fill / 0 68px stretch;
```

`fill` znamená, že se prostřední díl kreslí jako pozadí prvku, takže látka
roste s délkou nadpisu, zatímco žerď s hroty a vlaštovčí ocasy zůstávají.

**Pozor na poměr.** Krajní díly se stlačují vodorovně nezávisle na svislém
stlačení celého obrázku. Když to nesedí, žerď vypadá jako tenký bodec.
Pravidlo: `šířka krajního dílu ≈ řez / (výška předlohy / výška praporce na
obrazovce)`. Při výšce ~100 px a předloze 455 px vychází 300 / 4,5 ≈ 68 px.

Logo přesahuje přes levý konec praporce (`margin-right: -42px`, vyšší
`z-index`) — bez toho by mezi štítem a látkou zůstala mezera a znak by
vypadal odloženě.

### Ozdoba pod nadpisem

`.nadpis-seznamu`, `main > h2` a `.hlavicka-akce h2` mají pod textem zlatou
rozetu. **Výška se zadává natvrdo** (`... / min(100%, 24rem) 0.95rem`), ne
přes `auto` — z poměru šířky vyrostla ozdoba širokému nadpisu do textu.

### Vodoznak

Prázdná půlka sloupce se sestavou nese rytinu pražského orloje. Není to
náhodná dekorace: **je to znak civilizace Bohemians přímo ze hry**
(`resources/_common/wpfg/resources/civ_emblems/bohemians.png`), přebarvený
do zlata. Odkazuje na hru i na Čechy naráz a je to tentýž orloj, co stojí
na pozadí stránky.

---

## 4. Vygenerované assety

Všechno vzniklo lokálně, bez placených služeb. Prompty jsou v
`nastroje/grafika/zadani/*.json`, seedy níž. Modely a jejich zprovoznění:
`docs/generovani-obrazku.md` v projektu Koshishatsi (tam je i instalace
ComfyUI a stažení vah).

| Soubor ve `web/src/assets/ui/` | Předloha | Seed | Rozměr generování |
|---|---|---|---|
| `pozadi.webp` | `pozadi_namesti` var. 02 | 8095574997087876325 | 1536×864 |
| `ram.webp` | `ram` var. 02 | 4923907625749824255 | 1024×1024 |
| `praporec.webp` | `praporec` var. 03 | 6199344767629039397 | 1536×512 |
| `oddelovac.webp` | `oddelovac` var. 03 | 6271939320368049132 | 1536×384 |
| `drevo.webp` | `drevo` var. 01 | 3567542112645301907 | 1024×1024 |
| `pergamen.webp` | `pergamen` var. 00 | 1398608127076758676 | 1024×1024 |
| `orloj.webp` | znak Bohemians ze hry, přebarvený | — | — |

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
python nastroje/grafika/devitidil.py ram_02.png -o ram.png --roh 250 --pas 150 --nahled zkouska.png

# 5. Vyříznout z černého pozadí (praporec, ozdoba)
python nastroje/grafika/klic.py praporec_03.png -o praporec.png --prah 18

# 6. Do webu jako webp
python nastroje/grafika/export.py pozadi.png -o web/src/assets/ui/pozadi.webp -q 80 --sirka 2560
python nastroje/grafika/export.py drevo_01.png -o web/src/assets/ui/drevo.webp -q 78 --sirka 512 --bezesve
```

---

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
  nejsou stejné a vnitřní otvor je nakřivo. `devitidil.py` proto vezme čtyři
  rohy a **proužek hned vedle rohu** (ne ze středu strany — jen tak na sebe
  zlaté linky navazují) a udělá z něj zrcadlovým prolnutím dlaždici bez švu.
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

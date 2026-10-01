# Zadání: grafika módu Diplomacie

Znaky rolí, rub tajné karty a rám minimapy pro mód Diplomacie (větev `diplo`,
spec §8). Všechno vzniká stejně jako zbytek kabátku (`docs/grafika.md`): lokálně
ve Flux.2-dev přes ComfyUI, bez LoRA, 24 kroků, guidance 4,0, na černém pozadí,
alfa až potom nástrojem. Prompty, seedy a rozměry jsou v `diplomacie.json` vedle
tohoto souboru; tenhle soubor říká, co se chtělo a proč, a jak z renderů vzniknou
soubory na webu.

## Styl

- Stejný rukopis jako `ram.webp` a `praporec.webp`: malované herní rozhraní
  Age of Empires II DE, leštěné zlato s teplými odlesky a tmavou obrysovou linkou,
  karmínový smalt jako druhá barva (paleta `--zlato`, `--krev`).
- Každý znak je **jeden předmět bez pozadí a bez štítu okolo**, zepředu, bez
  perspektivy, vyplňuje rám. Má se číst na 104 px vedle erbů civilizací
  (`web/src/assets/civ/`, 104 px, kulaté/štítové ikony ze hry), proto „one bold
  readable shape“ a žádné drobnosti kolem.
- Žádný text — model do znaků rád vpisuje nápisy, které na 104 px vypadají jako
  šmouha.

## Motivy

| soubor | role | motiv v promptu |
|---|---|---|
| `role-nastupce` | Nástupce císaře | zlatá koruna s karmínovou čepicí, liliové cimbuří, červené kameny |
| `role-garda` | Královská Garda | štít s karmínovým polem a zlatým lemem, za ním dvě zkřížené halapartny |
| `role-najezdnik` | Nájezdník | hořící pochodeň, tmavá rukojeť se zlatými obručemi |
| `role-sasek` | Šašek | zlatá rolnička na karmínovo-zlaté mašli |
| `role-zoldak` | Žoldák | meč se zlatým jílcem šikmo přes kožený měšec, vysypané mince |
| `role-kat` | Kat | katovská sekera, široká čepel, tmavé topůrko se zlatými obručemi |
| `role-gm` | GM | zlaté žezlo s otevřeným okem ve slunečním kotouči, karmínový kámen |
| `rub-karty` | rub zakryté karty | karmínová kůže, zlatý filigránový okraj, uprostřed červená pečeť s orlicí |
| `ram-mapy` | rám minimapy | tenký zlatý čtvercový rám s korálkovou vnitřní hranou a rohovými akantovými bosy, střed prázdný (jako `boxstyle2` ve hře) |

Rub karty je naležato; prompt chtěl 3:2, model kartě přidal okraj a vybraný
render má po ořezu 1,66 : 1 (na webu 600 × 362 px). Zobrazuje se pod tlačítkem
zakrytí na jeho šířku, 22 rem, ať spolu tvoří jednu „kartu rubem nahoru“. Bez
nápisu „tajné“ — text do obrázku nepatří (viz Styl), tajnost říká tlačítko nad
kartou.

## Postup

Přesně tyhle příkazy vyrobily soubory ve `web/src/assets/diplomacie/` (ověřeno:
zopakování dává shodu do pixelu). Rendery patří **vedle repo**, do
`../_grafika/navrhy/diplomacie` — uvnitř repa by je jeden `git add -A` commitnul.
`seed` v `diplomacie.json` je seed vybrané varianty, takže po novém běhu dávky je
vybraná varianta vždy `_00`; původní čísla variant (01, 03, …) má tabulka
v `docs/grafika.md` §4.

```bash
# 1. ComfyUI na http://127.0.0.1:8188, pak dávka (4 varianty na motiv, ~40 s/obrázek)
python nastroje/grafika/davka.py nastroje/grafika/zadani/diplomacie.json -o ../_grafika/navrhy/diplomacie

# 2. Kontaktní listy (davka.py je dělá sama: *_kontakt.png); vybraná varianta je _00
python nastroje/grafika/prehled.py ../_grafika/navrhy/diplomacie/prehled.png "../_grafika/navrhy/diplomacie/role-*_00.png" --sloupce 4

# 3. Znaky rolí: alfa záplavou od rohů s prahem 12 (pozadí renderů má L <= 3; práh 40
#    i výchozích 70 žral samet koruny a dřevo pochodně), ořez na obsah, usazení na
#    průhledný čtverec a export 208 px (104 px při 2x)
for n in nastupce garda najezdnik sasek zoldak kat gm; do
  python nastroje/grafika/klic.py ../_grafika/navrhy/diplomacie/role-${n}_00.png -o ../_grafika/navrhy/diplomacie/vyber/role-${n}.png --prah 12
  python nastroje/grafika/export.py ../_grafika/navrhy/diplomacie/vyber/role-${n}.png -o web/src/assets/diplomacie/role-${n}.webp -q 86 --sirka 208 --ctverec
done

# 4. Rub karty: stejná alfa (průhledné zaoblené rohy), export na 600 px šířky
python nastroje/grafika/klic.py ../_grafika/navrhy/diplomacie/rub-karty_00.png -o ../_grafika/navrhy/diplomacie/vyber/rub-karty.png --prah 12
python nastroje/grafika/export.py ../_grafika/navrhy/diplomacie/vyber/rub-karty.png -o web/src/assets/diplomacie/rub-karty.webp -q 82 --sirka 600

# 5. Rám minimapy: devítidíl z jednoho rohu (112 px předlohy = rohový bos + kus pásu)
#    a proužku 96 px vedle něj, vlastní záplava s prahem 20; výsledek 320x320, řez 112
python nastroje/grafika/devitidil.py ../_grafika/navrhy/diplomacie/ram-mapy_00.png -o ../_grafika/navrhy/diplomacie/vyber/ram-mapy.png --roh 112 --pas 96 --prah 20 --vyhlad 0.85 --nahled ../_grafika/navrhy/diplomacie/ram-nahled.png
python nastroje/grafika/export.py ../_grafika/navrhy/diplomacie/vyber/ram-mapy.png -o web/src/assets/diplomacie/ram-mapy.webp -q 90
```

`--ctverec` (krok 3) je nutný: každý znak má po ořezu jiný poměr stran (pochodeň
267 × 991, koruna 815 × 746) a CSS je kreslí 104 × 104 — bez usazení na čtverec
by se zdeformovaly. `--vyhlad 0.85` je výchozí hodnota `devitidil.py`, uvedená
výslovně, aby postup nezávisel na výchozích hodnotách.

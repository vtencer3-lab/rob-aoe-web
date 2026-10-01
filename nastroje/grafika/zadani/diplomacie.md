# Zadání: grafika módu Diplomacie

Znaky rolí, rub tajné karty a rám minimapy pro mód Diplomacie (větev `diplo`,
spec §8). Všechno vzniká stejně jako zbytek kabátku (`docs/grafika.md`): lokálně
ve Flux.2-dev přes ComfyUI, bez LoRA, 24 kroků, guidance 4,0, na černém pozadí,
alfa až potom nástrojem. Prompty a rozměry jsou v `diplomacie.json` vedle tohoto
souboru; tenhle soubor říká, co se chtělo a proč.

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
| `ram-mapy` | rám minimapy | tenký zlatý čtvercový rám s korálkovou vnitřní hranou a rohovými akantovými trojúhelníky, střed prázdný (jako `boxstyle2` ve hře) |

Rub karty je naležato 3:2 (karta v ruce, obsah pod ní je široký 34 rem), bez
nápisu „tajné“ — text do obrázku nepatří (viz Styl), tajnost říká tlačítko nad
kartou.

## Postup

```bash
# 1. ComfyUI na http://127.0.0.1:8188, pak dávka (4 varianty na motiv)
python nastroje/grafika/davka.py nastroje/grafika/zadani/diplomacie.json -o _grafika/navrhy/diplomacie

# 2. Kontaktní list a výběr nejlepší varianty podle kritérií v docs/grafika.md
python nastroje/grafika/prehled.py _grafika/navrhy/diplomacie/prehled.png "_grafika/navrhy/diplomacie/role-*.png" --sloupce 4

# 3. Alfa záplavou od rohů (bez Scenaria — stojí kredity) a ořez na obsah
python nastroje/grafika/klic.py _grafika/navrhy/diplomacie/role-kat_02.png -o _grafika/navrhy/diplomacie/vyber/role-kat.png --prah 40

# 4. Rám minimapy: devítidíl z jednoho rohu a proužku vedle něj
python nastroje/grafika/devitidil.py _grafika/navrhy/diplomacie/ram-mapy_01.png -o _grafika/navrhy/diplomacie/vyber/ram-mapy.png --roh 200 --pas 120 --nahled zkouska.png

# 5. Export do webu (znaky 208 px = 104 px při 2×)
python nastroje/grafika/export.py _grafika/navrhy/diplomacie/vyber/role-kat.png -o web/src/assets/diplomacie/role-kat.webp -q 86 --sirka 208
```

Vybrané varianty, seedy a rozměry jsou v tabulce v `docs/grafika.md` §4;
`seed` v `diplomacie.json` je seed vybrané varianty, takže `_00` při novém
běhu vyjde stejně jako to, co je na webu.

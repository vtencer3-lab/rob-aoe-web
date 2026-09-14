# Grafika a obrázky: postupy a pasti

Vzhled, barvy, rámy a historie assetů jsou v [`../grafika.md`](../grafika.md).
Tady jen **jak** se s obrázky pracuje, aby to šlo zopakovat jinde.

## Pravidlo: co čím

| situace | nástroj | pozn. |
|---|---|---|
| upravit **existující** obrázek (anatomie lva, přidat kopí, srovnat tón) | GPT Image přes **Codex CLI** | zachová zbytek obrázku; přes API bez GUI |
| vygenerovat **nový** obrázek (pozadí, textura, praporec) | lokální ComfyUI / Flux | zadání a seedy v `nastroje/grafika/zadani/*.json` |
| odstranit pozadí | Scenario.com API (`nastroje/grafika/scenario_bg.py`) | **stojí kredity** — jen na výslovný pokyn |
| zmenšit PNG | TinyPNG (`tinify` pip) | klíč mimo repo |
| do webu | `nastroje/grafika/export.py` → webp | kvalita podle role (pozadí 82, rám 92) |
| ikona z exe | `icoextract` | 256 px vrstva |

Když není jasné, které z toho platí, zeptat se — rozhodnutí uživatele.
Ručně (v editoru) se obrázky **neupravují**.

## GPT Image přes Codex CLI

Nejnovější binárka: `ls -t /c/Users/mjouk/AppData/Local/OpenAI/Codex/bin/*/codex.exe | head -1`
(verze se instalují vedle sebe). Musí běžet v git repu (cwd), jinak odmítne.

```
codex exec -C <dir> -s workspace-write --color never -i vstup.png -o vystup.txt - < prompt.txt
```

Krátké, konkrétní prompty fungují nejlíp („zachovej žlutou, natoč hlavu
dovnitř, dva ocasy, ocas nesplétej“); dlouhé prompty s „intertwine“ vedly
ke zkroucenému ocasu. Výsledek se zapisuje do adresáře repa; každé kolo
uložit pod vlastním jménem (`_v2`, `_v3`), ať jde porovnat a vrátit se.
Relace Codexu jsou v `~/.codex/sessions/`. Postup s lvem krok po kroku je
v `grafika.md` §3 a přehledu §3.28.

## Odstranění pozadí (Scenario)

`python nastroje/grafika/scenario_bg.py vstup.png -o vysledek.png`, klíč v
`~/.scenario_api.json` (nikdy do repa). Vlastní záplavové odstranění
(flood fill) selhávalo na měkkých hranách a stínech — proto placená služba.
Po Scenariu TinyPNG (`tinify`, klíč v MMWT `settings.json`,
`TinifyApiKey`; nevypisovat, necommitovat) a pak export.

## Export do webp (`nastroje/grafika/export.py`)

```
python nastroje/grafika/export.py pozadi.png -o web/src/assets/ui/pozadi.webp -q 82 --sirka 2560
python nastroje/grafika/export.py ram.png -o web/src/assets/ui/ram.webp -q 92
python nastroje/grafika/export.py textura.png -o … --bezesve    # zrcadlově prolnout na dlaždici
```

Malovaná grafika s alfou v PNG váží násobky webp. `--bezesve` dělá zrcadlové
prolnutí v obou osách (ofsetové nechávalo šev, obě poloviny mají jiné
osvětlení). Zdrojové PNG zůstávají mimo repo (`_grafika/final/`, neverzováno).

## Pozadí: tři varianty a přepínač

`web/src/assets/ui/pozadi.webp` (původní lvi z Fluxu), `pozadi-nove.webp`
(lvi překreslení podle státního znaku přes GPT Image), `pozadi-soumrak.webp`
(soumrak na náměstí, výchozí od 1.1.4). CSS: výchozí bez třídy, ostatní
třídou `pozadi-<klic>` na `<html>`; volba `rezie.pozadi` v localStorage
(`POZADI` + `useUlozenaVolba` v `App.tsx`), tlačítka `role="radio"` jen
v debug módu. Až se rozhodne, ostatní soubory i volba zmizí.

## Praporec (větev `experimental`)

Pokus s praporcem na kopí místo barevného pruhu na obrazovce hráče (GPT
Image + CSS obarvení podle barvy hráče, `praporec-tym.webp` + maska). Drží se
jen v `experimental` (verze `X.Y.Z-A.B`), dokud uživatel nerozhodne;
postup srovnání tónu je v `grafika.md` §4.2–4.3.

## Pasti

- `npm run build | grep …` zamaskoval chybu buildu (0.32.0 odešel
  nepostavitelný) — vždy `npm run build > log; echo EXIT=$?`.
- Obrázky z GPT mívají jiné rozměry než vstup — před exportem zkontrolovat
  a případně oříznout na původní poměr.
- Barvy nikdy napevno v CSS pravidle, paleta je v `:root` (`grafika.md` §2).

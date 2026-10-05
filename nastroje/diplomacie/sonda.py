"""Přibalí do scénáře XS sondu Diplomacie ručně: kopie `<jméno>-sonda.aoe2scenario`.

Totéž dělá web sám při nahrání každé verze scénáře (kopie se sondou je to,
co host stahuje; originál zůstává). Tenhle nástroj je na pokusy mimo web a
**žádnou vlastní logiku nemá**: přibalení i kód provozní sondy jsou v modulu
módu — `src/diplomacie/sonda.py` (funkce `pribal`) a `src/diplomacie/sonda.xs`
(tam je i rozložení souboru `<id>\\profile\\<jméno scénáře>.xsdat`, formát 3;
čte ho `xsdat.py`).

Ověřeno 2. 10. 2026 na LLC (build 101.103.54800, formát 2): soubor vzniká
v `profile\\`, obě časové značky sedí, čas běží po 2 s, relikvie sebraná
mnichem se v něm objeví hned (atribut 7 = `cAttributeRelics`).

**Čísla hráčů v XS jsou pořadí v lobby, ne sloty scénáře** (zjištěno živě:
uživatel hrál šedého = scénářový hráč 7, seděl v lobby první a XS ho vedl
jako 1, modrého AI jako 7). Proto sonda zapisuje převod slot → číslo hráče
(`xsGetWorldPlayerId`) a ke každému číslu jméno a barvu.

Použití: python sonda.py [--super] <scénář.aoe2scenario> [výstup.aoe2scenario]
  --super přibalí místo provozní sondy `supersonda.xs` (úplný výpis: všechny
  atributy hráčů s názvy, technologie, třídy jednotek, pozice králů a
  relikvií, proměnné triggerů…) — na zjišťování, co jde ze hry získat
Vyžaduje: pip install AoE2ScenarioParser==0.9.2
"""

import importlib.util
import os
import sys

TADY = os.path.dirname(os.path.abspath(__file__))


def modul_webu():
    """Modul přibalení z webu (`src/diplomacie/sonda.py`) — jeden zdroj pravdy.

    Načítá se cestou, ne jménem: jmenuje se stejně jako tenhle soubor.
    """
    cesta = os.path.normpath(os.path.join(TADY, "..", "..", "src", "diplomacie", "sonda.py"))
    spec = importlib.util.spec_from_file_location("sonda_webu", cesta)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def pribal_sondu(vstup: str, vystup: str, xs: str | None = None) -> dict:
    """Načte scénář, přibalí sondu a zapíše kopii. Vrací {oznaceno, cile, revize, varovani, triggeru}."""
    from AoE2ScenarioParser.scenarios.aoe2_de_scenario import AoE2DEScenario

    scenar = AoE2DEScenario.from_file(vstup)
    vysledek = modul_webu().pribal(scenar, xs)
    scenar.write_to_file(vystup)
    return {**vysledek, "triggeru": len(scenar.trigger_manager.triggers)}


def main() -> None:
    argumenty = [a for a in sys.argv[1:] if a != "--super"]
    if not argumenty:
        print(__doc__)
        sys.exit(2)
    # --super: místo provozní sondy přibalí supersonda.xs — úplný výpis všeho,
    # co XS o hře ví (katalog dat, ~150 kB každých 5 s; čte supersonda.py, verze 100).
    super_sonda = "--super" in sys.argv
    xs = None
    if super_sonda:
        with open(os.path.join(TADY, "supersonda.xs"), encoding="ascii") as f:
            xs = f.read()
    vstup = argumenty[0]
    koren, pripona = os.path.splitext(vstup)
    vystup = argumenty[1] if len(argumenty) > 1 else f"{koren}-{'supersonda' if super_sonda else 'sonda'}{pripona}"
    v = pribal_sondu(vstup, vystup, xs)
    print(f"označeno triggerů přidělení cíle: {v['oznaceno']} (revize sondy {v['revize']})")
    for varovani in v["varovani"]:
        print(f"POZOR: {varovani}")
    print(f"{vystup}: {v['triggeru']} triggerů (poslední je XS SCRIPT), soubor sondy bude profile\\{os.path.splitext(os.path.basename(vystup))[0]}.xsdat")


if __name__ == "__main__":
    main()

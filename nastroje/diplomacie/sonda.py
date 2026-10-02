"""Přibalí do scénáře XS sondu Diplomacie: kopie `<jméno>-sonda.aoe2scenario`.

Sonda je jeden trigger „XS SCRIPT“ s efektem Script Call (vkládá ho
`xs_manager` AoE2ScenarioParseru), jehož kód hra při načtení zkompiluje do
`resources/_common/xs/default0.xs` u každého hráče i diváka. Pravidlo v něm
každé 2 herní sekundy přepíše `<id>\\profile\\<jméno scénáře>.xsdat`:

    int verze (1) | int čas | 8× (float relikvie, int žije)
    | 64× int diplomacie(a, b) | int čas

Čas na začátku i na konci: zápis nemusí být atomický, čtenář (xsdat.py,
most Židolišty) bere jen čtení, kde se obě hodnoty shodují. Autorovy
triggery zůstávají netknuté. Ověřeno 2. 10. 2026 na LLC (build 101.103.54800):
soubor vzniká v `profile\\`, 332 B, obě značky sedí, čas běží po 2 s, relikvie
sebraná mnichem se v něm objeví hned (atribut 7 = `cAttributeRelics`).

Totéž má jednou dělat web sám při nahrání každé verze scénáře Diplomacie
(podprojekt 2): kopie se sondou je to, co host stahuje; originál zůstává.

Použití: python sonda.py <scénář.aoe2scenario> [výstup.aoe2scenario]
Vyžaduje: pip install AoE2ScenarioParser==0.9.2
"""

import os
import sys

XS_SONDA = r"""
// Sonda Diplomacie (rob-aoe-web): kazde 2 herni sekundy prepise soubor
// profile\<scenar>.xsdat. Rozlozeni: int verze (1) | int cas
// | 8x (float relikvie, int zije) | 64x int diplomacie(a, b) | int cas.
// Atribut 7 = relikvie (cAttributeRelics).
void sondaZapis() {
  xsCreateFile(false);
  int t = xsGetGameTime();
  xsWriteInt(1);
  xsWriteInt(t);
  for (p = 1; < 9) {
    xsWriteFloat(xsPlayerAttribute(p, 7));
    if (xsGetPlayerInGame(p)) xsWriteInt(1); else xsWriteInt(0);
  }
  for (a = 1; < 9) {
    for (b = 1; < 9) {
      xsWriteInt(xsGetDiplomacy(a, b));
    }
  }
  xsWriteInt(t);
  xsCloseFile();
}
rule _sondaTik
  active
  minInterval 2
  maxInterval 2
{
  sondaZapis();
}
"""


def pribal_sondu(vstup: str, vystup: str) -> int:
    """Načte scénář, přidá trigger se sondou a zapíše kopii. Vrací počet triggerů po úpravě."""
    from AoE2ScenarioParser.scenarios.aoe2_de_scenario import AoE2DEScenario

    scenar = AoE2DEScenario.from_file(vstup)
    scenar.xs_manager.add_script(xs_string=XS_SONDA)
    scenar.write_to_file(vystup)
    return len(scenar.trigger_manager.triggers)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    vstup = sys.argv[1]
    koren, pripona = os.path.splitext(vstup)
    vystup = sys.argv[2] if len(sys.argv) > 2 else f"{koren}-sonda{pripona}"
    pocet = pribal_sondu(vstup, vystup)
    print(f"{vystup}: {pocet} triggerů (poslední je XS SCRIPT), soubor sondy bude profile\\{os.path.splitext(os.path.basename(vystup))[0]}.xsdat")


if __name__ == "__main__":
    main()

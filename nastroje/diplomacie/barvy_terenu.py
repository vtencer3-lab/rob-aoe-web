# -*- coding: utf-8 -*-
"""Barvy minimapy podle terénu z dat hry → src/diplomacie/barvy_terenu.json.

Spouští vývojář na stroji s nainstalovanou hrou (kontejner hru nemá).
Každý terén v empires2_x2_p1.dat má `colors` = tři indexy do palety
original.pal; první dává barvu minimapy (ověřeno 1. 10. 2026, spec §2.4).

  pip install genieutils-py==0.1.2
  python nastroje/diplomacie/barvy_terenu.py
"""
import json
from pathlib import Path

from genieutils.datfile import DatFile

HRA = Path(r"C:/Program Files (x86)/Steam/steamapps/common/AoE2DE/resources/_common")
VYSTUP = Path(__file__).resolve().parents[2] / "src/diplomacie/barvy_terenu.json"


def paleta(cesta: Path) -> list[tuple[int, int, int]]:
    radky = cesta.read_text(encoding="ascii").split("\n")
    assert radky[0].strip() == "JASC-PAL", "original.pal není JASC paleta"
    return [tuple(int(c) for c in r.split()) for r in radky[3:] if len(r.split()) == 3]


def main() -> None:
    pal = paleta(HRA / "palettes/original.pal")
    dat = DatFile.parse(str(HRA / "dat/empires2_x2_p1.dat"))
    barvy = {}
    for i, t in enumerate(dat.terrain_block.terrains):
        if not t.name:
            continue
        r, g, b = pal[t.colors[0]]
        barvy[str(i)] = [r, g, b]
    VYSTUP.write_text(json.dumps(barvy, indent=0, sort_keys=True), encoding="utf-8")
    print(f"zapsáno {len(barvy)} terénů do {VYSTUP}")


if __name__ == "__main__":
    main()

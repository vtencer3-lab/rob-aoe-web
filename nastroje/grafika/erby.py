# -*- coding: utf-8 -*-
"""Erby civilizací (kulaté ikony z lobby) ze hry do webu, v plné velikosti.

Zdroj: `resources/_common/wpfg/resources/civ_techtree/menu_techtree_<slug>.png`
(bez `_hover`/`_pressed`), ve hře jen 104×104 px — větší kulaté erby hra nemá
(velké štítové `civ_emblems/*.png` 450×280 jsou jiná grafika). Slugy jsou
herní a web je zná (`web/src/civErby.ts`: berber, inca, mayans, indians).
Nic se nezmenšuje (uživatel 15. 9. 2026: „v maximální velikosti, kterou hra má“).

  python nastroje/grafika/erby.py
"""
from pathlib import Path

from PIL import Image

HRA = Path(r"C:/Program Files (x86)/Steam/steamapps/common/AoE2DE/resources/_common/wpfg/resources/civ_techtree")
REPO = Path(__file__).resolve().parents[2]
VYSTUP = REPO / "web/src/assets/civ"
# Herní volby, které web nenabízí (vlastní, vypnuto, plně náhodná, zrcadlo).
VYNECHAT = {"custom", "disabled", "fullrandom", "mirror"}


def main() -> None:
    VYSTUP.mkdir(parents=True, exist_ok=True)
    celkem = 0
    pocet = 0
    for zdroj in sorted(HRA.glob("menu_techtree_*.png")):
        if zdroj.stem.endswith(("_hover", "_pressed")):
            continue
        slug = zdroj.stem.removeprefix("menu_techtree_")
        if slug in VYNECHAT:
            continue
        im = Image.open(zdroj).convert("RGBA")
        cil = VYSTUP / f"{slug}.webp"
        im.save(cil, "WEBP", quality=90, method=6)
        celkem += cil.stat().st_size
        pocet += 1
    print(f"zapsáno {pocet} erbů, {celkem / 1024:.0f} kB do {VYSTUP}")


if __name__ == "__main__":
    main()

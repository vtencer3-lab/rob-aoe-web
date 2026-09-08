# -*- coding: utf-8 -*-
"""Kontaktní list z obrázků — VŽDY V PLNÉ VELIKOSTI, nic se nezmenšuje.

⚠ Pravidlo uživatele (platí trvale): náhledy a montáže se NEZMENŠUJÍ — na 4K
monitoru se posuzuje detail, ze zmenšeniny se rozhodnout nedá.

Použití:
  python scripts/dev/kontaktni_list.py vystup.png obr1.png obr2.png ...
  python scripts/dev/kontaktni_list.py vystup.png slozka/*.png --sloupce 9
  python scripts/dev/kontaktni_list.py vystup.png a.png b.png --bez-popisku

Popisky se berou ze jmen souborů (bez přípony); `--popisky` je přebije.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

MEZERA = 16
PRUH = 30            # výška proužku s popiskem
POZADI = (18, 18, 18)
PISMO = (235, 215, 155)


def kontaktni_list(cesty: list[Path], sloupce: int, popisky: list[str] | None,
                   bez_popisku: bool) -> Image.Image:
    obrazky = [Image.open(p).convert("RGB") for p in cesty]
    jmena = popisky or [p.stem for p in cesty]
    pruh = 0 if bez_popisku else PRUH
    sloupce = sloupce or len(obrazky)

    rady = [obrazky[i:i + sloupce] for i in range(0, len(obrazky), sloupce)]
    jm_rady = [jmena[i:i + sloupce] for i in range(0, len(jmena), sloupce)]
    sirka = max(sum(o.width for o in r) + MEZERA * (len(r) + 1) for r in rady)
    vyska = sum(max(o.height for o in r) + pruh + MEZERA for r in rady) + MEZERA

    plat = Image.new("RGB", (sirka, vyska), POZADI)
    kresba = ImageDraw.Draw(plat)
    y = MEZERA
    for r, jm in zip(rady, jm_rady):
        x = MEZERA
        for o, t in zip(r, jm):
            if pruh:
                kresba.text((x + 2, y + 6), t, fill=PISMO)
            plat.paste(o, (x, y + pruh))
            x += o.width + MEZERA
        y += max(o.height for o in r) + pruh + MEZERA
    return plat


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("vystup", type=Path)
    ap.add_argument("obrazky", type=Path, nargs="+")
    ap.add_argument("--sloupce", type=int, default=0, help="0 = vše do jedné řady")
    ap.add_argument("--popisky", nargs="*", help="vlastní popisky (jinak jména souborů)")
    ap.add_argument("--bez-popisku", action="store_true")
    a = ap.parse_args()

    chybi = [p for p in a.obrazky if not p.exists()]
    if chybi:
        raise SystemExit("CHYBA: neexistuje: " + ", ".join(str(p) for p in chybi))
    list_ = kontaktni_list(a.obrazky, a.sloupce, a.popisky, a.bez_popisku)
    a.vystup.parent.mkdir(parents=True, exist_ok=True)
    list_.save(a.vystup)
    print(f"-> {a.vystup} ({list_.width}x{list_.height}, {len(a.obrazky)} obrázků, plná velikost)")


if __name__ == "__main__":
    main()

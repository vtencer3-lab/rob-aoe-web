# -*- coding: utf-8 -*-
"""Vytáhne z loga barevnou paletu, ať na ni jde navázat zbytek grafiky.

Neshlukuje slepě: obrázek se rozdělí do pásem podle odstínu a jasu, protože
u heraldiky nejde o nejčastější barvy, ale o role — zlato, krev, purpur,
pergamen, obrys. Nejčastější barva bývá pozadí, které nás nezajímá.

  python paleta.py logo.png [-n 12]
"""
import argparse
import colorsys
from collections import Counter
from pathlib import Path

from PIL import Image

# Role, které v heraldice hledáme: (jméno, rozsah odstínu ve stupních, min. sytost, rozsah jasu)
ROLE = [
    ("zlato-svetle", (35, 60), 0.35, (0.72, 1.00)),
    ("zlato", (35, 60), 0.45, (0.50, 0.72)),
    ("zlato-stin", (25, 50), 0.40, (0.25, 0.50)),
    ("krev-svetla", (0, 14), 0.55, (0.45, 0.75)),
    ("krev", (0, 14), 0.60, (0.25, 0.45)),
    ("krev-tmava", (0, 16), 0.45, (0.10, 0.25)),
    ("purpur-svetly", (255, 290), 0.25, (0.60, 0.95)),
    ("purpur", (255, 290), 0.35, (0.35, 0.60)),
    ("pergamen", (30, 55), 0.10, (0.80, 1.00)),
    ("obrys", (0, 360), 0.00, (0.00, 0.14)),
]


def hsv(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    h, s, v = colorsys.rgb_to_hsv(*(k / 255 for k in rgb))
    return h * 360, s, v


def v_rozsahu(uhel: float, rozsah: tuple[float, float]) -> bool:
    zac, kon = rozsah
    return zac <= uhel <= kon if zac <= kon else uhel >= zac or uhel <= kon


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("logo", type=Path)
    ap.add_argument("-n", type=int, default=6, help="kolik nejčastějších barev role vypsat")
    args = ap.parse_args()

    im = Image.open(args.logo).convert("RGBA")
    # Zmenšit kvůli rychlosti, ale ne pod rozumný detail; průhledné pixely zahodit.
    im.thumbnail((512, 512), Image.LANCZOS)
    pixely = [(r, g, b) for r, g, b, a in im.getdata() if a > 200]
    print(f"{args.logo.name}: {im.size[0]}x{im.size[1]}, {len(pixely)} neprůhledných pixelů\n")

    kose: dict[str, Counter] = {jmeno: Counter() for jmeno, *_ in ROLE}
    for rgb in pixely:
        h, s, v = hsv(rgb)
        for jmeno, uhly, min_s, jasy in ROLE:
            if v_rozsahu(h, uhly) and s >= min_s and jasy[0] <= v <= jasy[1]:
                # Kvantizace na 8 úrovní, ať se blízké odstíny slijí do jednoho zástupce.
                kose[jmeno][tuple(k // 8 * 8 for k in rgb)] += 1
                break

    for jmeno, *_ in ROLE:
        nejcastejsi = kose[jmeno].most_common(args.n)
        if not nejcastejsi:
            print(f"{jmeno:16s} —")
            continue
        podil = sum(p for _, p in kose[jmeno].items()) / len(pixely) * 100
        barvy = "  ".join(f"#{r:02x}{g:02x}{b:02x}" for (r, g, b), _ in nejcastejsi)
        print(f"{jmeno:16s} {podil:5.1f}%  {barvy}")


if __name__ == "__main__":
    main()

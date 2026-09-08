# -*- coding: utf-8 -*-
"""Kontaktní list obrázků na šachovnici, aby byla vidět průhlednost.

Náhledy se NEZMENŠUJÍ pod 100 %, jen se zmenší to, co se nevejde do buňky —
z podškálované montáže se detail posoudit nedá.

Použití:
  python prehled.py vystup.png obr1.png obr2.png ...
  python prehled.py vystup.png "slozka/*.png" --sloupce 5 --bunka 320
"""
import argparse
import glob
from pathlib import Path

from PIL import Image, ImageDraw

SVETLA, TMAVA = (150, 150, 150), (110, 110, 110)
POZADI = (26, 23, 18)
POPISEK = 18


def sachovnice(velikost: tuple[int, int], krok: int = 12) -> Image.Image:
    im = Image.new("RGB", velikost, SVETLA)
    kresli = ImageDraw.Draw(im)
    for y in range(0, velikost[1], krok):
        for x in range(0, velikost[0], krok):
            if (x // krok + y // krok) % 2:
                kresli.rectangle((x, y, x + krok - 1, y + krok - 1), fill=TMAVA)
    return im


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("vystup", type=Path)
    ap.add_argument("obrazky", nargs="+")
    ap.add_argument("--sloupce", type=int, default=4)
    ap.add_argument("--bunka", type=int, default=360)
    args = ap.parse_args()

    cesty: list[Path] = []
    for vzor in args.obrazky:
        nalezene = sorted(glob.glob(vzor))
        cesty.extend(Path(n) for n in nalezene) if nalezene else cesty.append(Path(vzor))
    cesty = [c for c in cesty if c.exists()]
    if not cesty:
        raise SystemExit("Žádné obrázky.")

    bunka = args.bunka
    sloupce = min(args.sloupce, len(cesty))
    radky = (len(cesty) + sloupce - 1) // sloupce
    vyska_bunky = bunka + POPISEK
    list_ = Image.new("RGB", (sloupce * bunka, radky * vyska_bunky), POZADI)
    kresli = ImageDraw.Draw(list_)

    for i, cesta in enumerate(cesty):
        im = Image.open(cesta).convert("RGBA")
        puvodni = im.size
        if max(im.size) > bunka - 16:
            m = (bunka - 16) / max(im.size)
            im = im.resize((max(1, int(im.width * m)), max(1, int(im.height * m))), Image.LANCZOS)
        podklad = sachovnice(im.size)
        podklad.paste(im, (0, 0), im)
        x = (i % sloupce) * bunka + (bunka - im.width) // 2
        y = (i // sloupce) * vyska_bunky + (bunka - im.height) // 2
        list_.paste(podklad, (x, y))
        kresli.text(((i % sloupce) * bunka + 6, (i // sloupce) * vyska_bunky + bunka + 2),
                    f"{cesta.name}  {puvodni[0]}x{puvodni[1]}", fill=(232, 224, 208))

    args.vystup.parent.mkdir(parents=True, exist_ok=True)
    list_.save(args.vystup)
    print(f"{args.vystup}  {list_.size[0]}x{list_.size[1]}  ({len(cesty)} obrázků)")


if __name__ == "__main__":
    main()

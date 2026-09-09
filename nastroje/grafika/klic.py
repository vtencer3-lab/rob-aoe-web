# -*- coding: utf-8 -*-
"""Vyřízne objekt z černého pozadí a ořízne ho na obsah.

Difuze neumí průhlednost, takže se assety generují na černé pozadí a alfa se
dodělá až tady. Prahování podle jasu tu nejde použít — rám i praporec mají
vlastní tmavá místa, která by zprůhledněla. Proto záplava (flood fill) od
rohů obrázku: pozadí je souvislá plocha, kdežto tmavý stín uvnitř objektu ne.

  python klic.py vstup.png -o vystup.png
  python klic.py vstup.png -o vystup.png --prah 60 --bez-orezu
  python klic.py slozka/*.png -o vystup_slozka/
"""
import argparse
import glob
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def klicuj(im: Image.Image, prah: int = 70, rozmaz: float = 0.8) -> Image.Image:
    """Průhledné tam, kam dosáhne záplava od rohů obrázku."""
    im = im.convert("RGBA")
    sedy = im.convert("L")
    znacka = sedy.copy()
    for bod in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]:
        if znacka.getpixel(bod) < 255:
            ImageDraw.floodfill(znacka, bod, 255, thresh=prah)

    puvodni, oznacene = sedy.load(), znacka.load()
    maska = Image.new("L", im.size, 255)
    px = maska.load()
    for y in range(im.height):
        for x in range(im.width):
            if oznacene[x, y] == 255 and puvodni[x, y] < 255:
                px[x, y] = 0

    im.putalpha(maska.filter(ImageFilter.GaussianBlur(rozmaz)))
    return im


def orez(im: Image.Image, prah_alfy: int = 24) -> Image.Image:
    """Ořez podle prahované alfy — poloprůhledný lem by jinak nechal objekt malý."""
    bbox = im.getchannel("A").point(lambda a: 255 if a > prah_alfy else 0).getbbox()
    return im.crop(bbox) if bbox else im


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("vstup", nargs="+")
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("--prah", type=int, default=70)
    ap.add_argument("--rozmaz", type=float, default=0.8)
    ap.add_argument("--bez-orezu", action="store_true")
    ap.add_argument("--alfa-ze-vstupu", action="store_true",
                    help="pozadí už odstranil někdo jiný (Scenario); jen ořezat na obsah")
    args = ap.parse_args()

    cesty: list[Path] = []
    for vzor in args.vstup:
        nalezene = sorted(glob.glob(vzor))
        cesty.extend(Path(n) for n in nalezene) if nalezene else cesty.append(Path(vzor))

    do_slozky = len(cesty) > 1 or args.out.suffix == ""
    if do_slozky:
        args.out.mkdir(parents=True, exist_ok=True)

    for cesta in cesty:
        im = Image.open(cesta).convert("RGBA")
        if not args.alfa_ze_vstupu:
            im = klicuj(im, args.prah, args.rozmaz)
        if not args.bez_orezu:
            im = orez(im)
        cil = args.out / f"{cesta.stem}.png" if do_slozky else args.out
        cil.parent.mkdir(parents=True, exist_ok=True)
        im.save(cil)
        pruhledne = sum(1 for a in im.getchannel("A").getdata() if a < 16) / (im.width * im.height)
        print(f"{cil.name}  {im.size[0]}x{im.size[1]}  průhledných {pruhledne * 100:.0f} %")


if __name__ == "__main__":
    main()

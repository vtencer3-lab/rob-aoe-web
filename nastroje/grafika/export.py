# -*- coding: utf-8 -*-
"""Převede hotový asset do webp pro web a řekne, kolik váží.

Proč webp: malovaná grafika s alfou v PNG váží násobky toho, co ve webp, a
tahle stránka se otevírá na začátku streamu, kdy nikdo nechce čekat. Kvalita
se volí podle role — pozadí snese víc ztráty než zlatá linka rámu.

  python export.py pozadi.png -o ../../web/src/assets/ui/pozadi.webp -q 82 --sirka 2560
  python export.py ram.png -o ../../web/src/assets/ui/ram.webp -q 92
  python export.py textura.png -o ... --bezesve      # zrcadlově prolnout na dlaždici
"""
import argparse
from pathlib import Path

from PIL import Image


def bezesve(im: Image.Image) -> Image.Image:
    """Zrcadlové prolnutí v obou osách: dlaždice pak navazuje sama na sebe.

    Ofsetové prolnutí by u malovaných textur nechalo viditelný šev, protože
    obě poloviny mají jiné osvětlení. Zrcadlo je souměrné, takže okraje sedí
    přesně; cenou je souměrnost vzoru, která u jemné textury není poznat.
    """
    import numpy as np

    a = np.asarray(im.convert("RGB")).astype(np.float32)
    for osa in (1, 0):
        n = a.shape[osa]
        r = np.linspace(0.0, 1.0, n, dtype=np.float32)
        r = r * r * (3 - 2 * r)
        w = r.reshape((1, n, 1) if osa == 1 else (n, 1, 1))
        a = (1 - w) * a + w * np.flip(a, axis=osa)
    return Image.fromarray(a.astype("uint8"), "RGB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("vstup", type=Path)
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("-q", "--kvalita", type=int, default=88)
    ap.add_argument("--sirka", type=int, default=0, help="přeškálovat na tuhle šířku")
    ap.add_argument("--vyska", type=int, default=0)
    ap.add_argument("--bezesve", action="store_true")
    ap.add_argument("--bezztratove", action="store_true")
    args = ap.parse_args()

    im = Image.open(args.vstup)
    im = im.convert("RGBA" if "A" in im.getbands() else "RGB")

    if args.bezesve:
        im = bezesve(im)
    if args.sirka or args.vyska:
        s = args.sirka or round(im.width * args.vyska / im.height)
        v = args.vyska or round(im.height * args.sirka / im.width)
        im = im.resize((s, v), Image.LANCZOS)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.bezztratove:
        im.save(args.out, "WEBP", lossless=True, method=6)
    else:
        im.save(args.out, "WEBP", quality=args.kvalita, method=6)
    kb = args.out.stat().st_size / 1024
    print(f"{args.out.name}  {im.size[0]}x{im.size[1]}  {kb:.0f} kB")


if __name__ == "__main__":
    main()

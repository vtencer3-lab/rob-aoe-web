# -*- coding: utf-8 -*-
"""Vsadí heraldický znak na praporce v malovaném pozadí.

Proč ručně a ne promptem: difuzní model nakreslí lva s jedním ocasem, i když
se v promptu dvakrát řekne, že má mít dva. Český lev je státní symbol a jeho
dva ocasy nejsou detail, na kterém by se dalo slevit. Znak se proto vygeneruje
zvlášť (tam vychází správně, protože je jediným motivem), vyřízne se z rudého
pole a nalepí se na prázdné praporce.

Aby znak na látce nevypadal jako nálepka, násobí se místním jasem plátna —
záhyby a stíny praporce tak prosvítají skrz.

Zadání praporců je JSON: pro každý čtyři rohy v pixelech pozadí, v pořadí
levý horní, pravý horní, pravý dolní, levý dolní.

  python vsad_znak.py pozadi.png lev.png -z praporce.json -o hotovo.png
  python vsad_znak.py pozadi.png lev.png -z praporce.json -o hotovo.png --sila 0.9 --nahled
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def vyrizni_znak(cesta: Path, prah_syteho: float = 0.28) -> Image.Image:
    """Z obrázku „bílý lev na rudém poli“ udělá RGBA s průhledným pozadím.

    Klíčuje se podle sytosti, ne podle jasu: lev je bílý až šedý (nízká
    sytost), rudé pole a zlatá koruna jsou syté. Zlato je ale součást znaku,
    takže se z výběru vyjímá podle odstínu.
    """
    im = Image.open(cesta).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255.0
    maxv = a.max(axis=2)
    minv = a.min(axis=2)
    sytost = np.where(maxv > 0, (maxv - minv) / np.maximum(maxv, 1e-6), 0)
    cervena = (a[..., 0] > a[..., 1] + 0.12) & (a[..., 0] > a[..., 2] + 0.12)
    zlata = (a[..., 0] > 0.45) & (a[..., 1] > 0.32) & (a[..., 2] < 0.45) & (a[..., 1] > a[..., 2] + 0.12)

    pozadi = cervena & (sytost > prah_syteho) & ~zlata
    alfa = (~pozadi).astype(np.float32)
    rgba = np.dstack([np.asarray(im), (alfa * 255).astype(np.uint8)])
    out = Image.fromarray(rgba, "RGBA")
    # Změkčit okraj o pixel, ať nedrží zubatá hrana z prahování.
    out.putalpha(out.getchannel("A").filter(ImageFilter.GaussianBlur(0.7)))
    bbox = out.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    return out.crop(bbox) if bbox else out


def perspektiva(znak: Image.Image, rohy, velikost) -> Image.Image:
    """Natáhne znak do čtyřúhelníku daného rohy, na plátno `velikost`."""
    s, v = znak.size
    zdroj = [(0, 0), (s, 0), (s, v), (0, v)]
    # PIL chce koeficienty pro transformaci CÍL -> ZDROJ.
    matice = []
    for (x, y), (u, w) in zip(rohy, zdroj):
        matice.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        matice.append([0, 0, 0, x, y, 1, -w * x, -w * y])
    A = np.array(matice, dtype=np.float64)
    B = np.array(zdroj, dtype=np.float64).reshape(8)
    koef = np.linalg.solve(A, B)
    return znak.transform(velikost, Image.PERSPECTIVE, koef, Image.BICUBIC)


def vsad(pozadi: Image.Image, znak: Image.Image, rohy, sila: float) -> Image.Image:
    """Nalepí znak do čtyřúhelníku a nechá skrz něj prosvítat záhyby látky."""
    natazeny = perspektiva(znak, rohy, pozadi.size)
    zn = np.asarray(natazeny).astype(np.float32) / 255.0
    pz = np.asarray(pozadi.convert("RGB")).astype(np.float32) / 255.0

    # Jas látky pod znakem, normovaný na svůj medián: >1 je vypouklý záhyb,
    # <1 stín. Tím se znak „obalí“ kolem látky místo aby na ní ležel plochý.
    jas = pz.mean(axis=2)
    maska = zn[..., 3] > 0.02
    if not maska.any():
        return pozadi
    stred = float(np.median(jas[maska]))
    modulace = np.clip(jas / max(stred, 1e-3), 0.45, 1.6)[..., None]

    barva = np.clip(zn[..., :3] * modulace, 0, 1)
    alfa = (zn[..., 3] * sila)[..., None]
    vysledek = pz * (1 - alfa) + barva * alfa
    return Image.fromarray((vysledek * 255).astype(np.uint8), "RGB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pozadi", type=Path)
    ap.add_argument("znak", type=Path)
    ap.add_argument("-z", "--zadani", type=Path, required=True,
                    help="JSON se seznamem praporců: [{\"rohy\": [[x,y],...4], \"sila\": 0.95}]")
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("--sila", type=float, default=0.95, help="výchozí krytí znaku")
    ap.add_argument("--nahled", action="store_true", help="obtáhnout zadané čtyřúhelníky")
    args = ap.parse_args()

    pozadi = Image.open(args.pozadi).convert("RGB")
    znak = vyrizni_znak(args.znak)
    print(f"znak po vyříznutí: {znak.size[0]}x{znak.size[1]}")

    praporce = json.loads(args.zadani.read_text(encoding="utf-8"))
    for i, p in enumerate(praporce):
        rohy = [tuple(r) for r in p["rohy"]]
        pozadi = vsad(pozadi, znak, rohy, float(p.get("sila", args.sila)))
        print(f"  praporec {i + 1}: {rohy}")

    if args.nahled:
        from PIL import ImageDraw
        kresli = ImageDraw.Draw(pozadi)
        for p in praporce:
            kresli.polygon([tuple(r) for r in p["rohy"]], outline=(0, 255, 0))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    pozadi.save(args.out)
    print(f"{args.out}  {pozadi.size[0]}x{pozadi.size[1]}")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""Z vygenerovaného praporce udělá trojdílný pás, který jde natáhnout do šířky.

Nadpis v záhlaví je pokaždé jinak dlouhý, takže praporec pod ním musí růst.
Roztažení celého obrázku ale rozmaže výšivku a rozjede poměry — proto se
z předlohy vezmou jen dva krajní díly (zlaté nárožníky s cípy) a jeden
prostřední proužek, který se opakuje.

Aby opakování nebylo vidět, dělají se dvě věci:

* z prostředního proužku se odečte podélný světelný přechod (uprostřed byla
  látka světlejší než u krajů, po dlaždicování z toho byly pruhy),
* šířka proužku se změří tak, aby odpovídala celému počtu růží ve výšivce —
  vzor pak navazuje sám na sebe bez zrcadlení.

  python praporec.py praporec2_04.png -o praporec.png --orez 250,1800
  python praporec.py praporec2_04.png -o praporec.png --cap 330 --nahled zk.png
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def klicuj(im: Image.Image, prah: int = 26) -> Image.Image:
    """Průhledné pozadí: záplava od rohů. Prahování by sežralo tmavé záhyby."""
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
    im.putalpha(maska.filter(ImageFilter.GaussianBlur(0.7)))
    return im


def perioda_vzoru(im: Image.Image, od: float = 0.45, do: float = 0.7,
                  min_p: int = 40, max_p: int = 400) -> int:
    """Změří, po kolika pixelech se vodorovně opakuje výšivka.

    Bere pás obrázku, kde leží zlatá bordura, spočítá jeho svislý průměr
    a hledá posun s nejlepší shodou (autokorelace). Bez toho by dlaždice
    končila v půlce růže.
    """
    a = np.asarray(im.convert("L")).astype(np.float32)
    pas = a[int(a.shape[0] * od):int(a.shape[0] * do), :].mean(axis=0)
    pas = pas - pas.mean()
    nejlepsi, skore = min_p, -1e18
    for p in range(min_p, min(max_p, len(pas) // 3)):
        shoda = float(np.dot(pas[:-p], pas[p:]) / (len(pas) - p))
        if shoda > skore:
            nejlepsi, skore = p, shoda
    return nejlepsi


def srovnej_na_kraj(dlazdice: Image.Image, cap: Image.Image) -> Image.Image:
    """Posune tón dlaždice po řádcích na poslední sloupec krajního dílu.

    Vyhlazená dlaždice má jiný průměrný jas než nárožník, ze kterého vychází,
    a na styku pak byl vidět svislý schod. Posouvá se jen tón, kresba zůstává.
    """
    a = np.asarray(dlazdice.convert("RGBA")).astype(np.float32)
    c = np.asarray(cap.convert("RGBA")).astype(np.float32)
    okraj = c[:, -1:, :3]
    ted = a[:, :, :3].mean(axis=1, keepdims=True)
    # Posun jen tam, kde je dlaždice krycí — v průhledných místech nemá smysl.
    kryci = (a[:, :, 3:4] > 8)
    a[:, :, :3] = np.where(kryci, np.clip(a[:, :, :3] + (okraj - ted), 0, 255), a[:, :, :3])
    return Image.fromarray(a.astype("uint8"), "RGBA")


def vyhlad_podel(pruh: Image.Image, sila: float) -> Image.Image:
    """Odečte podélný světelný přechod, aby dlaždice nedělaly pruhy."""
    if sila <= 0:
        return pruh
    a = np.asarray(pruh.convert("RGBA")).astype(np.float32)
    radkovy = a[:, :, :3].mean(axis=1, keepdims=True)
    a[:, :, :3] = np.clip((1 - sila) * a[:, :, :3] + sila * radkovy, 0, 255)
    return Image.fromarray(a.astype("uint8"), "RGBA")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("vstup", type=Path)
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("--orez", default=None, help="x1,x2 — odříznout přečnívající tyč")
    ap.add_argument("--cap", type=int, default=330, help="šířka krajního dílu")
    ap.add_argument("--dlazdic", type=int, default=3, help="kolik period vzoru vzít do dlaždice")
    ap.add_argument("--vyhlad", type=float, default=0.75)
    ap.add_argument("--prah", type=int, default=26)
    ap.add_argument("--nahled", type=Path, default=None)
    ap.add_argument("--alfa-ze-vstupu", action="store_true",
                    help="pozadí už odstranil někdo jiný (Scenario); vlastní klíčování neprovádět")
    args = ap.parse_args()

    im = Image.open(args.vstup)
    if args.orez:
        x1, x2 = (int(v) for v in args.orez.split(","))
        im = im.crop((x1, 0, x2, im.height))
    # Pozadí buď odstraní Scenario (--alfa-ze-vstupu), nebo záplava tady.
    if not args.alfa_ze_vstupu:
        im = klicuj(im, args.prah)
    else:
        im = im.convert("RGBA")
    bbox = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    print(f"po ořezu: {im.size[0]}x{im.size[1]}")

    perioda = perioda_vzoru(im)
    dlazdice = perioda * args.dlazdic
    print(f"perioda výšivky: {perioda} px, dlaždice: {dlazdice} px")

    cap = args.cap
    levy = im.crop((0, 0, cap, im.height))
    # Prostředek se bere kus za nárožníkem, ať do dlaždice nespadne jeho konec.
    zac = cap + perioda
    stred = srovnej_na_kraj(vyhlad_podel(im.crop((zac, 0, zac + dlazdice, im.height)), args.vyhlad), levy)

    sirka = cap * 2 + dlazdice
    out = Image.new("RGBA", (sirka, im.height), (0, 0, 0, 0))
    out.paste(levy, (0, 0))
    out.paste(stred, (cap, 0))
    out.paste(levy.transpose(Image.FLIP_LEFT_RIGHT), (sirka - cap, 0))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out)
    print(f"{args.out}  {sirka}x{im.height}  (řez: 0 {cap} fill)")

    if args.nahled:
        sirka_zk, vyska_zk = 1400, im.height
        zk = Image.new("RGBA", (sirka_zk, vyska_zk), (60, 55, 80, 255))
        zk.alpha_composite(out.crop((0, 0, cap, im.height)), (0, 0))
        zk.alpha_composite(out.crop((sirka - cap, 0, sirka, im.height)), (sirka_zk - cap, 0))
        x = cap
        while x < sirka_zk - cap:
            kus = min(dlazdice, sirka_zk - cap - x)
            zk.alpha_composite(out.crop((cap, 0, cap + kus, im.height)), (x, 0))
            x += kus
        zk.convert("RGB").save(args.nahled)
        print(f"{args.nahled}  náhled {sirka_zk}x{vyska_zk}")


if __name__ == "__main__":
    main()

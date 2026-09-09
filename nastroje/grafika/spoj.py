# -*- coding: utf-8 -*-
"""Spojí obrázky vedle sebe (nebo pod sebe) do jednoho pásu.

K čemu: herní rozbalovátko je ve třech souborech — levý konec, střed
k opakování a pravý konec. CSS `border-image` ale chce jeden obrázek, ze
kterého si okraje ukrojí samo. Tenhle skript z dílů složí pás, který se dá
`border-image-slice` rozřezat zpátky.

  python spoj.py dropdown_left.png dropdown_center.png dropdown_right.png -o pole.png
  python spoj.py horni.png dolni.png -o sloupec.png --svisle
"""
import argparse
from pathlib import Path

from PIL import Image


def spoj(cesty: list[Path], svisle: bool) -> Image.Image:
    dily = [Image.open(c).convert("RGBA") for c in cesty]
    if svisle:
        sirka = max(d.width for d in dily)
        vyska = sum(d.height for d in dily)
    else:
        sirka = sum(d.width for d in dily)
        vyska = max(d.height for d in dily)

    pas = Image.new("RGBA", (sirka, vyska), (0, 0, 0, 0))
    posun = 0
    for d in dily:
        pas.paste(d, (0, posun) if svisle else (posun, 0))
        posun += d.height if svisle else d.width
    return pas


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("vstupy", nargs="+", type=Path)
    p.add_argument("-o", "--out", required=True, type=Path)
    p.add_argument("--svisle", action="store_true", help="skládat pod sebe místo vedle sebe")
    a = p.parse_args()

    pas = spoj(a.vstupy, a.svisle)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    pas.save(a.out)
    print(f"{a.out.name}  {pas.width}x{pas.height}  z {len(a.vstupy)} dílů")


if __name__ == "__main__":
    main()

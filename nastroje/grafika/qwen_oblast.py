# -*- coding: utf-8 -*-
"""Úprava JEDNOHO MÍSTA v obrázku přes Qwen — zbytek zůstane nedotčený.

`gen_qwen_edit.py` překresluje celé plátno, takže i drobná úprava rozhýbe
kompozici jinde (u banneru vítěze se při vyšším denoise změnil i medailon,
závěsy a odstíny). Tenhle skript proto:

  1. vyřízne obdélník kolem místa, které se má změnit,
  2. zvětší ho na rozlišení, se kterým model počítá (~1 MP),
  3. pošle ho do `gen_qwen_edit.py`,
  4. zmenší zpět a vloží do originálu přes rozostřenou masku.

Díky tomu je mimo vybraný obdélník výsledek totožný s originálem.

Použití:
  python scripts/dev/qwen_oblast.py vstup.png "prompt" --oblast 640,730,960,976 \\
      -o vystup.png [--denoise 0.7] [--feather 12] [--cil 1024] [-n 3]

`--oblast` je x1,y1,x2,y2 v pixelech ORIGINÁLU.
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("vstup", type=Path)
    ap.add_argument("prompt")
    ap.add_argument("--oblast", required=True, help="x1,y1,x2,y2 v pixelech originálu")
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("-n", "--count", type=int, default=1, help="kolik variant")
    ap.add_argument("--denoise", type=float, default=0.7)
    ap.add_argument("--cil", type=int, default=1024, help="delší strana výřezu pro model")
    ap.add_argument("--feather", type=int, default=12, help="rozostření okraje vložení (px)")
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--ref", type=Path, default=None,
                    help="druhý obrázek jako předloha detailu (Picture 2 pro model)")
    a = ap.parse_args()

    x1, y1, x2, y2 = (int(v) for v in a.oblast.split(","))
    orig = Image.open(a.vstup).convert("RGB")
    vyrez = orig.crop((x1, y1, x2, y2))
    mer = a.cil / float(max(vyrez.size))
    velky = vyrez.resize((round(vyrez.width * mer), round(vyrez.height * mer)),
                         Image.LANCZOS)

    tmp = Path(tempfile.gettempdir())
    src = tmp / "qwen_oblast_src.png"
    velky.save(src)
    print(f"výřez {vyrez.width}x{vyrez.height} -> {velky.width}x{velky.height}")

    for i in range(a.count):
        dst = tmp / f"qwen_oblast_out_{i}.png"
        # Generátor leží vedle tohoto skriptu, ne v cestě původního projektu.
        generator = Path(__file__).resolve().parent / "gen_qwen_edit.py"
        cmd = [sys.executable, str(generator), str(src), a.prompt,
               "--keep-size", "--pad", "0.12", "-o", str(dst),
               "--denoise", str(a.denoise)]
        if a.ref:
            cmd += ["--ref", str(a.ref)]
        if a.fast:
            cmd.append("--fast")
        if subprocess.run(cmd).returncode != 0:
            sys.exit("CHYBA: gen_qwen_edit.py selhal")

        upraveny = Image.open(dst).convert("RGB").resize(vyrez.size, Image.LANCZOS)
        # maska: uvnitř plné krytí, u okraje plynulý přechod do originálu
        maska = Image.new("L", vyrez.size, 0)
        okraj = a.feather
        maska.paste(255, (okraj, okraj, vyrez.width - okraj, vyrez.height - okraj))
        maska = maska.filter(ImageFilter.GaussianBlur(okraj * 0.6))

        vysledek = orig.copy()
        misto = Image.composite(upraveny, vyrez, maska)
        vysledek.paste(misto, (x1, y1))
        cil = a.out if a.count == 1 else a.out.with_name(f"{a.out.stem}_{i + 1}.png")
        vysledek.save(cil)
        print(f"-> {cil}")


if __name__ == "__main__":
    main()

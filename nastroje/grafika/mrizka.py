# -*- coding: utf-8 -*-
"""Z devíti dílů (rohy, strany, výplň) složí jeden obrázek pro CSS border-image.

Hra má rám rozřezaný na samostatné soubory — čtyři rohy, čtyři strany a
výplň. `border-image` chce jeden obrázek, ze kterého si díly ukrojí sám
podle `border-image-slice`. Tenhle skript je poskládá do mřížky 3×3, kde
každá buňka má stejnou stranu, takže slice je prostě ta strana.

Strany a výplň se roztahují na velikost buňky (v předloze mívají jiný
rozměr než rohy); rohy se vkládají tak, jak jsou.

  python mrizka.py --roh-lh tl.png --roh-ph tr.png --roh-ld bl.png --roh-pd br.png \\
      --hore top.png --dole bottom.png --vlevo left.png --vpravo right.png \\
      --vypln inlay.png -o ram.png
"""
import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    p = argparse.ArgumentParser()
    for prepinac in ("roh-lh", "roh-ph", "roh-ld", "roh-pd", "hore", "dole", "vlevo", "vpravo", "vypln"):
        p.add_argument(f"--{prepinac}", required=True, type=Path)
    p.add_argument("-o", "--out", required=True, type=Path)
    p.add_argument("--bunka", type=int, default=0, help="strana buňky; výchozí = šířka levého horního rohu")
    p.add_argument(
        "--orez",
        type=int,
        default=0,
        help="vzít z každého dílu jen vnější pás téhle šířky (zbytek dílu je výplň, která do rámu nepatří)",
    )
    a = p.parse_args()

    def nacti(cesta: Path, kde: tuple[int, int]) -> Image.Image:
        """Načte díl a s `--orez` z něj vezme jen vnější pás.

        Díly rámu nesou kolem ozdoby i kus výplně, která patří dovnitř
        desky, ne do rámečku. `kde` říká, ke které straně díl přiléhá
        (−1 vlevo/nahoře, 0 uprostřed, 1 vpravo/dole), aby se ořezávalo
        na správnou stranu.
        """
        im = Image.open(cesta).convert("RGBA")
        if a.orez <= 0:
            return im
        o = a.orez
        vx, vy = kde
        levo = 0 if vx <= 0 else im.width - o
        horu = 0 if vy <= 0 else im.height - o
        sirka = o if vx != 0 else im.width
        vyska = o if vy != 0 else im.height
        if vx == 0:
            levo = 0
        if vy == 0:
            horu = 0
        return im.crop((levo, horu, levo + sirka, horu + vyska))

    lh = nacti(a.roh_lh, (-1, -1))
    b = a.bunka or lh.width

    # Rohy zůstávají, jak jsou; strany a výplň se roztáhnou na buňku, protože
    # v předloze mají vlastní rozměry a v mřížce musí sedět na pixel.
    dily = {
        (0, 0): lh,
        (2, 0): nacti(a.roh_ph, (1, -1)),
        (0, 2): nacti(a.roh_ld, (-1, 1)),
        (2, 2): nacti(a.roh_pd, (1, 1)),
        (1, 0): nacti(a.hore, (0, -1)).resize((b, b)),
        (1, 2): nacti(a.dole, (0, 1)).resize((b, b)),
        (0, 1): nacti(a.vlevo, (-1, 0)).resize((b, b)),
        (2, 1): nacti(a.vpravo, (1, 0)).resize((b, b)),
        # Výplň do rámu nepatří — barvu desky kreslí CSS pod ním.
        (1, 1): Image.new("RGBA", (b, b), (0, 0, 0, 0)),
    }

    ram = Image.new("RGBA", (b * 3, b * 3), (0, 0, 0, 0))
    for (sloupec, radek), dil in dily.items():
        ram.paste(dil.resize((b, b)) if dil.size != (b, b) else dil, (sloupec * b, radek * b))

    a.out.parent.mkdir(parents=True, exist_ok=True)
    ram.save(a.out)
    print(f"{a.out.name}  {ram.width}x{ram.height}  (slice {b})")


if __name__ == "__main__":
    main()

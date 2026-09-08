# -*- coding: utf-8 -*-
"""Dávkové generování grafiky podle zadání v JSON, s manifestem a kontaktním listem.

Proč zvlášť od `gen_flux2.py`: jednotlivé volání se nedá zopakovat, protože
seed zmizí. Tady u každého souboru zůstane v `manifest.json` seed i celý
prompt, takže povedený kus jde kdykoliv dogenerovat znovu nebo z něj vyjít
img2img. Dávka je idempotentní — hotové soubory přeskakuje, takže přerušený
běh jde jen znovu spustit.

Zadání (JSON):
  {
    "pozadi": {
      "prompt": "…",
      "n": 8, "width": 1536, "height": 864,
      "lora": 0.0, "raw": true, "steps": 24, "guidance": 4.0
    }
  }

Použití:
  python davka.py zadani.json -o vystup/            # vše
  python davka.py zadani.json -o vystup/ pozadi ram # jen vybrané klíče
  python davka.py zadani.json -o vystup/ --list     # jen přeskládat kontaktní listy
"""
import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_flux2 import DEFAULTS, SUFFIX, generate, upload_image  # noqa: E402

MANIFEST = "manifest.json"


def nacti_manifest(slozka: Path) -> dict:
    cesta = slozka / MANIFEST
    return json.loads(cesta.read_text(encoding="utf-8")) if cesta.exists() else {}


def uloz_manifest(slozka: Path, data: dict) -> None:
    (slozka / MANIFEST).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def kontaktni_list(slozka: Path, klic: str) -> None:
    """Náhledy vedle sebe, ať se dá sada posoudit jedním pohledem."""
    from PIL import Image, ImageDraw

    obrazky = sorted(p for p in slozka.glob(f"{klic}_*.png") if p.name != f"{klic}_kontakt.png")
    if not obrazky:
        return
    bunka = 640
    sloupce = min(3, len(obrazky))
    radky = (len(obrazky) + sloupce - 1) // sloupce
    popisek = 20
    list_ = Image.new("RGB", (sloupce * bunka, radky * (bunka + popisek)), (26, 23, 18))
    kresli = ImageDraw.Draw(list_)
    for i, cesta in enumerate(obrazky):
        im = Image.open(cesta).convert("RGB")
        m = (bunka - 12) / max(im.size)
        im = im.resize((int(im.width * m), int(im.height * m)), Image.LANCZOS)
        x = (i % sloupce) * bunka + (bunka - im.width) // 2
        y = (i // sloupce) * (bunka + popisek) + (bunka - im.height) // 2
        list_.paste(im, (x, y))
        kresli.text(((i % sloupce) * bunka + 6, (i // sloupce) * (bunka + popisek) + bunka + 3),
                    cesta.stem, fill=(232, 224, 208))
    cil = slozka / f"{klic}_kontakt.png"
    list_.save(cil)
    print(f"  kontakt: {cil.name}  {list_.size[0]}x{list_.size[1]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("zadani", type=Path)
    ap.add_argument("klice", nargs="*", help="jen tyhle položky zadání")
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("--list", action="store_true", help="negenerovat, jen přeskládat kontaktní listy")
    args = ap.parse_args()

    zadani = json.loads(args.zadani.read_text(encoding="utf-8"))
    klice = args.klice or list(zadani)
    args.out.mkdir(parents=True, exist_ok=True)
    manifest = nacti_manifest(args.out)
    nahrane: dict[str, str] = {}

    for klic in klice:
        if klic not in zadani:
            print(f"!! {klic} v zadání není")
            continue
        if args.list:
            kontaktni_list(args.out, klic)
            continue

        polozka = zadani[klic]
        prompt = polozka["prompt"] + ("" if polozka.get("raw", True) else SUFFIX)
        pocet = int(polozka.get("n", 1))
        sirka = int(polozka.get("width", DEFAULTS["size"]))
        vyska = int(polozka.get("height", DEFAULTS["size"]))
        kroky = int(polozka.get("steps", DEFAULTS["steps"]))
        guidance = float(polozka.get("guidance", DEFAULTS["guidance"]))
        lora = float(polozka.get("lora", 0.0))
        ref = polozka.get("ref")
        denoise = float(polozka.get("denoise", 0.5))

        # Referenci stačí nahrát jednou; ComfyUI si ji drží pod vráceným jménem.
        if ref and klic not in nahrane:
            nahrane[klic] = upload_image(Path(ref))
        print(f"\n== {klic}  ({pocet}x {sirka}x{vyska}, lora {lora}{', ref ' + ref if ref else ''})")
        for i in range(pocet):
            cil = args.out / f"{klic}_{i:02d}.png"
            if cil.exists():
                print(f"  {cil.name} už je")
                continue
            seed = polozka.get("seed", random.randint(0, 2**63 - 1)) + (i if "seed" in polozka else 0)
            data = generate(prompt, seed, kroky, guidance, lora, sirka, vyska,
                            ref_name=nahrane.get(klic), denoise=denoise)
            cil.write_bytes(data)
            manifest[cil.name] = {"klic": klic, "seed": seed, "prompt": prompt, "lora": lora,
                                  "width": sirka, "height": vyska, "steps": kroky,
                                  "guidance": guidance, "ref": ref, "denoise": denoise if ref else None}
            uloz_manifest(args.out, manifest)
            print(f"  {cil.name}  seed={seed}")
        kontaktni_list(args.out, klic)


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""Náhledy minimap ze hry pro výběr mapy na webu.

Hra má ikony map v `resources/_common/wpfg/resources/mapicons/` pojmenované
anglickým názvem s předponou podle druhu (rm_ náhodné, rwm_ skutečný svět,
sm_ speciální, br_ battle royale). Web zná mapy podle id řetězce z jazykového
souboru (`src/shared/mapy.ts`), takže se tady název páruje na soubor a výsledek
se ukládá pod id: `web/src/assets/mapy/<id>.webp`.

  python nastroje/grafika/mapy_nahledy.py            # exportuje a vypíše, co se nespárovalo
  python nastroje/grafika/mapy_nahledy.py --jen-parovani   # nic nezapisuje

Když se název nespáruje ani po normalizaci, ani přibližně, zůstane bez
náhledu — web ukáže zástupný obrázek. Ručně dopárované případy jsou v RUCNE.
"""
import argparse
import difflib
import re
from pathlib import Path

from PIL import Image

HRA = Path(r"C:/Program Files (x86)/Steam/steamapps/common/AoE2DE/resources/_common/wpfg/resources/mapicons")
REPO = Path(__file__).resolve().parents[2]
MAPY_TS = REPO / "src/shared/mapy.ts"
VYSTUP = REPO / "web/src/assets/mapy"
VELIKOST = 192

# Názvy, které se na soubor nedají převést pravidlem (překlepy ve hře apod.).
RUCNE = {
    "Philippines": "rwm_phillipines",
    "Sea of Japan (East Sea)": "rwm_sea_of_japan",
    "Sprawling Streams": "sm_sprawling-stream",
    "Random Real World Map": "rwm_random_real_world_map",
    "BR Battle On Ice": "br_battle_on_the_ice",
    "BR Majapahit Empire": "br_the_majapahit_empire",
}


def nacti_mapy() -> dict[int, str]:
    text = MAPY_TS.read_text(encoding="utf-8")
    return {int(m.group(1)): m.group(2) for m in re.finditer(r'^\s+(\d+): "([^"]+)",', text, re.M)}


def normalizuj(nazev: str) -> str:
    n = nazev.lower()
    n = re.sub(r"\(.*?\)", "", n)
    n = n.replace("&", "and").replace("'", "")
    n = re.sub(r"[^a-z0-9]+", "_", n).strip("_")
    return n


def kmen(soubor: Path) -> str:
    return normalizuj(re.sub(r"^(rm|rwm|sm|br)_", "", soubor.stem))


def sparuj(mapy: dict[int, str], soubory: list[Path]) -> tuple[dict[int, Path], list[str]]:
    podle_kmene: dict[str, Path] = {}
    for s in soubory:
        podle_kmene.setdefault(kmen(s), s)
    podle_stemu = {s.stem.lower(): s for s in soubory}
    nalezeno: dict[int, Path] = {}
    chybi: list[str] = []
    for id_, nazev in mapy.items():
        if nazev in RUCNE:
            nalezeno[id_] = podle_stemu[RUCNE[nazev].lower()]
            continue
        k = normalizuj(re.sub(r"^BR\s+", "", nazev))
        if k in podle_kmene:
            nalezeno[id_] = podle_kmene[k]
            continue
        blizke = difflib.get_close_matches(k, podle_kmene.keys(), n=1, cutoff=0.9)
        if blizke:
            nalezeno[id_] = podle_kmene[blizke[0]]
            print(f"  ~ {nazev!r} → {podle_kmene[blizke[0]].name} (přibližně)")
            continue
        chybi.append(nazev)
    return nalezeno, chybi


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jen-parovani", action="store_true")
    args = ap.parse_args()

    mapy = nacti_mapy()
    soubory = [p for p in HRA.iterdir() if p.suffix.lower() == ".png" and re.match(r"^(rm|rwm|sm|br)_", p.name)]
    nalezeno, chybi = sparuj(mapy, soubory)
    print(f"map: {len(mapy)}, ikon: {len(soubory)}, spárováno: {len(nalezeno)}, bez náhledu: {len(chybi)}")
    for n in chybi:
        print(f"  – {n}")
    if args.jen_parovani:
        return

    VYSTUP.mkdir(parents=True, exist_ok=True)
    celkem = 0
    for id_, soubor in nalezeno.items():
        im = Image.open(soubor).convert("RGBA")
        im.thumbnail((VELIKOST, VELIKOST), Image.LANCZOS)
        cil = VYSTUP / f"{id_}.webp"
        im.save(cil, "WEBP", quality=82, method=6)
        celkem += cil.stat().st_size
    print(f"zapsáno {len(nalezeno)} souborů, {celkem / 1024:.0f} kB celkem do {VYSTUP}")


if __name__ == "__main__":
    main()

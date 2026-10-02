"""Čtečka souboru `profile\\<scénář>.xsdat`, který píše XS sonda Diplomacie.

Rozložení (XS v `sonda.py`): int verze (1) | int čas | 8× (float relikvie,
int žije) | 64× int diplomacie(a, b) | int čas. Čas je na začátku i na
konci: hra soubor přepisuje a zápis nemusí být atomický, čtení se bere jen
tehdy, když se obě hodnoty shodují. Soubor bez čísla verze (328 B, první
zkouška 2. 10. 2026) se čte taky.

Použití: python xsdat.py [cesta]   (výchozí: profile\\LLC-sonda.xsdat
aktuálního uživatele)
"""

import json
import os
import struct
import sys

POSTOJ = {0: "spojenec", 1: "neutral", 3: "nepritel"}


def cti_xsdat(data: bytes) -> dict:
    telo = 4 + 8 * 8 + 64 * 4 + 4
    if len(data) < telo:
        return {"platne": False, "duvod": f"krátký soubor: {len(data)} B, čekáno {telo} nebo {telo + 4} B"}
    pos = 0
    verze = 0
    if len(data) >= telo + 4:
        (verze,) = struct.unpack_from("<i", data, pos)
        pos += 4
    (cas,) = struct.unpack_from("<i", data, pos)
    pos += 4
    hraci = []
    for p in range(1, 9):
        relikvie, zije = struct.unpack_from("<fi", data, pos)
        pos += 8
        hraci.append({"hrac": p, "relikvie": int(relikvie), "zije": bool(zije)})
    diplomacie = []
    for a in range(8):
        radek = list(struct.unpack_from("<8i", data, pos))
        pos += 32
        diplomacie.append([POSTOJ.get(x, x) for x in radek])
    (cas2,) = struct.unpack_from("<i", data, pos)
    return {"platne": cas == cas2, "verze": verze, "cas": cas, "cas2": cas2, "hraci": hraci, "diplomacie": diplomacie, "bajtu": len(data)}


def main() -> None:
    cesta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ["USERPROFILE"], "Games", "Age of Empires 2 DE", "76561198014056480", "profile", "LLC-sonda.xsdat")
    data = open(cesta, "rb").read()
    print(json.dumps(cti_xsdat(data), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

"""Čtečka souboru `profile\\<scénář>.xsdat`, který píše XS sonda Diplomacie.

Rozložení (XS v `sonda.py`), verze 2: int verze | int čas | 8× (string
jméno, string barva, float relikvie, int žije) | 64× int diplomacie(a, b)
| int čas; string = uint32 délka + bajty. Verze 1 je totéž bez jmen a
barev, soubor bez čísla verze (328 B, první zkouška 2. 10. 2026) je verze 1.
Čas je na začátku i na konci: hra soubor přepisuje a zápis nemusí být
atomický, čtení se bere jen tehdy, když se obě hodnoty shodují. Čísla
hráčů jsou pořadí v lobby — identitu dává jméno a barva.

Použití: python xsdat.py [cesta]   (výchozí: profile\\LLC-sonda.xsdat
aktuálního uživatele)
"""

import json
import os
import struct
import sys

POSTOJ = {0: "spojenec", 1: "neutral", 3: "nepritel"}


def cti_xsdat(data: bytes) -> dict:
    try:
        return _cti(data)
    except struct.error as e:
        return {"platne": False, "duvod": f"useknutý nebo cizí soubor ({len(data)} B): {e}"}


def _retezec(data: bytes, pos: int) -> tuple[str, int]:
    (delka,) = struct.unpack_from("<I", data, pos)
    pos += 4
    if delka > 1024:
        raise struct.error(f"nesmyslná délka řetězce {delka}")
    return data[pos : pos + delka].decode("utf-8", "replace"), pos + delka


def _cti(data: bytes) -> dict:
    bez_verze = 4 + 8 * 8 + 64 * 4 + 4
    pos = 0
    verze = 1
    if len(data) != bez_verze:
        (verze,) = struct.unpack_from("<i", data, pos)
        pos += 4
    (cas,) = struct.unpack_from("<i", data, pos)
    pos += 4
    hraci = []
    for p in range(1, 9):
        jmeno = barva = None
        if verze >= 2:
            jmeno, pos = _retezec(data, pos)
            barva, pos = _retezec(data, pos)
        relikvie, zije = struct.unpack_from("<fi", data, pos)
        pos += 8
        hraci.append({"hrac": p, "jmeno": jmeno, "barva": barva, "relikvie": int(relikvie), "zije": bool(zije)})
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

"""Čtečka souboru `profile\\<scénář>.xsdat`, který píše XS sonda Diplomacie.

Rozložení verze 8 (XS v `src/diplomacie/sonda.xs`, přibaluje ho web);
verze 7 je totéž bez čísla hráče u relikvií (za x, y ještě float hráč);
verze 6 je totéž bez relikvií (int počet + počet× float x, float y za králi),
verze 5 navíc bez bloku králů (8× float x, float y za hráči):
int značka 0x44424F52 (bajty „ROBD“) | int verze | int čas | 8× int slot scénáře → číslo hráče ve hře | 8× (string
jméno, string barva, float relikvie, int žije) podle čísla hráče ve hře
| 64× int diplomacie(a, b) | 256× int proměnné triggerů | int čas;
string = uint32 délka + bajty. Verze 3 je totéž bez značky na začátku
(do 1.13.10-29.7, sondy ze scénářů JIN_DIPLO_<N>). Verze 2 je totéž bez převodu slotů a bez
proměnných, verze 1 navíc bez jmen a barev; soubor bez čísla verze (328 B,
první zkouška 2. 10. 2026) je verze 1. Super sondu (verze 100) čte
`supersonda.py`.
Čas je na začátku i na konci: hra soubor přepisuje a zápis nemusí být
atomický, čtení se bere jen tehdy, když se obě hodnoty shodují. Čísla
hráčů jsou pořadí v lobby — identitu dává slot (verze 3), jméno a barva.

Použití: python xsdat.py [cesta]   (výchozí: profile\\LLC-sonda.xsdat
aktuálního uživatele)
"""

import json
import os
import struct
import sys

POSTOJ = {0: "spojenec", 1: "neutral", 3: "nepritel"}
# Značka našich souborů (od verze 5): první int32, bajty „ROBD“.
ZNACKA = 0x44424F52


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
    if verze == ZNACKA:
        (verze,) = struct.unpack_from("<i", data, pos)
        pos += 4
        if verze not in (5, 6, 7, 8):
            return {"platne": False, "verze": verze, "duvod": f"náš soubor verze {verze}, čtečka zná 5–8"}
    elif verze not in (1, 2, 3):
        return {"platne": False, "verze": verze, "duvod": f"verze {verze}, čtečka zná 1–3 a 5 (super sondu čte supersonda.py)"}
    (cas,) = struct.unpack_from("<i", data, pos)
    pos += 4
    sloty = None
    if verze >= 3:
        sloty = list(struct.unpack_from("<8i", data, pos))
        pos += 32
    hraci = []
    for p in range(1, 9):
        jmeno = barva = None
        if verze >= 2:
            jmeno, pos = _retezec(data, pos)
            barva, pos = _retezec(data, pos)
        relikvie, zije = struct.unpack_from("<fi", data, pos)
        pos += 8
        hraci.append({"hrac": p, "jmeno": jmeno, "barva": barva, "relikvie": int(relikvie), "zije": bool(zije)})
    if verze >= 6:
        # Poloha prvního krále v dílcích; -1 = hráč krále nemá.
        for h in hraci:
            kx, ky = struct.unpack_from("<ff", data, pos)
            pos += 8
            h["kral"] = None if kx < 0 or ky < 0 else {"x": round(kx, 2), "y": round(ky, 2)}
    relikvie = None
    if verze >= 7:
        # Polohy relikvií na mapě (gaia, i nesené mnichem / v klášteře), nejvýš 32.
        (pocet,) = struct.unpack_from("<i", data, pos)
        pos += 4
        if not 0 <= pocet <= 32:
            raise struct.error(f"nesmyslný počet relikvií {pocet}")
        relikvie = []
        for _ in range(pocet):
            rx, ry = struct.unpack_from("<ff", data, pos)
            pos += 8
            zaznam = {"x": round(rx, 2), "y": round(ry, 2)}
            if verze >= 8:
                # Kdo relikvii nese nebo má v klášteře (číslo hráče ve hře), 0 = volná.
                (hrac,) = struct.unpack_from("<f", data, pos)
                pos += 4
                zaznam["hrac"] = int(round(hrac))
            relikvie.append(zaznam)
    kody = []
    for a in range(8):
        kody.append(list(struct.unpack_from("<8i", data, pos)))
        pos += 32
    promenne = None
    if verze >= 3:
        promenne = list(struct.unpack_from("<256i", data, pos))
        pos += 1024
    (cas2,) = struct.unpack_from("<i", data, pos)
    vysledek = {
        "platne": cas == cas2, "verze": verze, "cas": cas, "cas2": cas2, "hraci": hraci,
        "diplomacie": [[POSTOJ.get(x, x) for x in radek] for radek in kody], "diplomacieKody": kody, "bajtu": len(data),
    }
    if relikvie is not None:
        vysledek["relikvie"] = relikvie
    if verze >= 3:
        # sloty[i] = číslo hráče ve hře na slotu scénáře i + 1 (slot = barva v sestavě webu).
        vysledek["sloty"] = sloty
        vysledek["promenne"] = promenne
    return vysledek


def main() -> None:
    cesta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ["USERPROFILE"], "Games", "Age of Empires 2 DE", "76561198014056480", "profile", "LLC-sonda.xsdat")
    with open(cesta, "rb") as f:
        data = f.read()
    print(json.dumps(cti_xsdat(data), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

"""Statistiky ze záznamu hry (.aoe2record): hlavička + co kdo dělal.

Doplněk k `zaznam.py` (události) pro zjišťování, co všechno jde ze záznamu
vytěžit. Funguje i na kopii záznamu běžící hry.

Hlavička: `mgz` ji u DE nepřečte (od říjnového buildu má blok hráče na konci
řetězec navíc). Tady se čte tolerantně — bloky hráčů se hledají podle
čtveřice řetězců (typ AI, jméno AI, cenzurované jméno, jméno) a ostatní pole
se berou z pevných vzdáleností kolem nich: číslo hráče (pořadí v lobby),
barva, tým, civilizace, člověk/počítač, profil. K tomu jméno scénáře a lobby.
Zbytek hlavičky (30 MB po rozbalení: počáteční stav všech jednotek, mapa,
triggery scénáře) se nečte.

Tělo: počty akcí podle druhu a hráče, akce za minutu, výzkumy, výroba
jednotek, stavby, trh, tributy, změny postoje, mazání, vlajky, chat.
Čísla hráčů v akcích jsou pořadí v lobby — barvu a jméno k nim dává hlavička.

Použití: python zaznam_statistiky.py <soubor.aoe2record> [--json]
Vyžaduje: pip install mgz (jména jednotek a technologií navíc AoE2ScenarioParser)
"""

import json
import struct
import sys
import zlib
from collections import Counter, defaultdict

from mgz import fast

from zaznam import AKCE_GAME, PRIKAZ_DIPLOMACIE, POSTOJ, akce, chat, operace

BARVY = {0: "modrá", 1: "červená", 2: "zelená", 3: "žlutá", 4: "tyrkysová", 5: "fialová", 6: "šedá", 7: "oranžová"}
TYP = {0: "neplatný", 1: "zavřeno", 2: "člověk", 3: "otevřeno", 4: "počítač", 5: "divák"}
SUROVINY = {0: "jídlo", 1: "dřevo", 2: "kámen", 3: "zlato"}
# Akce, které hráč zadává rukou (AI je vydává taky, ale z nich se počítá tempo).
RUCNI = {"ORDER", "MOVE", "BUILD", "RESEARCH", "DE_QUEUE", "GATHER_POINT", "STOP", "SELL", "BUY", "FORMATION", "STANCE", "DELETE", "WALL", "PATROL", "DE_ATTACK_MOVE", "SPECIAL", "DROP_RELIC", "FLARE", "TOWN_BELL", "BACK_TO_WORK", "REPAIR", "UNGARRISON", "GUARD", "FOLLOW", "ATTACK_GROUND", "DE_RETREAT"}


def _retezec(raw: bytes, o: int):
    """DE řetězec: 60 0a | délka u16 | bajty. Vrací (text, pozice za ním) nebo None."""
    if raw[o : o + 2] != b"\x60\x0a":
        return None
    (delka,) = struct.unpack_from("<H", raw, o + 2)
    return raw[o + 4 : o + 4 + delka].decode("utf-8", "replace"), o + 4 + delka


def cti_hlavicku(data: bytes) -> dict:
    (delka_hlavicky,) = struct.unpack_from("<I", data, 0)
    raw = zlib.decompress(data[8:delka_hlavicky], wbits=-15)
    (ulozeni,) = struct.unpack_from("<f", raw, 8)
    if ulozeni == -1:
        ulozeni = struct.unpack_from("<I", raw, 12)[0] / 65536
    hraci = []
    konec_hracu = 0
    o = 100
    while o < min(len(raw), 20000) and len(hraci) < 8:
        blok = _blok_hrace(raw, o)
        if blok:
            hraci.append(blok[0])
            konec_hracu = o = blok[1]
        else:
            o += 1
    retezce = []
    o = konec_hracu
    while o < min(len(raw), konec_hracu + 4000):
        r = _retezec(raw, o)
        if r and len(r[0]) < 300:
            retezce.append(r[0])
            o = r[1]
        else:
            o += 1
    soubory = [r for r in retezce if ":" in r and not r.startswith("NONE")]
    lobby = next((r for r in retezce[len(soubory) :] if r and ":" not in r), None)
    scenar = next((r.split(":")[2] for r in soubory if ":SCENARIOS:" in r), None)
    return {"verze": raw[:7].decode("ascii", "replace"), "ulozeni": round(ulozeni, 2), "delkaHlavicky": delka_hlavicky, "rozbaleno": len(raw), "hraci": hraci, "scenar": scenar, "soubory": soubory, "lobby": lobby}


def _blok_hrace(raw: bytes, o: int):
    """Blok hráče začíná 28 B před řetězcem typu AI; viz pořadí polí v mgz/fast/header.py."""
    r1 = _retezec(raw, o)
    if not r1:
        return None
    r2 = _retezec(raw, r1[1] + 1)
    if not r2:
        return None
    r3 = _retezec(raw, r2[1])
    if not r3:
        return None
    r4 = _retezec(raw, r3[1])
    jmeno, q = (r4[0], r4[1]) if r4 else (r3[0], r3[1])
    typ, profil, cislo = struct.unpack_from("<II4xi", raw, q)
    (barva,) = struct.unpack_from("<i", raw, o - 24)
    (tym,) = struct.unpack_from("<b", raw, o - 18)
    civ, vlastnich = struct.unpack_from("<II", raw, o - 8)
    if typ > 10 or not -1 <= cislo <= 8 or not -1 <= barva <= 8 or civ > 200 or vlastnich != 0:
        return None
    return (
        {"cislo": cislo, "jmeno": jmeno or r2[0], "barvaId": barva, "barva": BARVY.get(barva, barva), "tym": tym, "civ": civ, "typ": TYP.get(typ, typ), "ai": r1[0] or None, "profil": profil},
        q + 16,
    )


def _jmeno(soubor: str, trida: str, i: int) -> str:
    """Jméno jednotky/budovy/technologie podle AoE2ScenarioParseru; bez něj jen číslo."""
    try:
        import importlib

        return getattr(importlib.import_module(f"AoE2ScenarioParser.datasets.{soubor}"), trida).from_id(i).name
    except Exception:
        return str(i)


def statistiky(data: bytes) -> dict:
    hraci: dict = defaultdict(lambda: {"akce": Counter(), "vyzkumy": [], "vyroba": Counter(), "stavby": Counter(), "trh": Counter(), "tributy": Counter(), "postoje": [], "chat": 0, "rezignace": None})
    cas_ms, konec = 0, "?"
    for druh, obsah, cas_ms in operace(data):
        if druh == "konec":
            konec = obsah
            break
        if druh == "chat":
            z = chat(obsah, cas_ms)
            if z.get("hrac"):
                hraci[z["hrac"]]["chat"] += 1
            continue
        if druh != "akce" or not obsah:
            continue
        try:
            typ = fast.Action(obsah[0])
            d = fast.parse_action(typ, obsah[1:])
        except (ValueError, struct.error):
            continue
        p = d.get("player_id", obsah[1] if len(obsah) > 1 else None)
        if not isinstance(p, int) or not 0 <= p <= 8:
            continue
        h = hraci[p]
        h["akce"][typ.name] += 1
        cas = round(cas_ms / 1000)
        if typ.name == "RESEARCH" and "technology_id" in d:
            h["vyzkumy"].append([cas, _jmeno("techs", "TechInfo", d["technology_id"])])
        elif typ.name in ("DE_QUEUE", "MAKE") and "unit_id" in d:
            h["vyroba"][_jmeno("units", "UnitInfo", d["unit_id"])] += d.get("amount", 1)
        elif typ.name == "BUILD" and "building_id" in d:
            h["stavby"][_jmeno("buildings", "BuildingInfo", d["building_id"])] += 1
        elif typ.name in ("BUY", "SELL"):
            h["trh"][f"{'nákup' if typ.name == 'BUY' else 'prodej'} {SUROVINY.get(d.get('resource_id'), d.get('resource_id'))}"] += d.get("amount", 1) * 100
        elif obsah[0] == AKCE_GAME or typ.name in ("RESIGN", "DE_TRIBUTE"):
            u = akce(obsah, cas_ms)
            if u and u["typ"] == "tribut":
                for surovina in ("jidlo", "drevo", "kamen", "zlato"):
                    if u[surovina]:
                        h["tributy"][f"{surovina} → hráč {u['cil']}"] += u[surovina]
            elif u and u["typ"] == "diplomacie":
                h["postoje"].append([cas, u["cil"], u["postoj"]])
            elif u and u["typ"] == "rezignace":
                h["rezignace"] = cas
    minut = max(cas_ms / 60000, 0.01)
    vysledek = {}
    for p, h in sorted(hraci.items()):
        rucni = sum(n for jmeno, n in h["akce"].items() if jmeno in RUCNI)
        vysledek[p] = {
            "akciCelkem": sum(h["akce"].values()), "rucnichZaMinutu": round(rucni / minut, 1), "akce": dict(h["akce"].most_common()),
            "vyzkumy": h["vyzkumy"], "vyroba": dict(h["vyroba"].most_common()), "stavby": dict(h["stavby"].most_common()),
            "trh": dict(h["trh"]), "tributy": dict(h["tributy"]), "postoje": h["postoje"], "chat": h["chat"], "rezignace": h["rezignace"],
        }
    return {"herniCasS": round(cas_ms / 1000), "konec": konec, "hraci": vysledek}


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    data = open(sys.argv[1], "rb").read()
    hlavicka = cti_hlavicku(data)
    st = statistiky(data)
    if "--json" in sys.argv:
        json.dump({"hlavicka": hlavicka, "statistiky": st}, sys.stdout, ensure_ascii=False, indent=1)
        return
    print(f"záznam {hlavicka['verze']} (uložení {hlavicka['ulozeni']}), hlavička {hlavicka['delkaHlavicky']} B → {hlavicka['rozbaleno']} B")
    print(f"lobby: {hlavicka['lobby']!r} | scénář: {hlavicka['scenar']} | herní čas {st['herniCasS'] // 60}:{st['herniCasS'] % 60:02d} | {st['konec']}")
    for h in hlavicka["hraci"]:
        if h["cislo"] < 0:
            continue
        print(f"  hráč {h['cislo']}: {h['jmeno']!r} — {h['barva']}, tým {h['tym']}, civ {h['civ']}, {h['typ']}" + (f" ({h['ai']})" if h["ai"] else "") + (f", profil {h['profil']}" if h["typ"] == "člověk" else ""))
    for p, s in st["hraci"].items():
        print(f"\nhráč {p}: akcí {s['akciCelkem']}, ručních za minutu {s['rucnichZaMinutu']}, chat {s['chat']}" + (f", rezignace v {s['rezignace']} s" if s["rezignace"] is not None else ""))
        print("  akce:", ", ".join(f"{k} {n}" for k, n in list(s["akce"].items())[:12]))
        for nadpis, klic in (("výroba", "vyroba"), ("stavby", "stavby"), ("trh", "trh"), ("tributy", "tributy")):
            if s[klic]:
                print(f"  {nadpis}:", ", ".join(f"{k} {n:g}" for k, n in list(s[klic].items())[:14]))
        if s["vyzkumy"]:
            print("  výzkumy:", ", ".join(f"{t} ({c // 60}:{c % 60:02d})" for c, t in s["vyzkumy"][:20]))
        if s["postoje"]:
            print("  postoje:", ", ".join(f"{c // 60}:{c % 60:02d} hráč {cil} → {postoj}" for c, cil, postoj in s["postoje"]))


if __name__ == "__main__":
    main()

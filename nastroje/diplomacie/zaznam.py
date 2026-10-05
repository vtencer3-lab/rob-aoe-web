"""Čtečka těla záznamu hry (.aoe2record) z Age of Empires II DE.

Proč vlastní: `mgz` (aoc-mgz 1.8.51, PyPI) hlavičku záznamu z DE nepřečte
(padá v `de.players`, i u zářijového buildu 101.103.48987) a tělo říjnového
buildu 101.103.54800 zastaví na novém typu operace 5, který nezná. Tahle
čtečka hlavičku přeskočí (její délka je v prvních čtyřech bajtech), typ 5
(12 B: typ, -1 nebo 0, čítač) přeskočí a zbytek čte pomocnými funkcemi
`mgz.fast` — akce mají délku, takže projdou i neznámé. Ověřeno 2. 10. 2026
na dohraném i rozepsaném záznamu: záznam běžící hry stačí zkopírovat (hra
ho nedrží výhradně) a přečte se po poslední celou operaci.

Co z těla jde získat (vše ověřeno 2. 10. 2026 na živé hře): herní čas
(součet synchronizací; hra pro víc hráčů běží 1,7× proti reálnému času),
chat (i systémové zprávy o postupu do věku, zprávy triggerů scénáře a AI),
rezignace (`0b | hráč | 01 00 00`), změna postoje v panelu Diplomacie
(akce GAME, příkaz 0: `67 | hráč | 10 00 | 00 00 00 00 | hráč u16 | cíl u16
| postoj float | postoj u32`; 0 spojenec, 1 neutrál, 3 nepřítel) a tribut
(akce 196: `c4 | hráč | 29 00 00 00 | jídlo f | dřevo f | kámen f | zlato f
| … | cíl`). Panel Diplomacie při zavření rozešle tribut 0 všem — bez
`--vse` se nulové tributy vynechají. Stav hry (smrt krále, relikvie,
diplomacie nastavená triggery) v záznamu není — na to je XS, viz
docs/analyza-most-ke-hre.md.

Použití: python zaznam.py <soubor.aoe2record> [--vse]
  bez --vse vynechá opakované zprávy AI a triggerů (stejný text ≥ 5×)
  a nulové tributy
Statistiky po hráčích a hlavičku (hráči, barvy, scénář) čte zaznam_statistiky.py.
Vyžaduje: pip install mgz
"""

import io
import json
import struct
import sys
from collections import Counter

from mgz import fast

OP_AKCE, OP_SYNC, OP_POHLED, OP_CHAT, OP_NOVY5, OP_POSTGAME = 1, 2, 3, 4, 5, 6
AKCE_REZIGNACE, AKCE_GAME, AKCE_TRIBUT_DE = 11, 103, 196
PRIKAZ_DIPLOMACIE = 0
POSTOJ = {0: "spojenec", 1: "neutral", 3: "nepritel"}


def operace(data: bytes):
    """Projde tělo záznamu po poslední celou operaci.

    Dává trojice (druh, obsah, herní čas v ms): "akce" (syrové tělo akce),
    "chat" (syrový text), "sync", "op5" a nakonec vždy "konec" s důvodem.
    """
    delka_hlavicky = struct.unpack("<I", data[:4])[0]
    f = io.BytesIO(data)
    f.seek(delka_hlavicky)
    fast.meta(f)
    cas_ms = 0
    konec = "?"
    while True:
        pozice = f.tell()
        hlava = f.read(4)
        if len(hlava) < 4:
            konec = "konec souboru"
            break
        (op,) = struct.unpack("<I", hlava)
        try:
            if op == OP_AKCE:
                (delka,) = struct.unpack("<I", f.read(4))
                telo = f.read(delka)
                f.read(4)
                if len(telo) < delka:
                    konec = "konec souboru uprostřed akce"
                    break
                yield "akce", telo, cas_ms
            elif op == OP_SYNC:
                cas_ms += fast.sync(f)[0]
                yield "sync", None, cas_ms
            elif op == OP_POHLED:
                f.read(12)
            elif op == OP_CHAT:
                yield "chat", fast.chat(f), cas_ms
            elif op == OP_NOVY5:
                f.read(8)
                yield "op5", None, cas_ms
            elif op == OP_POSTGAME:
                fast.postgame(f)
                konec = "konec hry (POSTGAME)"
                break
            else:
                konec = f"neznámý typ operace {op} na pozici {pozice}"
                break
        except struct.error:
            konec = "konec souboru uprostřed operace"
            break
    yield "konec", konec, cas_ms


def cti_zaznam(data: bytes) -> dict:
    """Přečte tělo záznamu po poslední celou operaci; vrací souhrn a události."""
    pocty: Counter = Counter()
    udalosti: list[dict] = []
    konec, cas_ms = "?", 0
    for druh, obsah, cas_ms in operace(data):
        if druh == "konec":
            konec = obsah
            break
        pocty[druh] += 1
        if druh == "akce":
            udalost = akce(obsah, cas_ms)
            if udalost:
                udalosti.append(udalost)
        elif druh == "chat":
            udalosti.append(chat(obsah, cas_ms))
    return {
        "herniCasS": round(cas_ms / 1000, 1),
        "konec": konec,
        "pocty": dict(pocty),
        "udalosti": udalosti,
    }


def akce(telo: bytes, cas_ms: int) -> dict | None:
    typ = telo[0]
    cas = round(cas_ms / 1000, 1)
    if typ == AKCE_REZIGNACE:
        return {"cas": cas, "typ": "rezignace", "hrac": telo[1]}
    if typ == AKCE_TRIBUT_DE:
        d = fast.parse_action(fast.Action.DE_TRIBUTE, telo[1:])
        return {
            "cas": cas,
            "typ": "tribut",
            "hrac": d["player_id"],
            # mgz vrací cíl jako jeden syrový bajt.
            "cil": d["target_player_id"][0] if isinstance(d["target_player_id"], (bytes, bytearray)) else int(d["target_player_id"]),
            "jidlo": d["food"],
            "drevo": d["wood"],
            "kamen": d["stone"],
            "zlato": d["gold"],
        }
    if typ == AKCE_GAME and len(telo) >= 20:
        # Rozložení v DE: 67 | hráč | 10 00 | příkaz u32 | hráč u16 | cíl u16 | 4 B | hodnota u32.
        (prikaz,) = struct.unpack("<I", telo[4:8])
        hrac2, cil = struct.unpack("<HH", telo[8:12])
        (hodnota,) = struct.unpack("<I", telo[16:20])
        if prikaz == PRIKAZ_DIPLOMACIE:
            return {"cas": cas, "typ": "diplomacie", "hrac": telo[1], "cil": cil, "postoj": POSTOJ.get(hodnota, hodnota)}
        return {"cas": cas, "typ": "game", "hrac": telo[1], "prikaz": prikaz, "cil": cil, "hodnota": hodnota, "syrove": telo.hex(" ")}
    return None


def chat(text: bytes, cas_ms: int) -> dict:
    try:
        j = json.loads(text.decode("utf-8", "replace"))
        return {"cas": round(cas_ms / 1000, 1), "typ": "chat", "hrac": j.get("player"), "kanal": j.get("channel"), "zprava": j.get("message")}
    except ValueError:
        return {"cas": round(cas_ms / 1000, 1), "typ": "chat", "syrove": text.decode("utf-8", "replace")[:200]}


def bez_spamu(udalosti: list[dict]) -> list[dict]:
    """Zprávy AI a triggerů se opakují pro každého hráče — stejný text ≥ 5× jde
    pryč; stejně tak tribut 0, který panel Diplomacie rozesílá všem při zavření."""
    texty = Counter(u.get("zprava") for u in udalosti if u["typ"] == "chat")
    vysledek = []
    for u in udalosti:
        if u["typ"] == "chat" and texty[u.get("zprava")] >= 5:
            continue
        if u["typ"] == "tribut" and not any(u[k] for k in ("jidlo", "drevo", "kamen", "zlato")):
            continue
        vysledek.append(u)
    return vysledek


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    data = open(sys.argv[1], "rb").read()
    v = cti_zaznam(data)
    if "--vse" not in sys.argv:
        v["udalosti"] = bez_spamu(v["udalosti"])
    # mgz u některých akcí (tribut) vrací syrová pole bajtů — do JSON jako hex.
    json.dump(v, sys.stdout, ensure_ascii=False, indent=1, default=lambda o: o.hex(" ") if isinstance(o, (bytes, bytearray)) else str(o))


if __name__ == "__main__":
    main()

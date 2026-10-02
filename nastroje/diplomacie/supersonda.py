"""Čtečka a sledovač super sondy (`supersonda.xs`, formát verze 100).

Super sonda každých 5 herních sekund přepíše `profile\\<scénář>.xsdat`
úplným výpisem toho, co XS o hře ví: údaje o hře, převod slot scénáře →
číslo hráče, všech 600 atributů každého hráče i s názvy ze hry, počty
jednotek podle tříd, stav každé technologie, diplomacii, proměnné triggerů
a vybrané jednotky s pozicí a životy (králové, mniši, relikvie, hrady,
kláštery, centra, divy). Účel: zjistit, co všechno jde ze hry získat a co
se během hry opravdu mění — podklad pro to, co ukazovat na webu.

Příkazy (cesta = soubor .xsdat; výchozí profile\\LLC-supersonda.xsdat):
  python supersonda.py cti [cesta]             celý snímek jako JSON
  python supersonda.py souhrn [cesta]          čitelný souhrn jednoho snímku
  python supersonda.py sleduj [cesta] [slozka] sleduje soubor během hry,
        průběžně ukládá souhrn změn do <slozka>/prubeh.json (Ctrl+C ukončí)
  python supersonda.py katalog <prubeh.json>   z průběhu vyrobí katalog (Markdown)
"""

import json
import os
import struct
import sys
import time

from xsdat import POSTOJ

VYCHOZI = os.path.join(os.environ.get("USERPROFILE", ""), "Games", "Age of Empires 2 DE", "76561198014056480", "profile", "LLC-supersonda.xsdat")

TRIDY = {
    900: "lučištníci", 901: "artefakty", 902: "obchodní lodě", 903: "budovy", 904: "vesničané", 905: "mořské ryby",
    906: "pěchota", 907: "keře", 908: "kamenné doly", 909: "lovná zvěř", 910: "šelmy", 911: "různé", 912: "jízda",
    913: "obléhací stroje", 914: "terén", 915: "stromy", 916: "pařezy", 917: "léčitelé", 918: "mniši",
    919: "obchodní vozy", 920: "transportní lodě", 921: "rybářské lodě", 922: "válečné lodě", 923: "conquistadoři",
    924: "váleční sloni", 925: "hrdinové", 926: "sloní lučištníci", 927: "hradby", 928: "falangy",
    929: "domácí zvířata", 930: "vlajky", 931: "hlubinné ryby", 934: "útesy", 935: "petardy", 936: "jízdní lučištníci",
    937: "dvojníci", 938: "ptáci", 939: "brány", 940: "hromady trosek", 941: "hromady surovin", 942: "relikvie",
    943: "mniši s relikvií", 944: "ruční kanonýři", 945: "obouruční šermíři", 946: "kopiníci", 947: "zvědové",
    948: "rudné doly", 949: "farmy", 950: "oštěpaři", 951: "složené jednotky", 952: "věže", 953: "abordážní lodě",
    954: "rozložené obléhací stroje", 955: "škorpioni", 956: "nájezdníci", 957: "jízdní nájezdníci", 958: "dobytek",
    959: "králové", 960: "ostatní budovy", 961: "ovládaná zvířata", 963: "zlaté ryby", 964: "miny", 965: "konec výčtu",
}
SKUPINY = {942: "relikvie", 959: "král", 943: "mnich s relikvií", 918: "mnich", 925: "hrdina", 82: "hrad", 104: "klášter", 109: "centrum", 276: "div světa"}
STAV_TECHU = {-2: "neplatná", -1: "zakázaná", 0: "nedostupná", 1: "dostupná", 2: "zkoumá se", 3: "vyzkoumaná", 4: "ve frontě"}
TYP_HRACE = {-1: "nikdo", 0: "fantom editoru", 1: "člověk", 2: "Gaia", 3: "počítač"}
VITEZSTVI = {0: "standardní", 1: "dobytí", 2: "časový limit", 3: "skóre", 4: "vlastní (scénář)"}


class Cteni:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def i(self) -> int:
        (v,) = struct.unpack_from("<i", self.data, self.pos)
        self.pos += 4
        return v

    def f(self) -> float:
        (v,) = struct.unpack_from("<f", self.data, self.pos)
        self.pos += 4
        return round(v, 3)

    def s(self) -> str:
        (delka,) = struct.unpack_from("<I", self.data, self.pos)
        self.pos += 4
        if delka > 4096:
            raise struct.error(f"nesmyslná délka řetězce {delka} na pozici {self.pos - 4}")
        v = self.data[self.pos : self.pos + delka].decode("utf-8", "replace")
        self.pos += delka
        return v

    def sekce(self, jmeno: str) -> None:
        nalezeno = self.s()
        if nalezeno != jmeno:
            raise struct.error(f"čekána sekce {jmeno}, nalezeno {nalezeno!r} na pozici {self.pos}")


def cti(data: bytes) -> dict:
    """Jeden snímek super sondy. `platne` je False u rozepsaného nebo cizího souboru."""
    try:
        return _cti(data)
    except struct.error as e:
        return {"platne": False, "duvod": f"useknutý nebo cizí soubor ({len(data)} B): {e}"}


def _cti(data: bytes) -> dict:
    c = Cteni(data)
    verze = c.i()
    if verze != 100:
        return {"platne": False, "duvod": f"verze {verze}, čekána 100 (provozní sondu čte xsdat.py)"}
    cas = c.i()
    c.sekce("HRA")
    hra = {
        "casS": c.i(), "tah": c.i(), "hracu": c.i(), "mapaSirka": c.i(), "mapaVyska": c.i(), "mapaId": c.i(), "seed": c.i(),
        "mapa": c.s(), "typVitezstvi": c.i(), "podminkaVitezstvi": c.i(), "vitezHrac": c.i(), "casVitezstvi": c.i(),
        "obtiznost": c.i(), "mistniHrac": c.i(), "kontextHrac": c.i(),
    }
    c.sekce("SLOTY")
    sloty = [c.i() for _ in range(c.i())]
    c.sekce("ATRIBUTY")
    nazvy = [c.s() for _ in range(c.i())]
    c.sekce("HRACI")
    hraci = []
    for _ in range(c.i()):
        h = {"hrac": c.i(), "jmeno": c.s(), "barva": c.s(), "civ": c.i(), "civJmeno": c.s(), "typ": c.i(), "zije": bool(c.i()), "handicap": c.f(), "techu": c.i()}
        h["atributy"] = [c.f() for _ in range(c.i())]
        hraci.append(h)
    c.sekce("TRIDY")
    pocet_hracu, pocet_trid = c.i(), c.i()
    tridy = [[c.i() for _ in range(pocet_trid)] for _ in range(pocet_hracu)]
    c.sekce("TECHY")
    techu = c.i()
    techy_nazvy = [c.s() for _ in range(techu)]
    techy = [[c.i() for _ in range(techu)] for _ in range(8)]
    c.sekce("DIPLOMACIE")
    n = c.i()
    diplomacie = [[c.i() for _ in range(n)] for _ in range(n)]
    c.sekce("PROMENNE")
    promenne = [c.i() for _ in range(c.i())]
    c.sekce("JEDNOTKY")
    skupiny = []
    for _ in range(c.i()):
        hrac, kod, pocet = c.i(), c.i(), c.i()
        kusy = [{"id": c.i(), "objekt": c.i(), "x": c.f(), "y": c.f(), "z": c.f(), "zivoty": c.f()} for _ in range(pocet)]
        skupiny.append({"hrac": hrac, "kod": kod, "kusy": kusy})
    cas2 = c.i()
    c.sekce("KONEC")
    return {
        "platne": cas == cas2, "verze": verze, "casMs": cas, "bajtu": len(data), "hra": hra, "sloty": sloty, "atributyNazvy": nazvy,
        "hraci": hraci, "tridy": tridy, "techyNazvy": techy_nazvy, "techy": techy, "diplomacie": diplomacie, "promenne": promenne, "jednotky": skupiny,
    }


def nazev_konstanty(i: int) -> str:
    """Jméno atributu podle AoE2ScenarioParseru — doplněk k názvu ze hry, když je nainstalovaný."""
    try:
        from AoE2ScenarioParser.datasets.trigger_lists import Attribute

        return Attribute(i).name
    except Exception:
        return ""


def cas_hry(s: int) -> str:
    return f"{s // 60}:{s % 60:02d}"


def souhrn(v: dict) -> str:
    hra = v["hra"]
    r = [
        f"hra {cas_hry(hra['casS'])} (tah {hra['tah']}) | mapa {hra['mapa']} {hra['mapaSirka']}×{hra['mapaVyska']} | hráčů {hra['hracu']}"
        f" | vítězství: {VITEZSTVI.get(hra['typVitezstvi'], hra['typVitezstvi'])} | místní hráč {hra['mistniHrac']} | soubor {v['bajtu']} B",
        f"slot scénáře → číslo hráče: {dict(enumerate(v['sloty'], 1))}",
    ]
    for h in v["hraci"]:
        if h["typ"] in (-1, 0) and h["hrac"] != 0:
            continue
        nenulove = sum(1 for a in h["atributy"] if a)
        hotove = sum(1 for s in v["techy"][h["hrac"] - 1] if s == 3) if h["hrac"] else 0
        r.append(
            f"  hráč {h['hrac']}: {h['jmeno']!r} {h['barva']} {h['civJmeno']} ({TYP_HRACE.get(h['typ'], h['typ'])}, {'žije' if h['zije'] else 'vyřazen'})"
            f" | nenulových atributů {nenulove} | vyzkoumáno {hotove} | jídlo {h['atributy'][0]:.0f} dřevo {h['atributy'][1]:.0f} kámen {h['atributy'][2]:.0f} zlato {h['atributy'][3]:.0f}"
            f" | relikvie {h['atributy'][7]:.0f}"
        )
    for s in v["jednotky"]:
        if s["kusy"] and s["kod"] in (942, 959, 943):
            r.append(f"  {SKUPINY.get(s['kod'], s['kod'])} hráče {s['hrac']}: " + ", ".join(f"#{k['id']} [{k['x']:.0f},{k['y']:.0f}] {k['zivoty']:.0f} HP" for k in s["kusy"][:12]))
    nenulove = [(i, x) for i, x in enumerate(v["promenne"]) if x]
    r.append(f"proměnné triggerů (nenulové): {nenulove[:40]}")
    return "\n".join(r)


def _stopa(zaznam: dict | None, hodnota, cas: int, prvni_snimek: bool) -> dict:
    """První a poslední hodnota, rozsah a počet změn jedné veličiny.

    Veličina, která se poprvé objeví až v pozdějším snímku, byla do té doby
    nulová (nuly se neukládají) — její první výskyt je tedy změna z nuly.
    """
    if zaznam is None:
        zaznam = {"prvni": hodnota if prvni_snimek else 0, "posledni": hodnota if prvni_snimek else 0, "min": hodnota if prvni_snimek else 0, "max": hodnota if prvni_snimek else 0, "zmen": 0, "prvniZmena": None}
    if hodnota != zaznam["posledni"]:
        zaznam["zmen"] += 1
        if zaznam["prvniZmena"] is None:
            zaznam["prvniZmena"] = cas
        zaznam["posledni"] = hodnota
        zaznam["min"] = min(zaznam["min"], hodnota)
        zaznam["max"] = max(zaznam["max"], hodnota)
    return zaznam


def zapocti(prubeh: dict, v: dict) -> None:
    """Přičte snímek do průběhu hry (souhrn změn všech veličin)."""
    cas = v["hra"]["casS"]
    prvni = "snimku" not in prubeh
    prubeh["snimku"] = prubeh.get("snimku", 0) + 1
    prubeh.setdefault("casOd", cas)
    prubeh["casDo"] = cas
    prubeh["hra"] = v["hra"]
    prubeh["sloty"] = v["sloty"]
    prubeh["atributyNazvy"] = v["atributyNazvy"]
    prubeh["techyNazvy"] = v["techyNazvy"]
    prubeh["hraci"] = [{k: h[k] for k in h if k != "atributy"} for h in v["hraci"]]
    prubeh["jednotky"] = v["jednotky"]
    atributy = prubeh.setdefault("atributy", {})
    for h in v["hraci"]:
        for i, hodnota in enumerate(h["atributy"]):
            klic = f"{i}:{h['hrac']}"
            if hodnota or klic in atributy:
                atributy[klic] = _stopa(atributy.get(klic), hodnota, cas, prvni)
    tridy = prubeh.setdefault("tridy", {})
    for p, radek in enumerate(v["tridy"]):
        for j, pocet in enumerate(radek):
            klic = f"{900 + j}:{p}"
            if pocet or klic in tridy:
                tridy[klic] = _stopa(tridy.get(klic), pocet, cas, prvni)
    techy = prubeh.setdefault("techy", {})
    for p, radek in enumerate(v["techy"], 1):
        for t, stav in enumerate(radek):
            klic = f"{t}:{p}"
            if klic not in techy:
                # Ukládají se jen technologie, které se pohnuly, nebo už na
                # začátku sledování byly rozpracované či hotové.
                if not prvni and prubeh["techyVychozi"][p - 1][t] != stav:
                    techy[klic] = {"prvni": prubeh["techyVychozi"][p - 1][t], "prechody": [[cas, stav]]}
                elif prvni and stav in (2, 3, 4):
                    techy[klic] = {"prvni": stav, "prechody": []}
            elif (techy[klic]["prechody"][-1][1] if techy[klic]["prechody"] else techy[klic]["prvni"]) != stav:
                techy[klic]["prechody"].append([cas, stav])
    prubeh["techyVychozi"] = v["techy"]
    promenne = prubeh.setdefault("promenne", {})
    for i, hodnota in enumerate(v["promenne"]):
        if hodnota or str(i) in promenne:
            promenne[str(i)] = _stopa(promenne.get(str(i)), hodnota, cas, prvni)
    zmeny = prubeh.setdefault("diplomacieZmeny", [])
    if "diplomacie" in prubeh:
        for a in range(len(v["diplomacie"])):
            for b in range(len(v["diplomacie"])):
                if prubeh["diplomacie"][a][b] != v["diplomacie"][a][b]:
                    zmeny.append([cas, a + 1, b + 1, v["diplomacie"][a][b]])
    else:
        prubeh["diplomaciePrvni"] = v["diplomacie"]
    prubeh["diplomacie"] = v["diplomacie"]


def rozbal_dat(data: bytes):
    """Soubory v `metadata/` (live.dat a keše): 8 B hlavička + zlib s JSON."""
    import zlib

    try:
        return json.loads(zlib.decompress(data[8:]).decode("utf-8", "replace"))
    except Exception:
        return None


def zmeny_souboru(koren_hry: str, od: float, soubory: dict) -> None:
    """Zapíše, které soubory hry se od začátku sledování změnily (kolikrát, velikost).

    Odpovídá na otázku „zapisuje hra během zápasu ještě něco jiného?“ —
    `metadata/live.dat` se navíc rozbalí a jeho obsah se ukládá při každé změně.
    """
    for slozka, podslozky, jmena in os.walk(koren_hry):
        podslozky[:] = [p for p in podslozky if p not in ("mods", "subscribed")]
        for jmeno in jmena:
            cesta = os.path.join(slozka, jmeno)
            try:
                st = os.stat(cesta)
            except OSError:
                continue
            if st.st_mtime < od:
                continue
            klic = os.path.relpath(cesta, koren_hry).replace("\\", "/")
            z = soubory.setdefault(klic, {"zmen": 0, "mtime": 0, "velikost": 0})
            if st.st_mtime != z["mtime"]:
                z["zmen"] += 1
                z["mtime"] = st.st_mtime
                z["velikost"] = st.st_size
                if klic == "metadata/live.dat":
                    try:
                        z.setdefault("obsah", []).append(rozbal_dat(open(cesta, "rb").read()))
                    except OSError:
                        pass


def sleduj(cesta: str, slozka: str) -> None:
    os.makedirs(slozka, exist_ok=True)
    cesta_prubehu = os.path.join(slozka, "prubeh.json")
    prubeh: dict = {}
    posledni_cas = None
    # Navázání po přerušení sledování: průběh téže hry pokračuje, kde skončil.
    if os.path.exists(cesta_prubehu):
        with open(cesta_prubehu, encoding="utf-8") as f:
            prubeh = json.load(f)
        posledni_cas = prubeh.get("casMs")
    # Kořen hry = čtyři úrovně nad souborem (…/Age of Empires 2 DE/<id>/profile/x.xsdat).
    koren_hry = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(cesta))))
    od = time.time()
    soubory: dict = {}
    posledni_prochazka = 0.0
    print(f"sleduji {cesta}\nprůběh ukládám do {os.path.join(slozka, 'prubeh.json')} (Ctrl+C ukončí)")
    try:
        while True:
            if time.time() - posledni_prochazka > 10:
                posledni_prochazka = time.time()
                zmeny_souboru(koren_hry, od, soubory)
                with open(os.path.join(slozka, "soubory.json"), "w", encoding="utf-8") as f:
                    json.dump(soubory, f, ensure_ascii=False, indent=1)
            try:
                data = open(cesta, "rb").read()
            except OSError:
                time.sleep(1)
                continue
            v = cti(data)
            if v.get("platne") and v["casMs"] != posledni_cas:
                if posledni_cas is not None and v["casMs"] < posledni_cas:
                    print("čas klesl — nová hra, průběh začíná znovu (starý je v prubeh-<čas>.json)")
                    os.replace(cesta_prubehu, os.path.join(slozka, f"prubeh-{int(time.time())}.json"))
                    prubeh = {}
                if not prubeh:
                    open(os.path.join(slozka, "prvni.xsdat"), "wb").write(data)
                posledni_cas = v["casMs"]
                zapocti(prubeh, v)
                prubeh["casMs"] = v["casMs"]
                open(os.path.join(slozka, "posledni.xsdat"), "wb").write(data)
                with open(cesta_prubehu, "w", encoding="utf-8") as f:
                    json.dump(prubeh, f, ensure_ascii=False)
                zmenene = sum(1 for z in prubeh["atributy"].values() if z["zmen"])
                print(f"{cas_hry(v['hra']['casS'])} snímek {prubeh['snimku']}: {v['bajtu']} B, měnících se atributů {zmenene}, technologií v pohybu {len(prubeh['techy'])}", flush=True)
            time.sleep(1)
    except KeyboardInterrupt:
        print("konec sledování")


def _cislo(x) -> str:
    return f"{x:.0f}" if float(x).is_integer() else f"{x:.2f}"


def katalog(prubeh: dict) -> str:
    """Markdown: co všechno sonda během hry viděla a co se měnilo."""
    hraci = [h for h in prubeh["hraci"] if h["hrac"] and h["typ"] in (1, 3)]
    cisla = [h["hrac"] for h in hraci]
    hra = prubeh["hra"]
    r = [
        "# Katalog dat ze super sondy",
        "",
        f"Hra {cas_hry(prubeh['casOd'])}–{cas_hry(prubeh['casDo'])}, {prubeh['snimku']} snímků; mapa `{hra['mapa']}` {hra['mapaSirka']}×{hra['mapaVyska']},"
        f" vítězství: {VITEZSTVI.get(hra['typVitezstvi'], hra['typVitezstvi'])}, místní hráč {hra['mistniHrac']}.",
        "",
        f"Slot scénáře → číslo hráče ve hře (`xsGetWorldPlayerId`): {', '.join(f'{s}→{p}' for s, p in enumerate(prubeh['sloty'], 1))}",
        "",
        "## Hráči",
        "",
        "| č. | jméno | barva | civilizace | typ | žije |",
        "|---|---|---|---|---|---|",
    ]
    for h in hraci:
        r.append(f"| {h['hrac']} | {h['jmeno']} | {h['barva']} | {h['civJmeno']} ({h['civ']}) | {TYP_HRACE.get(h['typ'], h['typ'])} | {'ano' if h['zije'] else 'ne'} |")

    def tabulka(nadpis: str, popis: str, radky: list) -> None:
        r.extend(["", f"## {nadpis}", "", popis, "", "| id | název ve hře | konstanta | " + " | ".join(f"p{p}" for p in cisla) + " |", "|---|---|---|" + "---|" * len(cisla)])
        r.extend(radky)

    menici, stale = [], []
    for i, nazev in enumerate(prubeh["atributyNazvy"]):
        stopy = [prubeh["atributy"].get(f"{i}:{p}") for p in cisla]
        if not any(stopy):
            continue
        meni = any(s and s["zmen"] for s in stopy)
        bunky = " | ".join("" if s is None else (f"{_cislo(s['prvni'])} → {_cislo(s['posledni'])} ({s['zmen']}×)" if s["zmen"] else _cislo(s["posledni"])) for s in stopy)
        (menici if meni else stale).append(f"| {i} | {nazev} | {nazev_konstanty(i)} | {bunky} |")
    tabulka("Atributy hráčů, které se během hry měnily", "Kandidáti na živé zobrazení. Buňka: první → poslední hodnota (počet změn).", menici)
    tabulka("Atributy nenulové, ale během hry neměnné", "Nastavení, bonusy civilizací, konstanty.", stale)

    r.extend(["", "## Počty jednotek podle tříd", "", "Buňka: poslední stav (maximum během hry).", "", "| třída | co | Gaia | " + " | ".join(f"p{p}" for p in cisla) + " |", "|---|---|---|" + "---|" * len(cisla)])
    for kod, jmeno in TRIDY.items():
        stopy = [prubeh["tridy"].get(f"{kod}:{p}") for p in [0, *cisla]]
        if any(stopy):
            r.append(f"| {kod} | {jmeno} | " + " | ".join("" if s is None else f"{s['posledni']} ({s['max']})" for s in stopy) + " |")

    r.extend(["", "## Technologie", "", "Stav každé technologie pro každého hráče (`xsGetTechState`); níže jen ty, které se během hry pohnuly nebo už byly hotové/rozpracované.", ""])
    for p in cisla:
        radky = []
        for klic, t in prubeh["techy"].items():
            tid, hrac = klic.split(":")
            if int(hrac) != p:
                continue
            nazev = prubeh["techyNazvy"][int(tid)] if int(tid) < len(prubeh["techyNazvy"]) else "?"
            cesta = " → ".join([STAV_TECHU.get(t["prvni"], str(t["prvni"]))] + [f"{STAV_TECHU.get(s, s)} ({cas_hry(c)})" for c, s in t["prechody"]])
            if t["prechody"]:
                radky.append(f"  - {tid} {nazev}: {cesta}")
        hotove = sum(1 for klic, t in prubeh["techy"].items() if klic.endswith(f":{p}") and (t["prechody"][-1][1] if t["prechody"] else t["prvni"]) == 3)
        r.append(f"- **hráč {p}**: vyzkoumaných {hotove}, pohybů během hry {len(radky)}")
        r.extend(radky[:60])

    r.extend(["", "## Proměnné triggerů (nenulové)", "", "| proměnná | první | poslední | změn |", "|---|---|---|---|"])
    for i, s in sorted(prubeh["promenne"].items(), key=lambda kv: int(kv[0])):
        r.append(f"| {i} | {s['prvni']} | {s['posledni']} | {s['zmen']} |")

    r.extend(["", "## Diplomacie", "", f"Změn během hry: {len(prubeh['diplomacieZmeny'])}"])
    for cas, a, b, stav in prubeh["diplomacieZmeny"][:80]:
        r.append(f"- {cas_hry(cas)}: hráč {a} → hráč {b}: {POSTOJ.get(stav, stav)}")

    r.extend(["", "## Jednotky s pozicí (poslední snímek)", ""])
    for s in prubeh["jednotky"]:
        if s["kusy"]:
            r.append(f"- {SKUPINY.get(s['kod'], s['kod'])}, hráč {s['hrac']}: " + ", ".join(f"[{k['x']:.0f}, {k['y']:.0f}] {k['zivoty']:.0f} HP" for k in s["kusy"][:20]) + (f" … celkem {len(s['kusy'])}" if len(s["kusy"]) > 20 else ""))
    return "\n".join(r) + "\n"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("cti", "souhrn", "sleduj", "katalog"):
        print(__doc__)
        sys.exit(2)
    prikaz = sys.argv[1]
    if prikaz == "katalog":
        with open(sys.argv[2], encoding="utf-8") as f:
            sys.stdout.write(katalog(json.load(f)))
        return
    cesta = sys.argv[2] if len(sys.argv) > 2 else VYCHOZI
    if prikaz == "sleduj":
        sleduj(cesta, sys.argv[3] if len(sys.argv) > 3 else "supersonda-prubeh")
        return
    v = cti(open(cesta, "rb").read())
    if prikaz == "cti" or not v.get("platne"):
        print(json.dumps(v, ensure_ascii=False, indent=1))
    else:
        print(souhrn(v))


if __name__ == "__main__":
    main()

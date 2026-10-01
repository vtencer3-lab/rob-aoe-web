# -*- coding: utf-8 -*-
"""Rozbor scénáře Diplomacie: soubor na stdin, JSON na stdout (spec §5.2).

Výstup: {"ok": true, "rozbor": RozborScenare, "minimapa": "<base64 webp>"}
nebo {"ok": false, "chyba": "…"}. Tvar RozborScenare hlídá
src/shared/diplomacie/scenar.ts (prectiRozbor) — měnit oboje naráz.
"""
import base64
import contextlib
import io
import json
import math
import os
import re
import statistics
import sys
import tempfile
from pathlib import Path

from PIL import Image

BARVY_TERENU = json.loads((Path(__file__).with_name("barvy_terenu.json")).read_text(encoding="utf-8"))
NEZNAMY_TEREN = (128, 128, 128)
CIL_HLASKA = re.compile(r"^TVUJ SEKUNDARNI CIL JE\s*:\s*(.+)$")
# Podmínky a efekty triggerů (čísla z AoE2 DE, ověřeno na LLC 1. 10. 2026).
PODMINKA_OWN_OBJECTS = 3
PODMINKA_CHANCE = 20
PODMINKA_VARIABLE = 22
EFEKT_CHAT = 3
EFEKT_AKTIVUJ = 8
# Skupiny jednotek v podmínce Own Objects u limitů ve scénáři LLC.
SKUPINY_LIMITU = {4: "vesnicane", 21: "rybarskeLode", 19: "obchodniVozy"}
ZVETSENI = 2


def nacti(data: bytes):
    from AoE2ScenarioParser.scenarios.aoe2_de_scenario import AoE2DEScenario

    with tempfile.NamedTemporaryFile(suffix=".aoe2scenario", delete=False) as f:
        f.write(data)
        cesta = f.name
    try:
        # Knihovna píše průběh na stdout — ten patří jen výsledku.
        with contextlib.redirect_stdout(io.StringIO()):
            return AoE2DEScenario.from_file(cesta)
    finally:
        os.unlink(cesta)


def sloty(sc):
    vysledek = []
    for cislo in range(1, 9):
        p = sc.player_manager.players[cislo]
        jmeno = (p.tribe_name or "").strip()
        vysledek.append({"cislo": cislo, "barva": cislo, "jmeno": jmeno, "jeGm": jmeno.upper() == "GM"})
    return vysledek


def cile(sc, hrac: int):
    triggery = sc.trigger_manager.triggers
    vysledek, videne = [], set()
    for t in triggery:
        if not any(c.condition_type == PODMINKA_CHANCE for c in t.conditions):
            continue
        text = None
        for e in t.effects:
            if e.effect_type == EFEKT_CHAT and e.source_player == hrac and e.message:
                m = CIL_HLASKA.match(e.message.strip())
                if m:
                    text = m.group(1).strip()
        aktivovany = next((e.trigger_id for e in t.effects if e.effect_type == EFEKT_AKTIVUJ), None)
        if text is None or aktivovany is None or text in videne:
            continue
        cilovy = triggery[aktivovany]
        pocet = next((c.quantity for c in cilovy.conditions if c.condition_type == PODMINKA_VARIABLE), None)
        if pocet is None:
            raise ValueError(f"u cíle „{text}“ chybí podmínka s počtem")
        videne.add(text)
        vysledek.append({"text": text, "pocet": pocet})
    return vysledek


def limity(sc, hrac: int):
    vysledek = {v: None for v in SKUPINY_LIMITU.values()}
    for t in sc.trigger_manager.triggers:
        for c in t.conditions:
            if c.condition_type == PODMINKA_OWN_OBJECTS and c.source_player == hrac and c.object_group in SKUPINY_LIMITU:
                klic = SKUPINY_LIMITU[c.object_group]
                if vysledek[klic] is None:
                    vysledek[klic] = c.quantity
    return vysledek


def otoc(x: float, y: float, n: int):
    """Dílec (x, y) → pozice v obrázku minimapy 0–1 po otočení o 45° (kosočtverec jako ve hře)."""
    s = n * ZVETSENI
    dx, dy = x * ZVETSENI - s / 2, y * ZVETSENI - s / 2
    uhel = math.radians(45)
    # PIL rotate(45) točí proti směru hodinových ručiček v souřadnicích s osou y dolů.
    nx = dx * math.cos(uhel) + dy * math.sin(uhel)
    ny = -dx * math.sin(uhel) + dy * math.cos(uhel)
    strana = s * math.sqrt(2)
    return (nx + strana / 2) / strana, (ny + strana / 2) / strana


def minimapa(sc, varovani):
    n = sc.map_manager.map_size
    obr = Image.new("RGB", (n, n))
    px = obr.load()
    nezname = set()
    for i, dilec in enumerate(sc.map_manager.terrain):
        barva = BARVY_TERENU.get(str(dilec.terrain_id))
        if barva is None:
            nezname.add(dilec.terrain_id)
            barva = NEZNAMY_TEREN
        px[i % n, i // n] = tuple(barva)
    if nezname:
        varovani.append(f"neznámé terény {sorted(nezname)} jsou šedé")
    obr = obr.resize((n * ZVETSENI, n * ZVETSENI), Image.NEAREST).convert("RGBA")
    obr = obr.rotate(45, expand=True, resample=Image.NEAREST, fillcolor=(0, 0, 0, 0))
    buf = io.BytesIO()
    obr.save(buf, "WEBP", lossless=True)
    return buf.getvalue(), obr.size


def starty(sc, gm: int):
    n = sc.map_manager.map_size
    vysledek = []
    for cislo in range(1, 9):
        jednotky = sc.unit_manager.units[cislo]
        if cislo == gm or not jednotky:
            continue
        x = statistics.median(u.x for u in jednotky)
        y = statistics.median(u.y for u in jednotky)
        ox, oy = otoc(x, y, n)
        vysledek.append({"barva": cislo, "x": round(ox, 4), "y": round(oy, 4)})
    return vysledek


def rozeber(data: bytes):
    sc = nacti(data)
    varovani = []
    sl = sloty(sc)
    gm = next((s["cislo"] for s in sl if s["jeGm"]), None)
    if gm is None:
        raise ValueError("scénář nemá hráče pojmenovaného GM")
    hrac = next(s["cislo"] for s in sl if not s["jeGm"])
    p = sc.player_manager.players[hrac]
    webp, (sirka, vyska) = minimapa(sc, varovani)
    rozbor = {
        "velikostMapy": sc.map_manager.map_size,
        "sloty": sl,
        "cile": cile(sc, hrac),
        "suroviny": {"jidlo": p.food, "drevo": p.wood, "zlato": p.gold, "kamen": p.stone, "populace": p.population_cap},
        "limity": limity(sc, hrac),
        "starty": starty(sc, gm),
        "minimapa": {"sirka": sirka, "vyska": vyska},
        "varovani": varovani,
    }
    if len(rozbor["cile"]) == 0:
        raise ValueError("ve scénáři nejsou sekundární cíle (hláška „TVUJ SEKUNDARNI CIL JE“)")
    return rozbor, webp


def main() -> None:
    data = sys.stdin.buffer.read()
    try:
        rozbor, webp = rozeber(data)
        vystup = {"ok": True, "rozbor": rozbor, "minimapa": base64.b64encode(webp).decode("ascii")}
    except Exception as chyba:  # noqa: BLE001 — každé selhání je odpověď, ne pád
        vystup = {"ok": False, "chyba": f"{type(chyba).__name__}: {chyba}"}
    sys.stdout.write(json.dumps(vystup, ensure_ascii=False))


if __name__ == "__main__":
    main()

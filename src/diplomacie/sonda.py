# -*- coding: utf-8 -*-
"""Přibalení XS sondy do scénáře Diplomacie: soubor na stdin, JSON na stdout.

Web sondu přibaluje sám do kopie, kterou host stahuje; originál od autora
zůstává (rozhodnutí uživatele 2. 10. 2026). Sonda je jeden trigger
„XS SCRIPT“ s efektem Script Call (vkládá ho `xs_manager`
AoE2ScenarioParseru), jehož kód hra při načtení zkompiluje do
`default0.xs` u každého hráče i diváka. Kód je v `sonda.xs` vedle — tam je
i rozložení souboru `profile\\<scénář>.xsdat`, který sonda píše.

Výstup: {"ok": true, "soubor": "<base64>", "oznaceno": N, "cile": [{"promenna",
"slot", "text", "limit"}]} nebo {"ok": false, "chyba": "…"}. Tvar hlídá
src/shared/diplomacie/hra.ts (prectiSondu) — měnit oboje naráz.

Tentýž kód používá ruční nástroj `nastroje/diplomacie/sonda.py` (funkce
`pribal`), ať je přibalení na jednom místě.

  python sonda.py < scénář      přibalení (volá src/diplomacie/sonda.ts)
  python sonda.py --over        ověří sonda.xs validátorem xs-check
"""
import base64
import contextlib
import io
import json
import os
import re
import sys
import tempfile
from pathlib import Path

XS_SOUBOR = Path(__file__).with_name("sonda.xs")
# Proměnná 200 + slot scénáře nese číslo proměnné-počitadla cíle, který hráč dostal.
PROMENNA_CILE = 200
EFEKT_AKTIVUJ, EFEKT_SKRIPT = 8, 55
PODMINKA_PROMENNA = 22
OPERACE_NASTAV = 1
# Jména pravidel provozní a super sondy: scénář, který je už obsahuje, se
# podruhé neinstrumentuje (dvojí definice by ve hře XS nezkompilovala).
ZNACKY_SONDY = ("_sondaTik", "_superSondaTik")
# Varování xs-check u `infiniteLoopLimit` (smyčka běží o krok déle) — příkaz
# je v sondě schválně a ve hře ověřený.
XS_IGNOROVAT = "InfLoopLim"
ZASTUPKA = re.compile(r"<[^<>]*>")


def xs_sondy() -> str:
    # ASCII schválně: validátor i hra čtou kód jako UTF-8 a diakritika
    # v komentáři by se v Script Call scénáře mohla rozbít.
    return XS_SOUBOR.read_text(encoding="ascii")


def text_cile(popis: str) -> str:
    """Popis cíle z triggeru jako šablona: místo hodnoty počitadla „{}“.

    „+ zabito : <p1_kill_count> /650 jednotek“ → „zabito : {} /650 jednotek“.
    """
    text = ZASTUPKA.sub("{}", popis or "", count=1)
    return " ".join(text.lstrip("+ \t").split())


def najdi_cile(scenar) -> list:
    """Triggery, které přidělují sekundární cíl, a co o cíli říká scénář.

    XS stav triggerů nevidí a zpráva „pN ma: …“, kterou scénář posílá GM, se
    do záznamu hry neukládá. Přidělení ale poznáme ve scénáři obecně: trigger,
    který aktivuje jiný trigger zobrazený jako cíl (`display_as_objective`)
    s podmínkou na proměnnou-počitadlo. Slot je hráč z prvního efektu
    cílového triggeru, limit číslo z podmínky, text jeho popis.
    Vrací dvojice (přidělující trigger, {promenna, slot, text, limit}).
    """
    spravce = scenar.trigger_manager
    nalezene = []
    for trigger in spravce.triggers:
        for efekt in trigger.effects:
            if efekt.effect_type != EFEKT_AKTIVUJ or not 0 <= efekt.trigger_id < len(spravce.triggers):
                continue
            cil = spravce.triggers[efekt.trigger_id]
            podminky = [c for c in cil.conditions if c.condition_type == PODMINKA_PROMENNA and c.variable >= 0]
            sloty = [e.source_player for e in cil.effects if e.source_player is not None and e.source_player > 0]
            if not cil.display_as_objective or not podminky or not sloty:
                continue
            nalezene.append((trigger, {
                "promenna": podminky[0].variable,
                "slot": sloty[0],
                "text": text_cile(cil.description or cil.short_description or cil.name),
                "limit": podminky[0].quantity,
            }))
            break
    return nalezene


def zkontroluj(scenar, cile: list) -> None:
    """Co by sondu rozbilo, je chyba hned — ne tichá vada až ve hře."""
    obsazene = set(range(PROMENNA_CILE + 1, PROMENNA_CILE + 9))
    triggery = scenar.trigger_manager.triggers
    # Napřed sonda: kopie se sondou má obsazené i proměnné a hláška o nich by mátla.
    for trigger in triggery:
        for efekt in trigger.effects:
            if efekt.effect_type == EFEKT_SKRIPT and any(z in (efekt.message or "") for z in ZNACKY_SONDY):
                raise ValueError("scénář už sondu obsahuje — nahraj originál bez sondy")
    for trigger in triggery:
        for prvek in [*trigger.conditions, *trigger.effects]:
            if getattr(prvek, "variable", None) in obsazene:
                raise ValueError(f"scénář sám používá proměnnou {prvek.variable} (201–208 potřebuje sonda)")
    for _, cil in cile:
        # Nula v proměnné 200 + slot znamená „bez cíle“.
        if cil["promenna"] == 0:
            raise ValueError("počitadlo cíle v proměnné 0 nejde odlišit od hráče bez cíle")
        if not 1 <= cil["slot"] <= 8:
            raise ValueError(f"cíl patří hráči {cil['slot']}, čekán slot 1–8")


def pribal(scenar, xs: str | None = None) -> dict:
    """Označí přidělení cílů a přidá trigger se sondou. Mění scénář v paměti.

    Do každého triggeru přidělení přibude efekt „proměnná 200 + slot :=
    číslo počitadla“; kdo má po rozdání nulu, cíl nedostal (= Nástupce).
    Autorovy triggery jinak zůstávají netknuté.
    """
    cile = najdi_cile(scenar)
    zkontroluj(scenar, cile)
    for trigger, cil in cile:
        trigger.new_effect.change_variable(quantity=cil["promenna"], operation=OPERACE_NASTAV, variable=PROMENNA_CILE + cil["slot"])
    scenar.xs_manager.xs_check.ignores.add(XS_IGNOROVAT)
    scenar.xs_manager.add_script(xs_string=xs if xs is not None else xs_sondy())
    return {"oznaceno": len(cile), "cile": [cil for _, cil in cile]}


def over_xs() -> str | None:
    """Pustí xs-check nad sonda.xs; vrací None, nebo výpis chyb."""
    from AoE2ScenarioParser.exceptions.asp_exceptions import XsCheckValidationError
    from AoE2ScenarioParser.objects.support.xs_check import XsCheck

    kontrola = XsCheck(None)
    kontrola.raise_on_error = True
    kontrola.ignores = {XS_IGNOROVAT}
    with contextlib.redirect_stdout(io.StringIO()):
        try:
            kontrola.validate(str(XS_SOUBOR), show_tmpfile=False)
        except XsCheckValidationError as chyba:
            return chyba.xs_check_errors
    return None


def pribal_do_dat(data: bytes) -> dict:
    from AoE2ScenarioParser import settings

    # Scénář s XS parser při zápisu validuje přibalenou binárkou xs-check;
    # ta je pro glibc a v produkčním obrazu (Alpine) se nespustí. Kód sondy
    # je náš a validuje ho test (`--over`), autorovo XS není naše starost.
    settings.ENABLE_XS_CHECK_INTEGRATION = False
    # Načtení scénáře z bajtů je společné s rozborem.
    from rozbor import nacti

    scenar = nacti(data)
    vysledek = pribal(scenar)
    cesta = os.path.join(tempfile.mkdtemp(), "sonda.aoe2scenario")
    try:
        # Knihovna píše průběh na stdout — ten patří jen výsledku.
        with contextlib.redirect_stdout(io.StringIO()):
            scenar.write_to_file(cesta)
        soubor = Path(cesta).read_bytes()
    finally:
        with contextlib.suppress(OSError):
            os.unlink(cesta)
        with contextlib.suppress(OSError):
            os.rmdir(os.path.dirname(cesta))
    return {"ok": True, "soubor": base64.b64encode(soubor).decode("ascii"), **vysledek}


def main() -> None:
    try:
        if "--over" in sys.argv[1:]:
            chyby = over_xs()
            vystup = {"ok": chyby is None, **({} if chyby is None else {"chyba": chyby})}
        else:
            vystup = pribal_do_dat(sys.stdin.buffer.read())
    except Exception as chyba:  # noqa: BLE001 — každé selhání je odpověď, ne pád
        vystup = {"ok": False, "chyba": f"{type(chyba).__name__}: {chyba}"}
    # Bajty, ne text: na Windows by Python psal na rouru v kódování locale.
    sys.stdout.buffer.write(json.dumps(vystup, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()

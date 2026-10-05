"""Zkušební most ke hře: posílá na web data, která do souboru píše XS sonda.

Běží vedle hry na PC Game Mastera, nebo diváka zápasu (sonda píše soubor
na každém počítači ve hře). Na streamu se dvěma počítači musí běžet na tom,
kde běží hra. Hlídá
`%USERPROFILE%\\Games\\Age of Empires 2 DE\\<id>\\profile\\*.xsdat`, bere
nejnověji změněný soubor sondy formátu 3 (píše ho scénář stažený z webu),
čte ho přes `xsdat.py` a platná čtení (čas na začátku = na konci) posílá na
`POST <url>/api/diplo/hra`. Web podle nich pozná Nástupce císaře — hráče,
kterému hra nedala sekundární cíl — a v pultu GM ukáže postup cílů.

Posílá se při změně obsahu (nejvýš jednou za 2 s) a aspoň jednou za 15 s
jako tep, dokud hra soubor přepisuje. Když hra stojí nebo skončila, most
mlčí a pult GM ukáže „hra mlčí“.

Token: proměnná prostředí MOST_TOKEN, nebo první řádek souboru
`~/.aoe-most-token`. Odesílatel je jméno složky `<id>` (Steam ID nebo XUID).
Web podle něj hledá běžící zápas Diplomacie, kde tenhle hráč sedí na šedé
(data od GM); jinak data vezme jako od diváka — jen když běží jediný zápas
Diplomacie a hraje scénář, který hra hlásí. Když posílá GM i divák, platí
data GM; divák má navíc data opožděná o zpoždění pro diváky.

Použití: python most.py [--url https://jouki.cz/aoe/diplo] [--odesilatel <id>]
                        [--slozka <kořen hry>] [--jednou] [--nasucho]
  --jednou   pošle první platné čtení a skončí
  --nasucho  nic neposílá, zprávy vypisuje jako JSON (zkouška bez tokenu)
Jen standardní knihovna Pythonu.
"""

import argparse
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request

from xsdat import ZNACKA, cti_xsdat

VYCHOZI_URL = "https://jouki.cz/aoe/diplo"
# Formáty sondy, které web bere: 5 se značkou „ROBD“, 3 starší bez ní.
FORMATY = (3, 5, 6, 7, 8)
BEZ_VERZE = 328
# Sonda přepisuje soubor každou herní sekundu; častěji posílat nemá smysl.
ROZESTUP_S = 1.0
TEP_S = 15.0
# Soubor, který se půl minuty nezměnil, je z dřívější hry: jeho cíle by web
# vzal za dnešní a nastavil podle nich Nástupce.
CERSTVE_S = 30.0
KROK_S = 0.5


def koren_hry() -> str:
    return os.path.join(os.environ.get("USERPROFILE") or os.path.expanduser("~"), "Games", "Age of Empires 2 DE")


def nacti_token() -> str:
    token = os.environ.get("MOST_TOKEN", "").strip()
    if token:
        return token
    try:
        with open(os.path.join(os.path.expanduser("~"), ".aoe-most-token"), encoding="utf-8") as f:
            return f.readline().strip()
    except OSError:
        return ""


def najdi_soubor(koren: str, zname: dict):
    """Nejnověji změněný soubor naší sondy: (cesta, mtime, čtení) nebo None.

    Rozepsaný soubor (hra ho zrovna přepisuje) znamená „zkus to za chvíli“,
    ne „vezmi starší soubor jiného scénáře“ — proto si `zname` pamatuje,
    které cesty naše sonda jsou.
    """
    kandidati = []
    for cesta in glob.glob(os.path.join(glob.escape(koren), "*", "profile", "*.xsdat")):
        try:
            kandidati.append((os.path.getmtime(cesta), cesta))
        except OSError:
            continue
    for mtime, cesta in sorted(kandidati, reverse=True):
        try:
            with open(cesta, "rb") as f:
                data = f.read()
        except OSError:
            return None
        if len(data) < 4:
            if zname.get(cesta, True):
                return None
            continue
        # Soubor první zkoušky sondy číslo verze nemá (328 B) a začíná časem.
        prvni = int.from_bytes(data[:4], "little", signed=True)
        je_sonda = len(data) != BEZ_VERZE and (prvni == ZNACKA or prvni == 3)
        zname[cesta] = je_sonda
        if not je_sonda:
            continue
        v = cti_xsdat(data)
        return (cesta, mtime, v) if v.get("platne") and v.get("verze") in FORMATY else None
    return None


def zprava(cesta: str, v: dict, odesilatel: str | None) -> dict:
    """Tělo pro POST /api/diplo/hra (tvar hlídá src/shared/diplomacie/hra.ts, prectiSnimek)."""
    # …/<id>/profile/<scénář>.xsdat — id složky je odesílatel, jméno souboru scénář.
    slozka_id = os.path.basename(os.path.dirname(os.path.dirname(cesta)))
    return {
        "v": 1,
        "odesilatel": odesilatel or slozka_id,
        "scenar": os.path.splitext(os.path.basename(cesta))[0] + ".aoe2scenario",
        "cas": v["cas"],
        "sloty": v["sloty"],
        # `kral` jen od formátu 6 (poloha prvního krále v dílcích, null = žádný).
        "hraci": [{"cislo": h["hrac"], "jmeno": h["jmeno"], "barva": h["barva"], "relikvie": h["relikvie"], "zije": h["zije"], **({"kral": h["kral"]} if "kral" in h else {})} for h in v["hraci"]],
        "diplomacie": v["diplomacieKody"],
        "promenne": v["promenne"],
        # Polohy relikvií na mapě jen od formátu 7.
        **({"relikvieNaMape": v["relikvie"]} if "relikvie" in v else {}),
    }


def posli(url: str, token: str, telo: dict) -> tuple[int, dict]:
    """Vrací (stav HTTP, JSON odpovědi); stav 0 = web neodpověděl."""
    pozadavek = urllib.request.Request(
        url.rstrip("/") + "/api/diplo/hra",
        data=json.dumps(telo).encode("utf-8"),
        headers={"content-type": "application/json", "authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(pozadavek, timeout=10) as odpoved:
            return odpoved.status, json.loads(odpoved.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except ValueError:
            return e.code, {}
    except (urllib.error.URLError, OSError, ValueError) as e:
        return 0, {"chyba": str(e)}


def cas_hry(s: int) -> str:
    return f"{s // 60}:{s % 60:02d}"


ZDROJE = {"gm": "jako GM", "divak": "jako divák"}


def popis_odpovedi(stav: int, odpoved: dict, odesilatel: str) -> str:
    chyba = odpoved.get("chyba") or ""
    if stav == 200:
        nastupce = odpoved.get("nastupce")
        zdroj = ZDROJE.get(odpoved.get("zdroj") or "", "zdroj neznámý")
        radek = f"zápas {odpoved.get('zapasId')} ({zdroj}), Nástupce: {nastupce if nastupce else 'zatím neurčen'}"
        if odpoved.get("pouzito") is False:
            radek += " — nepoužito, data posílá GM"
        return radek + (f" — POZOR: {odpoved['varovani']}" if odpoved.get("varovani") else "")
    if stav == 401:
        return "web token odmítl (401) — zkontroluj MOST_TOKEN nebo soubor ~/.aoe-most-token"
    if stav == 404:
        return f"web data od {odesilatel} nepřiřadil k žádnému zápasu (404): {chyba or 'neběží žádný zápas Diplomacie.'} Jiné id nastaví --odesilatel."
    if stav == 0:
        return f"web neodpovídá: {chyba}"
    return f"web vrátil {stav}: {chyba}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Most ke hře: data XS sondy Diplomacie → web.")
    parser.add_argument("--url", default=VYCHOZI_URL, help=f"adresa webu (výchozí {VYCHOZI_URL})")
    parser.add_argument("--odesilatel", "--gm", dest="odesilatel", default=None, help="Steam ID / XUID tohohle počítače, když se liší od jména složky profilu (--gm je starší jméno)")
    parser.add_argument("--slozka", default=koren_hry(), help="kořen dat hry (složka s podsložkami <id>)")
    parser.add_argument("--jednou", action="store_true", help="pošle první platné čtení a skončí")
    parser.add_argument("--nasucho", action="store_true", help="neposílá, zprávy vypisuje jako JSON")
    # Výstup do roury jde v kódování locale (cp1250): znak mimo něj nesmí most
    # shodit — ani nápovědu, kterou argparse tiskne už při čtení přepínačů.
    sys.stdout.reconfigure(errors="replace")
    sys.stderr.reconfigure(errors="replace")
    volby = parser.parse_args()

    token = "" if volby.nasucho else nacti_token()
    if not volby.nasucho and not token:
        print("Chybí token mostu: nastav proměnnou MOST_TOKEN, nebo ho ulož na první řádek souboru ~/.aoe-most-token.", file=sys.stderr)
        return 2
    if not os.path.isdir(volby.slozka):
        print(f"Složka hry {volby.slozka} neexistuje — zadej ji přepínačem --slozka.", file=sys.stderr)
        return 2
    if not volby.nasucho:
        print(f"Most běží: hlídám {os.path.join(volby.slozka, '<id>', 'profile', '*.xsdat')}, posílám na {volby.url} (Ctrl+C ukončí).", flush=True)

    zname: dict = {}
    posledni_obsah = None
    posledni_mtime = None
    odeslano = 0.0
    try:
        while True:
            nalez = najdi_soubor(volby.slozka, zname)
            ted = time.time()
            if nalez and ted - nalez[1] <= CERSTVE_S and nalez[1] != posledni_mtime and ted - odeslano >= ROZESTUP_S:
                cesta, mtime, v = nalez
                telo = zprava(cesta, v, volby.odesilatel)
                # Herní čas běží pořád; „změna“ je všechno ostatní.
                obsah = {k: x for k, x in telo.items() if k != "cas"}
                zmena = obsah != posledni_obsah
                if zmena or ted - odeslano >= TEP_S:
                    posledni_obsah, posledni_mtime, odeslano = obsah, mtime, ted
                    if volby.nasucho:
                        print(json.dumps(telo), flush=True)
                        stav = 200
                    else:
                        stav, odpoved = posli(volby.url, token, telo)
                        print(f"{time.strftime('%H:%M:%S')} odesláno ({'změna' if zmena else 'tep'}, čas hry {cas_hry(v['cas'])}) → {popis_odpovedi(stav, odpoved, telo['odesilatel'])}", flush=True)
                    if volby.jednou:
                        return 0 if stav == 200 else 1
            time.sleep(KROK_S)
    except KeyboardInterrupt:
        print("Most ukončen.")
        return 0


if __name__ == "__main__":
    sys.exit(main())

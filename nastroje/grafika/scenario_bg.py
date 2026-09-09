# -*- coding: utf-8 -*-
"""Odstranění pozadí obrázku přes Scenario.com API (Remove Background).

⚠ STOJÍ KREDITY na účtu Scenario — spouštět VÝHRADNĚ na explicitní pokyn
uživatele, nikdy automaticky v rámci jiné pipeline (rozhodnutí uživatele,
platí trvale).

Použití:
  python scripts/dev/scenario_bg.py vstup.png                # -> vstup_nobg.png
  python scripts/dev/scenario_bg.py vstup.png -o vysledek.png

Přihlašovací údaje (API key se založí na app.scenario.com → Settings → API):
  1. env proměnné SCENARIO_API_KEY_ID a SCENARIO_API_SECRET, nebo
  2. soubor %USERPROFILE%\\.scenario_api.json:
     {"key_id": "...", "secret": "..."}

Tok: upload assetu (POST /assets, base64) → POST /generate/remove-background
→ poll GET /jobs/{id} → stažení výsledného assetu (GET /assets/{id} → url).
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.cloud.scenario.com/v1"
# Projekt, do kterého uživatel určil nahrávat (zadání grafického kabátku).
PROJEKT = "proj_9Epp9mVRGdKPcaiZwwQ9JjMS"
CRED_FILE = Path.home() / ".scenario_api.json"
POLL_S = 3
TIMEOUT_S = 300


def _credentials() -> str:
    key = os.environ.get("SCENARIO_API_KEY_ID")
    sec = os.environ.get("SCENARIO_API_SECRET")
    if not (key and sec) and CRED_FILE.exists():
        data = json.loads(CRED_FILE.read_text(encoding="utf-8"))
        key, sec = data.get("key_id"), data.get("secret")
    if not (key and sec):
        sys.exit("CHYBA: chybí přihlášení — env SCENARIO_API_KEY_ID/SCENARIO_API_SECRET "
                 f"nebo {CRED_FILE}")
    return base64.b64encode(f"{key}:{sec}".encode()).decode()


def _call(auth: str, method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(API + path, method=method, headers={
        "Authorization": f"Basic {auth}", "Content-Type": "application/json"})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        sys.exit(f"CHYBA: {method} {path} -> HTTP {e.code}\n{detail}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Remove background přes Scenario API (stojí kredity!)")
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=None)
    ap.add_argument("--projekt", default=PROJEKT, help="ID projektu na Scenariu, kam asset patří")
    args = ap.parse_args()

    src: Path = args.input
    if not src.exists():
        sys.exit(f"CHYBA: {src} neexistuje")
    out: Path = args.output or src.with_name(src.stem + "_nobg.png")
    auth = _credentials()

    print(f"1/4 upload {src.name} ({src.stat().st_size // 1024} kB)...")
    b64 = base64.b64encode(src.read_bytes()).decode()
    # Projekt se předává parametrem adresy. V těle požadavku ho server tiše
    # ignoruje a asset spadne do projektu, ke kterému patří API klíč — což se
    # pozná až zpětně podle `ownerId`.
    cesta = "/assets" + (f"?projectId={args.projekt}" if args.projekt else "")
    asset = _call(auth, "POST", cesta, {"image": f"data:image/png;base64,{b64}", "name": src.name})
    asset_id = asset.get("asset", {}).get("id") or asset.get("assetId")
    if not asset_id:
        sys.exit(f"CHYBA: upload nevrátil assetId: {json.dumps(asset)[:500]}")
    print(f"    assetId: {asset_id}")

    print("2/4 remove background...")
    job = _call(auth, "POST", "/generate/remove-background", {"image": asset_id})
    job_id = job.get("job", {}).get("jobId") or job.get("jobId")
    if not job_id:
        sys.exit(f"CHYBA: nevrácen jobId: {json.dumps(job)[:500]}")

    print(f"3/4 čekám na job {job_id}...")
    t0 = time.time()
    while True:
        j = _call(auth, "GET", f"/jobs/{job_id}").get("job", {})
        status = j.get("status")
        if status == "success":
            break
        if status in ("failure", "failed", "canceled"):
            sys.exit(f"CHYBA: job skončil stavem {status}: {json.dumps(j)[:500]}")
        if time.time() - t0 > TIMEOUT_S:
            sys.exit(f"CHYBA: timeout po {TIMEOUT_S} s (stav {status})")
        time.sleep(POLL_S)

    ids = (j.get("metadata", {}).get("assetIds")
           or [a.get("id") for a in j.get("assets", []) if a.get("id")])
    if not ids:
        sys.exit(f"CHYBA: job bez výstupních assetů: {json.dumps(j)[:500]}")

    print("4/4 stahuji výsledek...")
    url = _call(auth, "GET", f"/assets/{ids[0]}").get("asset", {}).get("url")
    if not url:
        sys.exit("CHYBA: asset bez URL")
    with urllib.request.urlopen(url, timeout=120) as r:
        out.write_bytes(r.read())
    print(f"OK: {out} ({out.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""Vytáhne ze hry všech 105 anglických tauntů do web/src/assets/taunty/taunt-NN.mp3.

Kde jsou: hlasy jsou jazykově zvlášť v `AoE2DE/wwise/<jazyk>/Base.pck`
(anglicky `wwise/en/Base.pck`, 3 banky + 160 streamů) — ne v hlavním
`wwise/Base.pck`, který má jen SFX. Události se jmenují `Play_Taunt_01`
až `Play_Taunt_105` (FNV-1 hash názvu), ale mapování na soubory .wem je
nejjednodušší vzít z komunitní tabulky StepS (list „OLD Audio Sources -
Speech“, řádky „Taunt NN“ + jazyk `en`), uložené tady v `taunty_en_wem.json`.
Většina tauntů je vložená přímo v bance (DIDX/DATA), zbytek jako stream v PCK.

  python taunty.py            # čte instalaci ze Steamu, píše do ../../web/src/assets/taunty

Potřebuje: vgmstream-cli (scoop install vgmstream), ffmpeg v PATH, pck.py vedle.
"""
import json, os, struct, subprocess, sys
from pathlib import Path
from pck import parse

HRA = Path(os.environ.get("AOE2DE", r"C:/Program Files (x86)/Steam/steamapps/common/AoE2DE"))
PCK = HRA / "wwise" / "en" / "Base.pck"
OUT = Path(__file__).resolve().parents[2] / "web" / "src" / "assets" / "taunty"
TMP = Path(__file__).resolve().parent / "_tmp_taunty"


def embedded(bnk: bytes) -> dict[int, bytes]:
    """Média vložená v bance: sekce DIDX (id, offset, velikost) + DATA."""
    o, secs = 0, {}
    while o + 8 <= len(bnk):
        tag = bnk[o:o + 4]
        ln = struct.unpack_from("<I", bnk, o + 4)[0]
        secs[tag] = (o + 8, ln)
        o += 8 + ln
    if b"DIDX" not in secs:
        return {}
    do, dl = secs[b"DIDX"]
    da = secs[b"DATA"][0]
    out = {}
    for i in range(dl // 12):
        wid, off, size = struct.unpack_from("<III", bnk, do + i * 12)
        out[wid] = bnk[da + off:da + off + size]
    return out


def main() -> None:
    want = json.loads((Path(__file__).parent / "taunty_en_wem.json").read_text("utf-8"))
    f, ver, langs, banks, streams, ext = parse(str(PCK))
    st = {fid: (fs, off) for fid, bs, fs, off, lid in streams}
    media: dict[int, bytes] = {}
    for fid, bs, fs, off, lid in banks:
        f.seek(off)
        media.update(embedded(f.read(fs)))
    OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(exist_ok=True)
    chybi = []
    for name, wid in want.items():
        n = int(name.split()[1])
        if wid in st:
            fs, off = st[wid]
            f.seek(off)
            data = f.read(fs)
        elif wid in media:
            data = media[wid]
        else:
            chybi.append(n)
            continue
        wem = TMP / f"{wid}.wem"
        wav = TMP / f"taunt-{n:02d}.wav"
        wem.write_bytes(data)
        subprocess.run(["vgmstream-cli", "-i", "-o", str(wav), str(wem)], check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libmp3lame", "-q:a", "4", str(OUT / f"taunt-{n:02d}.mp3")], check=True)
    print(f"hotovo {len(want) - len(chybi)}, chybí {chybi}")


if __name__ == "__main__":
    sys.exit(main())

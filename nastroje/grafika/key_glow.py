# -*- coding: utf-8 -*-
"""Glow-friendly odstranění pozadí pro herní assety na TMAVÉM/ČERNÉM pozadí.

⚠ WIP: lepší než dřívější čistý BiRefNet (drží zářivé efekty s měkkou alfou),
ale ještě nedorovnává Scenario.com removal ve všech detailech — u kritických
artů s glow zatím preferuj Scenario. Vyladěno na testu „Znič krystaly";
použití: přímo, nebo přes make_art_alpha.py / deploy_cards.py (importují odsud).

Cíl kvality = vizuální shoda KOMPOZITU NAD SVĚTLÝM podkladem (#dfb469, bílá)
se Scenario.com background removal — ne MAE nad černou (ta je zavádějící,
tmavý závoj přes ni neprojeví). Ověřeno na testu flux2_znic_krystaly.png:
RMSE kompozitů vs. Scenario je 8,0/255 nad #dfb469, 7,1 nad #202020,
10,9 nad bílou; vizuálně bez tmavého závoje a bez stínu/kouře u země.

Metoda (tři větve, každá řeší jinou třídu obsahu):
  1. GLOW (emisivní záře): alfa = ((max(RGB−bg) − floor)/(255−floor))^gamma
     (gamma 2,8 fit na Scenario), barva = téměř plný unpremultiply
     sub/max(alfa, 0,9·mx/255) + 10 % přimíchané bílé (pastel jako Scenario).
     Žádný strop zesílení -> žádná tmavá špinavá kaše nad světlým podkladem.
     Navíc: •keep faktor (nesyté A tmavé pixely = kouř/odlesky podlahy pryč),
            •prostorová brána = dilatovaná silueta birefnet-general
             (odlesky na podlaze daleko od objektu pryč).
  2. MĚKKÉ JÁDRO: sémantická alfa Lucida (BiRefNet fine-tune na glow/VFX,
     MIT, HF: egeorcun/lucida) zpevněná (0,50→0; 0,70→1); jasně fialové
     emisivní pixely (blesk) z jádra z 40 % vyřazeny — jinak by dostaly
     tmavou barvu originálu místo zářivé glow barvy.
  3. PEVNÁ TĚLESA (suť, kamínky — Scenario je drží binárně neprůhledné):
     hystereze na confidence max(Lucida, isnet>0,78·isnet): seedy >0,70,
     růst do >0,45, jen neemisivní pixely (mx<190, ne fialové); + closing,
     fill_holes a convex hull malých komponent (kamínky jsou konvexní).
     isnet-general-use vidí kamínky, které Lucida mine; práh 0,78 nepustí
     jeho stínový „koberec" pod tělesy.
  Alfa = max větví; barva = w/alfa · originál + zbytek · glow barva
  (žádná bledá halo kolem pevných těles).

Použití:
  python key_best.py <vstup.png|složka> [-o <výstup.png|složka>] [--check]
         [--gamma 2.8] [--floor 8] [--core lucida|birefnet|none]

Závislosti: pip install torch torchvision transformers pillow numpy scipy
            scikit-image rembg   (rembg = isnet + birefnet brána; bez něj
            skript běží, ale bez pevné větve isnet a bez prostorové brány)
Vstupní obrázky MUSÍ mít tmavé, přibližně jednolité pozadí (u Flux generování
stačí do promptu vynutit „on pure black background").
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

_LUCIDA = None
_SESSIONS = {}


def _core_lucida(img: Image.Image) -> np.ndarray:
    """Sémantická alfa 0..1 modelem Lucida (egeorcun/lucida, MIT)."""
    global _LUCIDA
    import torch
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation

    if _LUCIDA is None:
        model = AutoModelForImageSegmentation.from_pretrained(
            "egeorcun/lucida", trust_remote_code=True)
        model.eval()
        if torch.cuda.is_available():
            model.cuda()
        prep = transforms.Compose([
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
        _LUCIDA = (model, prep)
    model, prep = _LUCIDA
    x = prep(img).unsqueeze(0)
    if next(model.parameters()).is_cuda:
        x = x.cuda()
    with torch.no_grad():
        a = model(x)[-1].sigmoid().float().cpu()[0, 0].numpy()
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8), "L")
                      .resize(img.size, Image.BILINEAR), dtype=np.float32) / 255.0


def _rembg_alpha(img: Image.Image, model: str) -> np.ndarray:
    """Alfa 0..1 z rembg modelu (birefnet-general / isnet-general-use)."""
    from rembg import remove, new_session
    if model not in _SESSIONS:
        _SESSIONS[model] = new_session(model)
    return np.asarray(remove(img, session=_SESSIONS[model]))[..., 3] \
        .astype(np.float32) / 255.0


def remove_bg_glow(img: Image.Image, gamma: float = 2.8, floor: float = 8.0,
                   core: str = "lucida") -> Image.Image:
    """Vrátí RGBA; glow měkce, pevná tělesa neprůhledně, kouř/stín u země pryč."""
    rgb_img = img.convert("RGB")
    src = np.asarray(rgb_img).astype(np.float32)

    # 1) odhad pozadí z rohů
    c = 48
    corners = np.concatenate([src[:c, :c].reshape(-1, 3), src[:c, -c:].reshape(-1, 3),
                              src[-c:, :c].reshape(-1, 3), src[-c:, -c:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    if bg.max() > 40:
        print(f"  ! pozadí není tmavé (medián {bg.round(0)}), unkey nebude přesný",
              file=sys.stderr)
    sub = np.clip(src - bg, 0, 255)
    mx = sub.max(axis=2)
    mn = sub.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    val = mx / 255.0

    # 2) GLOW alfa: gamma-komprese intenzity (fit na Scenario)
    a_glow = np.clip((mx - floor) / (255.0 - floor), 0, 1) ** gamma
    #    keep: syté NEBO jasné; nesytý tmavý kouř/odlesky podlahy pryč
    keep = np.maximum(np.clip((sat - 0.35) / 0.25, 0, 1),
                      np.clip((val - 0.55) / 0.25, 0, 1))
    a_glow *= keep
    #    prostorová brána: glow jen v okolí sémantické siluety
    try:
        gate_m = Image.fromarray(
            ((_rembg_alpha(rgb_img, "birefnet-general") > 0.3) * 255).astype(np.uint8), "L")
        gate_m = gate_m.filter(ImageFilter.MaxFilter(41))
        gate_m = gate_m.filter(ImageFilter.GaussianBlur(12))
        a_glow *= np.asarray(gate_m, dtype=np.float32) / 255.0
    except Exception as e:  # noqa: BLE001
        print(f"  ! birefnet brána nedostupná ({e}), glow bez prostorového omezení",
              file=sys.stderr)

    # 3) MĚKKÉ JÁDRO (sémantika); fialové emisivní pixely nejsou těleso
    if core == "lucida":
        try:
            lucida = _core_lucida(rgb_img)
        except Exception as e:  # noqa: BLE001
            print(f"  ! Lucida nedostupná ({e}), fallback birefnet", file=sys.stderr)
            lucida = _rembg_alpha(rgb_img, "birefnet-general")
    elif core == "birefnet":
        lucida = _rembg_alpha(rgb_img, "birefnet-general")
    else:  # none = čistý unkey (jen plně emisivní obsah bez pevných těles)
        lucida = np.zeros_like(mx)
    w = np.clip((lucida - 0.50) / 0.20, 0, 1)
    purple = (sub[..., 0] > sub[..., 1] + 10) & (mx > 90)
    if core != "none":
        from scipy import ndimage
        purple_f = ndimage.gaussian_filter(purple.astype(np.float32), 1.5)
        w *= 1.0 - 0.4 * np.clip(purple_f, 0, 1)

        # 4) PEVNÁ TĚLESA: hystereze + morfologie -> binárně jako Scenario
        try:
            isnet = _rembg_alpha(rgb_img, "isnet-general-use")
        except Exception as e:  # noqa: BLE001
            print(f"  ! isnet nedostupný ({e}), pevná větev jen z Lucidy",
                  file=sys.stderr)
            isnet = np.zeros_like(mx)
        conf = np.maximum(lucida, np.where(isnet > 0.78, isnet, 0.0))
        lo_m = (conf > 0.45) & (mx < 190) & ~purple
        hi_m = (conf > 0.70) & lo_m
        lab, _ = ndimage.label(lo_m)
        keep_ids = np.unique(lab[hi_m])
        solid = np.isin(lab, keep_ids[keep_ids > 0])
        solid = ndimage.binary_closing(solid, np.ones((3, 3), bool))
        solid = ndimage.binary_fill_holes(solid)
        try:
            from skimage.morphology import convex_hull_image
            labs, ns = ndimage.label(solid)
            if ns:
                szs = ndimage.sum(solid, labs, range(1, ns + 1))
                for i, sl in enumerate(ndimage.find_objects(labs), 1):
                    if sl is not None and 30 <= szs[i - 1] <= 2500:
                        solid[sl] |= convex_hull_image(labs[sl] == i)
        except Exception:  # noqa: BLE001 - hull je jen kosmetika kamínků
            pass
        sf = ndimage.gaussian_filter(solid.astype(np.float32), 1.0)
        w = np.maximum(w, np.clip((sf - 0.3) / 0.4, 0, 1))

    # 5) kombinace + odšumění
    a = np.maximum(w, a_glow)
    a[a < 0.008] = 0.0

    # 6) barva: glow = téměř plný unpremultiply (přetečení -> pastel),
    #    jádro = originál; váha = podíl jádra na alfě (žádná bledá halo)
    denom = np.maximum(np.maximum(a, (mx / 255.0) * 0.9), 1e-3)
    glow_rgb = sub / denom[..., None]
    glow_rgb += 0.1 * (255.0 - glow_rgb)
    u = np.clip(w / np.maximum(a, 1e-6), 0, 1)
    rgb = np.clip(u[..., None] * src + (1.0 - u[..., None]) * glow_rgb, 0, 255)
    rgb[a == 0] = 0
    return Image.fromarray(np.dstack([rgb, a * 255.0]).astype(np.uint8), "RGBA")


def _checkerboard(rgba: Image.Image, cell: int = 16) -> Image.Image:
    w, h = rgba.size
    yy, xx = np.mgrid[0:h, 0:w]
    board = np.where(((yy // cell) + (xx // cell)) % 2 == 0, 200, 140).astype(np.uint8)
    bgi = Image.fromarray(np.stack([board] * 3, axis=2), "RGB").convert("RGBA")
    bgi.alpha_composite(rgba)
    return bgi.convert("RGB")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input", help="PNG soubor nebo složka s PNG")
    ap.add_argument("-o", "--out", help="výstupní soubor/složka (default: <jméno>_rgba.png)")
    ap.add_argument("--gamma", type=float, default=2.8, help="tvar glow alfy (výchozí 2.8)")
    ap.add_argument("--floor", type=float, default=8.0, help="šumový práh jasu (výchozí 8)")
    ap.add_argument("--core", choices=["lucida", "birefnet", "none"], default="lucida")
    ap.add_argument("--check", action="store_true", help="uložit i náhled na šachovnici")
    args = ap.parse_args()

    src = Path(args.input)
    files = sorted(src.glob("*.png")) if src.is_dir() else [src]
    outdir = Path(args.out) if args.out and (src.is_dir() or Path(args.out).is_dir()) else None
    if outdir:
        outdir.mkdir(parents=True, exist_ok=True)

    for p in files:
        out = remove_bg_glow(Image.open(p), args.gamma, args.floor, args.core)
        if outdir:
            dst = outdir / f"{p.stem}.png"
        elif args.out:
            dst = Path(args.out)
        else:
            dst = p.with_name(f"{p.stem}_rgba.png")
        out.save(dst)
        a = np.asarray(out)[..., 3]
        print(f"{p.name}: a=0 {(a == 0).mean():.0%}, poloprůhledné "
              f"{((a > 0) & (a < 255)).mean():.1%} -> {dst}")
        if args.check:
            _checkerboard(out).save(dst.with_name(f"{dst.stem}_check.png"))


if __name__ == "__main__":
    main()

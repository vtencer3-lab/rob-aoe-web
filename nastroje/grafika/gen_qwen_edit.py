# -*- coding: utf-8 -*-
"""Editace obrázku přes Qwen-Image-Edit-2511 (ComfyUI API) — lokálně a ZDARMA.

Lokální protějšek `gpt_edit.py` (ten volá placené OpenAI API a model
`gpt-image-1` se navíc 23. 10. 2026 vypíná). Model rozumí instrukcím nad VÍC
obrázky naráz, takže umí náš krok 3 hybridního workflow: „vezmi detail
z obrázku 2 a přenes ho na obrázek 1, zbytek nech být".

Použití:
  python scripts/dev/gen_qwen_edit.py vstup.png "prompt" -o vystup.png
  python scripts/dev/gen_qwen_edit.py vstup.png "prompt" --ref detail.png
  python scripts/dev/gen_qwen_edit.py vstup.png "prompt" -n 4 -o slozka/
  python scripts/dev/gen_qwen_edit.py vstup.png "prompt" --fast     # 4 kroky

Prompt je ANGLICKY (čeština model neumí). Na obrázky se odkazuje jejich
pořadím: „Picture 1", „Picture 2" — čísla doplňuje sám model podle toho,
kolik obrázků dostane (vstup = 1, --ref = 2, --ref2 = 3).

Předpoklady (viz docs/reference/huggingface-qwen-image-edit.md):
  - běžící ComfyUI ≥ 0.28 na http://127.0.0.1:8188 (uzly Qwen jsou v jádru,
    nic se nedoinstalovává)
  - models/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors
  - models/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors
  - models/vae/qwen_image_vae.safetensors
  - volitelně models/loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors
    (přepínač --fast)

⚠ Rozlišení: uzel `TextEncodeQwenImageEditPlus` zmenšuje reference na ~1 MP,
takže výstup je zhruba v tomhle rozlišení a NENÍ bajt na bajt zarovnaný se
vstupem. `--keep-size` alespoň zachová rozměr vstupu (jinak se jede na
„preferovaný" poměr jako u Flux Kontextu).
"""
import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HOST = "http://127.0.0.1:8188"

UNET = "qwen_image_edit_2511_fp8mixed.safetensors"
CLIP = "qwen_2.5_vl_7b_fp8_scaled.safetensors"
VAE = "qwen_image_vae.safetensors"
LIGHTNING = "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors"

# Hodnoty z oficiální šablony ComfyUI `image_qwen_image_edit_2511.json`
# (referenční tabulka v šabloně: Qwen 40 kroků / Comfy 20, cfg 4,0; sampler
# euler + simple; ModelSamplingAuraFlow shift 3,1; CFGNorm síla 1).
# S Lightning LoRA se jede na 4 kroky a cfg 1,0.
DEFAULTS = {"steps": 20, "cfg": 4.0, "shift": 3.1, "fast_steps": 4, "fast_cfg": 1.0}


def _volby(node: str, field: str) -> list[str]:
    """Seznam hodnot, které ComfyUI pro daný uzel a pole nabízí (= co má na disku)."""
    info = json.load(urllib.request.urlopen(f"{HOST}/object_info/{node}"))
    return info[node]["input"]["required"][field][0]


def preflight(loras: list[str]) -> None:
    """Ověří, že ComfyUI běží a zná potřebné soubory — dřív, než se pošle graf.

    Bez téhle kontroly se chybějící váhy projeví až timeoutem po mnoha minutách
    (model se „načítá"), což je matoucí.
    """
    try:
        chybi = [f"{n} ({p})" for n, p, f in (
            (UNET, "models/diffusion_models", "UNETLoader:unet_name"),
            (CLIP, "models/text_encoders", "CLIPLoader:clip_name"),
            (VAE, "models/vae", "VAELoader:vae_name"))
            if n not in _volby(*f.split(":"))]
        dostupne_lory = _volby("LoraLoaderModelOnly", "lora_name") if loras else []
        chybi += [f"{n} (models/loras)" for n in loras if n not in dostupne_lory]
    except urllib.error.URLError as e:
        sys.exit(f"CHYBA: ComfyUI neběží na {HOST}? ({e})\n"
                 f"       Spusť run_nvidia_gpu.bat v ComfyUI_windows_portable.")
    except (KeyError, ValueError) as e:
        print(f"  ! preflight přeskočen ({e})", file=sys.stderr)
        return
    if chybi:
        sys.exit("CHYBA: ComfyUI nezná tyhle soubory:\n  - " + "\n  - ".join(chybi)
                 + "\n       Stáhni je: python scripts/dev/setup_qwen_edit.py --comfy <cesta>")


def srovnej_rozmer(png: bytes, sirka: int, vyska: int) -> bytes:
    """Doskládá výstup na přesný rozměr vstupu (VAE zaokrouhluje na násobky 8)."""
    try:
        from PIL import Image
    except ImportError:
        print("  ! bez Pillow nelze srovnat rozměr — nechávám, jak přišel", file=sys.stderr)
        return png
    import io
    im = Image.open(io.BytesIO(png))
    if im.size == (sirka, vyska):
        return png
    buf = io.BytesIO()
    im.resize((sirka, vyska), Image.LANCZOS).save(buf, format="PNG")
    print(f"  rozměr {im.size[0]}x{im.size[1]} -> {sirka}x{vyska}")
    return buf.getvalue()


def pridej_pad(path: Path, podil: float) -> tuple[Path, tuple[int, int]]:
    """Vloží obrázek doprostřed většího černého plátna a vrátí cestu k němu.

    Model komponuje motiv tak, aby vyplnil plátno — u artu, který se okraje
    dotýká (špička rámu, spodní hrot), mu proto usekne konce. S okrajem má kam
    ustoupit; `orizni_pad` ho po generování zase odřízne.
    """
    from PIL import Image
    import tempfile
    im = Image.open(path).convert("RGB")
    dx, dy = round(im.width * podil), round(im.height * podil)
    plat = Image.new("RGB", (im.width + 2 * dx, im.height + 2 * dy), (0, 0, 0))
    plat.paste(im, (dx, dy))
    tmp = Path(tempfile.gettempdir()) / f"qwen_pad_{path.stem}.png"
    plat.save(tmp)
    print(f"  pad {podil:.0%}: {im.width}x{im.height} -> {plat.width}x{plat.height}")
    return tmp, im.size


def orizni_pad(png: bytes, podil: float) -> bytes:
    """Odřízne okraj přidaný `pridej_pad` (počítá se z podílu, ne z pixelů)."""
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(png))
    dx = round(im.width * podil / (1.0 + 2.0 * podil))
    dy = round(im.height * podil / (1.0 + 2.0 * podil))
    im = im.crop((dx, dy, im.width - dx, im.height - dy))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def upload_image(path: Path) -> str:
    """Nahraje obrázek do ComfyUI (input) a vrátí jeho serverové jméno."""
    boundary = "----koshishatsi"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; "
            f"filename=\"{path.name}\"\r\nContent-Type: image/png\r\n\r\n"
            ).encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(HOST + "/upload/image", data=body, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}"})
    return json.load(urllib.request.urlopen(req))["name"]


def workflow(prompt: str, names: list[str], seed: int, steps: int, cfg: float,
             shift: float, fast: bool, keep_size: bool, negative: str,
             loras: list[tuple[str, float]] | None = None,
             denoise: float = 1.0) -> dict:
    """Graf v API formátu podle šablony `image_qwen_image_edit_2511.json`.

    Řetěz modelu:  UNETLoader → ModelSamplingAuraFlow → [Lightning LoRA] → CFGNorm.
    Podmínění:     TextEncodeQwenImageEditPlus dostane VAE i všechny obrázky,
                   takže do conditioningu přidá referenční latenty (identita).
    Latent:        první obrázek přes VAEEncode; bez --keep-size ho napřed
                   `FluxKontextImageScale` srovná na preferovaný poměr.
    Denoise:       šablona jede na 1,0 (obraz se kreslí od nuly a identitu drží
                   jen referenční latenty v conditioningu). Nižší hodnota nechá
                   sampler vyjít z původního obrázku, takže se zachová i SAZBA
                   a rukopis — na drobné úpravy hotového artu ~0,6–0,8.
    """
    g: dict = {
        "unet": {"class_type": "UNETLoader", "inputs": {
            "unet_name": UNET, "weight_dtype": "default"}},
        "shift": {"class_type": "ModelSamplingAuraFlow", "inputs": {
            "model": ["unet", 0], "shift": shift}},
        "clip": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": CLIP, "type": "qwen_image"}},
        "vae": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
    }

    model_src = "shift"
    # Řetěz LoRA: nejdřív volitelné (Multiple-angles, Relight, Light-Migration…),
    # nakonec Lightning, který jen zkracuje počet kroků.
    for i, (name, strength) in enumerate(loras or []):
        key = f"lora{i}"
        g[key] = {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": [model_src, 0], "lora_name": name, "strength_model": strength}}
        model_src = key
    if fast:
        g["lora_fast"] = {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": [model_src, 0], "lora_name": LIGHTNING, "strength_model": 1.0}}
        model_src = "lora_fast"
    g["cfgnorm"] = {"class_type": "CFGNorm", "inputs": {
        "model": [model_src, 0], "strength": 1.0}}

    # Vstupní obrázky — první je zároveň zdrojem latentu (tedy rozměru výstupu).
    for i, name in enumerate(names, start=1):
        g[f"img{i}"] = {"class_type": "LoadImage", "inputs": {"image": name}}

    latent_src = "img1"
    if not keep_size:
        g["kscale"] = {"class_type": "FluxKontextImageScale", "inputs": {
            "image": ["img1", 0]}}
        latent_src = "kscale"
    g["enc"] = {"class_type": "VAEEncode", "inputs": {
        "pixels": [latent_src, 0], "vae": ["vae", 0]}}

    def encode(text: str) -> dict:
        node = {"class_type": "TextEncodeQwenImageEditPlus", "inputs": {
            "clip": ["clip", 0], "prompt": text, "vae": ["vae", 0]}}
        for i in range(1, len(names) + 1):
            node["inputs"][f"image{i}"] = [f"img{i}", 0]
        return node

    g["pos"] = encode(prompt)
    g["neg"] = encode(negative)
    g["sample"] = {"class_type": "KSampler", "inputs": {
        "model": ["cfgnorm", 0], "positive": ["pos", 0], "negative": ["neg", 0],
        "latent_image": ["enc", 0], "seed": seed, "steps": steps, "cfg": cfg,
        "sampler_name": "euler", "scheduler": "simple", "denoise": denoise}}
    g["decode"] = {"class_type": "VAEDecode", "inputs": {
        "samples": ["sample", 0], "vae": ["vae", 0]}}
    g["save"] = {"class_type": "SaveImage", "inputs": {
        "images": ["decode", 0], "filename_prefix": "qwen_edit"}}
    return g


def generate(graph: dict, timeout_s: int = 900) -> bytes:
    """Odešle graf, počká na výsledek a vrátí PNG bajty. Vyhodí RuntimeError."""
    payload = json.dumps({"prompt": graph}).encode()
    req = urllib.request.Request(HOST + "/prompt", data=payload,
                                 headers={"Content-Type": "application/json"})
    try:
        pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:800]
        raise RuntimeError(f"ComfyUI graf odmítl ({e.code}): {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"ComfyUI neběží na {HOST}? ({e})") from e

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        time.sleep(2)
        try:
            hist = json.load(urllib.request.urlopen(f"{HOST}/history/{pid}"))
        except urllib.error.URLError:
            continue
        if pid not in hist:
            continue
        status = hist[pid].get("status", {})
        if status.get("status_str") == "error":
            raise RuntimeError("generování selhalo: " + json.dumps(status)[:800])
        if status.get("completed") or status.get("status_str") == "success":
            for out in hist[pid]["outputs"].values():
                if "images" in out:
                    img = out["images"][0]
                    q = urllib.parse.urlencode({
                        "filename": img["filename"],
                        "subfolder": img.get("subfolder", ""),
                        "type": img.get("type", "output")})
                    return urllib.request.urlopen(f"{HOST}/view?{q}").read()
            raise RuntimeError("v outputs není žádný obrázek")
    raise RuntimeError(f"timeout {timeout_s}s — model se možná teprve načítá "
                       f"(prvních 19 GiB vah chvíli trvá), zkus znovu")


def main() -> None:
    global HOST  # musí být před prvním použitím jména ve funkci (jinak SyntaxError)
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path, help="upravovaný obrázek (Picture 1)")
    ap.add_argument("prompt", help="anglická instrukce editace")
    ap.add_argument("-o", "--out", default="qwen_edit_out",
                    help="výstupní PNG, nebo složka při -n > 1")
    ap.add_argument("-n", "--count", type=int, default=1, help="počet variant (různé seedy)")
    ap.add_argument("--ref", type=Path, help="druhý obrázek (Picture 2), např. zdroj detailu")
    ap.add_argument("--ref2", type=Path, help="třetí obrázek (Picture 3)")
    ap.add_argument("--seed", type=int, help="pevný seed (jinak náhodný; vypisuje se)")
    ap.add_argument("--steps", type=int, help=f"kroky (default {DEFAULTS['steps']}, s --fast {DEFAULTS['fast_steps']})")
    ap.add_argument("--cfg", type=float, help=f"cfg (default {DEFAULTS['cfg']}, s --fast {DEFAULTS['fast_cfg']})")
    ap.add_argument("--shift", type=float, default=DEFAULTS["shift"], help="ModelSamplingAuraFlow shift")
    ap.add_argument("--denoise", type=float, default=1.0,
                    help="1,0 = kreslit od nuly (šablona); NIŽŠÍ drží sazbu a rukopis "
                         "originálu — na drobné úpravy hotového artu ~0,6–0,8")
    ap.add_argument("--pad", type=float, default=0.0, metavar="PODÍL",
                    help="dočasný černý okraj kolem vstupu (např. 0.12), po "
                         "generování se zase odřízne — brání modelu překomponovat "
                         "motiv tak, aby vyplnil plátno (usekne špičky a rohy)")
    ap.add_argument("--fast", action="store_true",
                    help="Lightning LoRA: 4 kroky, cfg 1 (rychlé náhledy)")
    ap.add_argument("--keep-size", action="store_true",
                    help="nezarovnávat vstup na preferovaný poměr (drží rozměr vstupu)")
    ap.add_argument("--lora", action="append", default=[], metavar="SOUBOR[:SÍLA]",
                    help="přidat LoRA (lze víckrát), např. "
                         "Qwen-Edit-2509-Multiple-angles.safetensors:0.8")
    ap.add_argument("--negative", default="",
                    help="negativní prompt (šablona nechává prázdný)")
    ap.add_argument("--host", default=HOST, help="adresa ComfyUI")
    a = ap.parse_args()
    HOST = a.host.rstrip("/")

    for p in (a.input, a.ref, a.ref2):
        if p is not None and not p.exists():
            sys.exit(f"CHYBA: {p} neexistuje")

    steps = a.steps if a.steps is not None else (DEFAULTS["fast_steps"] if a.fast else DEFAULTS["steps"])
    cfg = a.cfg if a.cfg is not None else (DEFAULTS["fast_cfg"] if a.fast else DEFAULTS["cfg"])

    loras: list[tuple[str, float]] = []
    for spec in a.lora:
        name, _, strength = spec.rpartition(":")
        if not name:                       # bez dvojtečky = jen jméno souboru
            name, strength = spec, "1.0"
        try:
            loras.append((name, float(strength)))
        except ValueError:
            sys.exit(f"CHYBA: --lora {spec} — síla musí být číslo")

    preflight([n for n, _ in loras] + ([LIGHTNING] if a.fast else []))

    vstup = a.input
    cil = None
    if a.keep_size:                      # rozměr vstupu, na který se výstup srovná
        try:
            from PIL import Image
            with Image.open(a.input) as im:
                cil = im.size
        except ImportError:
            pass
    if a.pad > 0.0:                      # okraj se přidá PŘED nahráním a po generování odřízne
        vstup, _ = pridej_pad(a.input, a.pad)

    names = [upload_image(p) for p in (vstup, a.ref, a.ref2) if p is not None]
    print(f"obrázky: {', '.join(names)}")

    out = Path(a.out)
    multi = a.count > 1
    if multi:
        out.mkdir(parents=True, exist_ok=True)
    elif out.suffix.lower() != ".png":
        out = out.with_suffix(".png")

    for i in range(a.count):
        seed = a.seed if (a.seed is not None and not multi) else random.randint(0, 2**63 - 1)
        print(f"[{i + 1}/{a.count}] seed={seed} steps={steps} cfg={cfg}"
              f"{' fast' if a.fast else ''}")
        t0 = time.time()
        png = generate(workflow(a.prompt, names, seed, steps, cfg, a.shift,
                                a.fast, a.keep_size, a.negative, loras, a.denoise))
        if a.pad > 0.0:                  # napřed pryč s okrajem, teprve pak srovnat rozměr
            png = orizni_pad(png, a.pad)
        if cil:
            png = srovnej_rozmer(png, *cil)
        dest = out / f"{seed}.png" if multi else out
        dest.write_bytes(png)
        print(f"  -> {dest} ({len(png) // 1024} kB, {time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()

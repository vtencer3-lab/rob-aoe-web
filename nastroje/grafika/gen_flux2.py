# -*- coding: utf-8 -*-
"""Generování herních assetů přes Flux.2-dev + vlastní LoRA (ComfyUI API).

Nejnovější postup (2026-07): objekt na černém pozadí ve stylu naší malované
sady generuje vlastní LoRA `koshishatsi_flux2` natrénovaný na Scenario.

Použití:
  python scripts/dev/gen_flux2.py "A pile of bricks explodes upwards..." -o vystup.png
  python scripts/dev/gen_flux2.py "..." -n 4 -o slozka/         # 4 varianty
  python scripts/dev/gen_flux2.py "..." --seed 123 --steps 28 --guidance 4.5
  python scripts/dev/gen_flux2.py "širokoúhlá scéna" --width 1536 --height 768  # nečtvercové rozlišení

img2img (přegenerování referenčního obrázku do našeho stylu, drží kompozici):
  python scripts/dev/gen_flux2.py "popis scény" --ref predloha.png -o vystup.png
  # --denoise 0.5 = věrná kompozice (default) … 0.8 = volná inspirace

Předpoklady (jednorázově, viz docs/generovani-obrazku.md, sekce Flux 2):
  - běžící ComfyUI ≥ 0.27 (portable) na http://127.0.0.1:8188
  - models/diffusion_models/flux2_dev_fp8mixed.safetensors
  - models/text_encoders/mistral_3_small_flux2_fp8.safetensors
  - models/vae/flux2-vae.safetensors
  - models/loras/koshishatsi_flux2.safetensors

K promptu se automaticky přidá standardní sufix pro izolovaný game asset
(vypnutí: --raw). Vyklíčování pozadí se řeší až následně (Scenario, případně
lokální pipeline — viz docs).
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
SUFFIX = ", isolated on a plain black background, game prop asset"

# Ověřené parametry (2026-07-25, seed 8447789751369997711 = test výbuchu cihel)
DEFAULTS = {"steps": 24, "guidance": 4.0, "lora": 1.0, "size": 1024}


def upload_image(path: Path) -> str:
    """Nahraje obrázek do ComfyUI (input) a vrátí jeho serverové jméno."""
    boundary = "----koshishatsi"
    data = path.read_bytes()
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; "
            f"filename=\"{path.name}\"\r\nContent-Type: image/png\r\n\r\n"
            ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(HOST + "/upload/image", data=body, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}"})
    return json.load(urllib.request.urlopen(req))["name"]


def workflow(prompt: str, seed: int, steps: int, guidance: float,
             lora_strength: float, width: int, height: int,
             ref_name: str | None = None, denoise: float = 0.5) -> dict:
    """Flux 2 graf v API formátu — custom sampling cesta (ne KSampler).

    S ref_name jede img2img: referenční obrázek se zakóduje do latentu a sigmas
    se seříznou na posledních `denoise` — kompozice předlohy zůstane, styl náš.
    """
    return {
        "unet": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "flux2_dev_fp8mixed.safetensors", "weight_dtype": "default"}},
        "clip": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "mistral_3_small_flux2_fp8.safetensors", "type": "flux2"}},
        "vae": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        # Flux LoRA jsou model-only (CLIP se neupravuje)
        "lora": {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": ["unet", 0], "lora_name": "koshishatsi_flux2.safetensors",
            "strength_model": lora_strength}},
        "pos": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["clip", 0]}},
        "flux_guidance": {"class_type": "FluxGuidance", "inputs": {
            "conditioning": ["pos", 0], "guidance": guidance}},
        "guider": {"class_type": "BasicGuider", "inputs": {
            "model": ["lora", 0], "conditioning": ["flux_guidance", 0]}},
        "latent": {"class_type": "EmptyFlux2LatentImage", "inputs": {
            "width": width, "height": height, "batch_size": 1}},
        "sched": {"class_type": "Flux2Scheduler", "inputs": {
            "steps": steps, "width": width, "height": height}},
        "sampler_sel": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "noise": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "sample": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["noise", 0], "guider": ["guider", 0], "sampler": ["sampler_sel", 0],
            "sigmas": ["sched", 0], "latent_image": ["latent", 0]}},
        "decode": {"class_type": "VAEDecode", "inputs": {
            "samples": ["sample", 0], "vae": ["vae", 0]}},
        "save": {"class_type": "SaveImage", "inputs": {
            "images": ["decode", 0], "filename_prefix": "koshishatsi"}},
    } if ref_name is None else {
        # img2img: LoadImage → VAEEncode místo prázdného latentu; seříznuté sigmas
        "unet": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "flux2_dev_fp8mixed.safetensors", "weight_dtype": "default"}},
        "clip": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "mistral_3_small_flux2_fp8.safetensors", "type": "flux2"}},
        "vae": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "lora": {"class_type": "LoraLoaderModelOnly", "inputs": {
            "model": ["unet", 0], "lora_name": "koshishatsi_flux2.safetensors",
            "strength_model": lora_strength}},
        "img": {"class_type": "LoadImage", "inputs": {"image": ref_name}},
        "enc": {"class_type": "VAEEncode", "inputs": {"pixels": ["img", 0], "vae": ["vae", 0]}},
        "pos": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["clip", 0]}},
        "flux_guidance": {"class_type": "FluxGuidance", "inputs": {
            "conditioning": ["pos", 0], "guidance": guidance}},
        "guider": {"class_type": "BasicGuider", "inputs": {
            "model": ["lora", 0], "conditioning": ["flux_guidance", 0]}},
        "sched": {"class_type": "Flux2Scheduler", "inputs": {
            "steps": steps, "width": width, "height": height}},
        "split": {"class_type": "SplitSigmasDenoise", "inputs": {
            "sigmas": ["sched", 0], "denoise": denoise}},
        "sampler_sel": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "noise": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "sample": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["noise", 0], "guider": ["guider", 0], "sampler": ["sampler_sel", 0],
            "sigmas": ["split", 1], "latent_image": ["enc", 0]}},  # low_sigmas
        "decode": {"class_type": "VAEDecode", "inputs": {
            "samples": ["sample", 0], "vae": ["vae", 0]}},
        "save": {"class_type": "SaveImage", "inputs": {
            "images": ["decode", 0], "filename_prefix": "koshishatsi"}},
    }


def generate(prompt: str, seed: int, steps: int, guidance: float,
             lora_strength: float, width: int, height: int, timeout_s: int = 600,
             ref_name: str | None = None, denoise: float = 0.5) -> bytes:
    """Odešle graf, počká na výsledek a vrátí PNG bajty. Vyhodí RuntimeError."""
    payload = json.dumps({"prompt": workflow(
        prompt, seed, steps, guidance, lora_strength, width, height,
        ref_name, denoise)}).encode()
    req = urllib.request.Request(HOST + "/prompt", data=payload,
                                 headers={"Content-Type": "application/json"})
    try:
        pid = json.load(urllib.request.urlopen(req))["prompt_id"]
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
            raise RuntimeError("generování selhalo: " + json.dumps(status)[:500])
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
    raise RuntimeError(f"timeout {timeout_s}s — model se možná teprve načítá, zkus znovu")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("prompt", help="anglický popis objektu (styl dodá LoRA)")
    ap.add_argument("-o", "--out", default="flux2_out",
                    help="výstupní PNG, nebo složka při -n > 1 (default: flux2_out)")
    ap.add_argument("-n", "--count", type=int, default=1, help="počet variant (různé seedy)")
    ap.add_argument("--seed", type=int, help="pevný seed (jinak náhodný; vypisuje se)")
    ap.add_argument("--steps", type=int, default=DEFAULTS["steps"])
    ap.add_argument("--guidance", type=float, default=DEFAULTS["guidance"])
    ap.add_argument("--lora", type=float, default=DEFAULTS["lora"], help="síla LoRA (0–1)")
    ap.add_argument("--size", type=int, default=DEFAULTS["size"], help="rozlišení (čtverec)")
    ap.add_argument("--width", type=int, help="šířka (jinak --size)")
    ap.add_argument("--height", type=int, help="výška (jinak --size)")
    ap.add_argument("--raw", action="store_true",
                    help="nepřidávat standardní sufix (black background, game prop asset)")
    ap.add_argument("--ref", help="img2img: referenční obrázek (drží kompozici)")
    ap.add_argument("--denoise", type=float, default=0.5,
                    help="img2img síla přegenerování 0–1 (default 0.5 = věrná kompozice)")
    a = ap.parse_args()

    ref_name = upload_image(Path(a.ref)) if a.ref else None
    prompt = a.prompt if a.raw else a.prompt.rstrip(". ") + SUFFIX
    out = Path(a.out)
    multi = a.count > 1
    if multi:
        out.mkdir(parents=True, exist_ok=True)
    elif out.suffix.lower() != ".png":
        out = out.with_suffix(".png")

    for i in range(a.count):
        seed = a.seed if (a.seed is not None and not multi) else random.randint(0, 2**63 - 1)
        mode = f" img2img(denoise={a.denoise})" if ref_name else ""
        print(f"[{i + 1}/{a.count}] seed={seed} steps={a.steps} guidance={a.guidance}{mode}")
        png = generate(prompt, seed, a.steps, a.guidance, a.lora,
                       a.width or a.size, a.height or a.size,
                       ref_name=ref_name, denoise=a.denoise)
        dest = out / f"{seed}.png" if multi else out
        dest.write_bytes(png)
        print(f"  -> {dest} ({len(png) // 1024} kB)")


if __name__ == "__main__":
    main()

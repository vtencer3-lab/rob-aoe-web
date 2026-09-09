# -*- coding: utf-8 -*-
"""Z vygenerovaného rámu udělá kanonický devítidílný rámeček pro CSS border-image.

Proč se rám nedá použít rovnou: model kreslí obraz, ne dlaždici. Strany nejsou
přesně stejné, vnitřní otvor je o pár pixelů nakřivo a kolem je černé pozadí.
`border-image` ale potřebuje, aby se prostřední část každé strany dala donekonečna
opakovat bez viditelného švu. Proto se z předlohy vezmou jen čtyři rohy a z každé
strany jeden čistý proužek, a z nich se rám složí znovu — se zaručenou geometrií.

Průhlednost: pozadí i vnitřek jsou černé plochy, které spolu nesousedí, takže se
obě vyplaví záplavou (flood fill) z okrajů a ze středu. Prahování samotné by
sežralo tmavé dřevo rámu.

  python devitidil.py ram_02.png -o ram.png --roh 250 --pas 64
  python devitidil.py ram_02.png -o ram.png --roh 250 --pas 64 --nahled ram_nahled.png
"""
import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def zaplav_pozadi(im: Image.Image, prah: int = 70, jen_stred: bool = False) -> Image.Image:
    """Vrátí masku (L): 255 = obsah rámu, 0 = černé pozadí venku i otvor uvnitř.

    `jen_stred` zaplavuje pouze otvor uprostřed. Hodí se, když okolí odstranil
    někdo jiný: v obrázku s vyříznutým pozadím je venek dokonale černý a záplava
    od rohů by po něm protekla i do tmavého dřeva rámu. Maska otvoru se proto
    počítá z původního renderu, kde má kde skončit.
    """
    sedy = im.convert("L")
    # Záplava pracuje nad kopií, do které si značí navštívené pixely bílou.
    znacka = sedy.copy()
    stred = [(im.width // 2, im.height // 2)]
    body = stred if jen_stred else [
        (0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1), *stred]
    for bod in body:
        if znacka.getpixel(bod) < 255:
            ImageDraw.floodfill(znacka, bod, 255, thresh=prah)
    # Co záplava obarvila na 255 a v originále to bylo tmavé, je pozadí.
    puvodni = sedy.load()
    oznacene = znacka.load()
    maska = Image.new("L", im.size, 255)
    px = maska.load()
    for y in range(im.height):
        for x in range(im.width):
            if oznacene[x, y] == 255 and puvodni[x, y] < 255:
                px[x, y] = 0
    return maska


def orez_na_obsah(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def zrcadlove_bezesvy(pruh: Image.Image, vodorovne: bool) -> Image.Image:
    """Udělá z proužku dlaždici, která na sebe navazuje sama na sebe.

    Proužek se prolne se svým zrcadlovým obrazem s rampou 0→1. Tím se levý
    a pravý konec (resp. horní a dolní) srovnají na tutéž hodnotu, takže
    opakování nemá šev. Zrcadlení navíc drží polohu zlatých linek, které by
    posunutý ofset rozjel.
    """
    import numpy as np

    a = np.asarray(pruh.convert("RGBA")).astype(np.float32)
    osa = 1 if vodorovne else 0
    n = a.shape[osa]
    rampa = np.linspace(0.0, 1.0, n, dtype=np.float32)
    rampa = rampa * rampa * (3 - 2 * rampa)  # smoothstep, ať přechod není lineárně tvrdý
    tvar = (1, n, 1) if vodorovne else (n, 1, 1)
    w = rampa.reshape(tvar)
    zrcadlo = np.flip(a, axis=osa)
    return Image.fromarray(((1 - w) * a + w * zrcadlo).astype("uint8"), "RGBA")


def vyhlad_podel(pruh: Image.Image, vodorovne: bool, sila: float) -> Image.Image:
    """Srovná proužek podél směru, ve kterém se bude opakovat.

    Předloha má po délce hrany světelný přechod. Po opakování z něj vzniknou
    pravidelné světlé a tmavé pruhy, které na panelu bijí do očí víc než
    chybějící kresba dřeva. Proto se každý sloupec (resp. řádek) přimíchá
    k průměru všech — kolmo na hranu zůstane kresba i zlaté linky, podél
    hrany se srovná jas.
    """
    import numpy as np

    if sila <= 0:
        return pruh
    a = np.asarray(pruh.convert("RGBA")).astype(np.float32)
    osa = 1 if vodorovne else 0
    prumer = a.mean(axis=osa, keepdims=True)
    return Image.fromarray(((1 - sila) * a + sila * prumer).astype("uint8"), "RGBA")


def srovnej_na_roh(pruh: Image.Image, roh_im: Image.Image) -> Image.Image:
    """Posune tón proužku tak, aby po řádcích navazoval na poslední sloupec rohu."""
    import numpy as np

    a = np.asarray(pruh.convert("RGBA")).astype(np.float32)
    r = np.asarray(roh_im.convert("RGBA")).astype(np.float32)
    okraj = r[:, -1:, :3]                      # poslední sloupec rohu, po řádcích
    ted = a[:, :, :3].mean(axis=1, keepdims=True)
    a[:, :, :3] = np.clip(a[:, :, :3] + (okraj - ted), 0, 255)
    return Image.fromarray(a.astype("uint8"), "RGBA")


def slozit(im: Image.Image, roh: int, pas: int, symetricky: bool = True,
           vyhlad: float = 0.85) -> Image.Image:
    """Rohy z předlohy, strany z proužku hned vedle rohu.

    Proužek se bere těsně za rohem, ne ze středu strany — jen tak na roh
    navazují zlaté linky přesně. Aby opakování nedělalo šev, projde proužek
    zrcadlovým prolnutím.

    **Symetrický režim (výchozí):** všechny čtyři rohy i všechny čtyři strany
    se odvodí z jediného rohu a jediného proužku otáčením a zrcadlením. Model
    totiž každou stranu maluje trochu jinak — dolní hrana vyšla o odstín jinde
    než svislé, a na hotovém panelu to bylo vidět jako nesouvislý rám. Cenou je,
    že rám nemá směrové nasvícení; herní rámy ho stejně nemívají.
    """
    s, v = im.size
    velikost = roh * 2 + pas
    out = Image.new("RGBA", (velikost, velikost), (0, 0, 0, 0))

    if symetricky:
        # Roh se nejdřív zesouměrní podle úhlopříčky. Model kreslí horní pás
        # jinak tlustý než levý, takže otočená strana na roh nesedla a zlaté
        # linky se o pár pixelů minuly. Průměr rohu s jeho překlopením přes
        # úhlopříčku má obě hrany stejné, a otočené strany pak navazují přesně.
        import numpy as np

        vyrez = im.crop((0, 0, roh, roh))
        a_roh = np.asarray(vyrez.convert("RGBA")).astype(np.float32)
        a_roh = (a_roh + np.transpose(a_roh, (1, 0, 2))) / 2
        roh_lh = Image.fromarray(a_roh.astype("uint8"), "RGBA")
        out.paste(roh_lh, (0, 0))
        out.paste(roh_lh.transpose(Image.FLIP_LEFT_RIGHT), (velikost - roh, 0))
        out.paste(roh_lh.transpose(Image.FLIP_TOP_BOTTOM), (0, velikost - roh))
        out.paste(roh_lh.transpose(Image.ROTATE_180), (velikost - roh, velikost - roh))

        horni = vyhlad_podel(zrcadlove_bezesvy(im.crop((roh, 0, roh + pas, roh)), True), True, vyhlad)
        # Vyhlazený proužek má jiný průměrný jas než roh, ze kterého vychází,
        # takže na styku vznikal schod. Srovná se to po řádcích na poslední
        # sloupec rohu — geometrie ani kresba se nemění, jen se posune tón.
        horni = srovnej_na_roh(horni, roh_lh)
        # ROTATE_90 je proti směru hodin: horní (vnější) hrana proužku se
        # překlopí doleva, což je přesně vnější hrana levé strany rámu.
        levy = horni.transpose(Image.ROTATE_90)
        out.paste(horni, (roh, 0))
        out.paste(horni.transpose(Image.FLIP_TOP_BOTTOM), (roh, velikost - roh))
        out.paste(levy, (0, roh))
        out.paste(levy.transpose(Image.FLIP_LEFT_RIGHT), (velikost - roh, roh))
        return out

    # Rohy
    out.paste(im.crop((0, 0, roh, roh)), (0, 0))
    out.paste(im.crop((s - roh, 0, s, roh)), (velikost - roh, 0))
    out.paste(im.crop((0, v - roh, roh, v)), (0, velikost - roh))
    out.paste(im.crop((s - roh, v - roh, s, v)), (velikost - roh, velikost - roh))

    # Vodorovné strany
    horni = zrcadlove_bezesvy(im.crop((roh, 0, roh + pas, roh)), True)
    dolni = zrcadlove_bezesvy(im.crop((roh, v - roh, roh + pas, v)), True)
    out.paste(horni, (roh, 0))
    out.paste(dolni, (roh, velikost - roh))

    # Svislé strany
    levy = zrcadlove_bezesvy(im.crop((0, roh, roh, roh + pas)), False)
    pravy = zrcadlove_bezesvy(im.crop((s - roh, roh, s, roh + pas)), False)
    out.paste(levy, (0, roh))
    out.paste(pravy, (velikost - roh, roh))

    # Střed zůstává průhledný — výplň panelu si dělá CSS.
    return out


def nahled(devitidil: Image.Image, roh: int, sirka: int, vyska: int) -> Image.Image:
    """Poskládá rám do zadaného obdélníku stejně, jako to udělá border-image."""
    v = devitidil.size[0]
    pas = v - 2 * roh
    out = Image.new("RGBA", (sirka, vyska), (0, 0, 0, 0))
    out.paste(devitidil.crop((0, 0, roh, roh)), (0, 0))
    out.paste(devitidil.crop((v - roh, 0, v, roh)), (sirka - roh, 0))
    out.paste(devitidil.crop((0, v - roh, roh, v)), (0, vyska - roh))
    out.paste(devitidil.crop((v - roh, v - roh, v, v)), (sirka - roh, vyska - roh))
    horni = devitidil.crop((roh, 0, roh + pas, roh))
    dolni = devitidil.crop((roh, v - roh, roh + pas, v))
    for x in range(roh, sirka - roh, pas):
        sirka_dilu = min(pas, sirka - roh - x)
        out.paste(horni.crop((0, 0, sirka_dilu, roh)), (x, 0))
        out.paste(dolni.crop((0, 0, sirka_dilu, roh)), (x, vyska - roh))
    levy = devitidil.crop((0, roh, roh, roh + pas))
    pravy = devitidil.crop((v - roh, roh, v, roh + pas))
    for y in range(roh, vyska - roh, pas):
        vyska_dilu = min(pas, vyska - roh - y)
        out.paste(levy.crop((0, 0, roh, vyska_dilu)), (0, y))
        out.paste(pravy.crop((0, 0, roh, vyska_dilu)), (sirka - roh, y))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("vstup", type=Path)
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("--roh", type=int, default=250, help="velikost rohu v pixelech předlohy")
    ap.add_argument("--pas", type=int, default=64, help="šířka opakovaného proužku strany")
    ap.add_argument("--prah", type=int, default=70, help="tolerance záplavy při odstranění černé")
    ap.add_argument("--vyhlad", type=float, default=0.85,
                    help="0–1: jak srovnat jas proužku podél hrany (proti pruhům z opakování)")
    ap.add_argument("--nesymetricky", action="store_true",
                    help="strany brát každou z její vlastní hrany předlohy (model je maluje jinak)")
    ap.add_argument("--bez-orezu", action="store_true")
    ap.add_argument("--alfa-ze-vstupu", action="store_true",
                    help="pozadí už odstranil někdo jiný (Scenario); vlastní záplavu neprovádět")
    ap.add_argument("--otvor-z", type=Path, default=None,
                    help="původní render (stejný rozměr), ze kterého se vezme otvor uprostřed rámu")
    ap.add_argument("--nahled", type=Path, default=None, help="kam uložit zkoušku poskládání")
    args = ap.parse_args()

    im = Image.open(args.vstup).convert("RGBA")
    # Vlastní záplava od rohů je náhrada za to, že difuze neumí průhlednost.
    # Když ji udělal někdo lepší (Scenario), přepsat cizí masku vlastní by
    # výsledek jen zhoršilo — dodělá se jen otvor uprostřed. Odstraňovač pozadí
    # totiž vyřízne předmět z okolí, ale díru uvnitř rámu za pozadí nepovažuje,
    # a devítidílný rám by pak měl v rozích neprůhledné cáry.
    if args.alfa_ze_vstupu:
        if args.otvor_z:
            otvor = zaplav_pozadi(Image.open(args.otvor_z), args.prah, jen_stred=True)
            otvor = otvor.filter(ImageFilter.GaussianBlur(0.8))
            im.putalpha(ImageChops.darker(im.getchannel("A"), otvor))
    else:
        maska = zaplav_pozadi(im, args.prah).filter(ImageFilter.GaussianBlur(0.8))
        im.putalpha(maska)
    if not args.bez_orezu:
        im = orez_na_obsah(im)
    print(f"po ořezu: {im.size[0]}x{im.size[1]}")

    devitidil = slozit(im, args.roh, args.pas, symetricky=not args.nesymetricky, vyhlad=args.vyhlad)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    devitidil.save(args.out)
    print(f"{args.out}  {devitidil.size[0]}x{devitidil.size[1]}  (roh {args.roh}, pás {args.pas})")

    if args.nahled:
        zkouska = nahled(devitidil, args.roh, 1200, 700)
        podklad = Image.new("RGBA", zkouska.size, (32, 26, 20, 255))
        podklad.alpha_composite(zkouska)
        podklad.convert("RGB").save(args.nahled)
        print(f"{args.nahled}  náhled 1200x700")


if __name__ == "__main__":
    main()

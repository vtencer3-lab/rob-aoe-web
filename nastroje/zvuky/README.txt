AoE2:DE – zvuky poplachu (town bell) vytažené z Wwise archivu
==============================================================
Datum: 2026-09-12
Zdroj: C:\Program Files (x86)\Steam\steamapps\common\AoE2DE\wwise\Base.pck
       (do instalace hry se nezapisovalo, jen se četlo)

Mapování událost -> wem -> soubor
---------------------------------
Událost (sounds.json)   Wwise event ID   Řetězec v bance 232745270.bnk                                   wem ID      Soubory
Play_Townbell_Stop      2237803748       Event -> ActionPlay 611239238 -> RanSeqCntr 6045455             477992262   townbell_stop_477992262.wav / .ogg / .mp3
  (klíč townbell_stop)  (0x85622ce4)       -> Sound 656849081 -> Source 477992262 (VORBIS, embedded)
Play_Townbell_Start     3748861528       Event -> ActionPlay 379153297 -> RanSeqCntr 1052270372          594980362   townbell_start_594980362.wav / .ogg / .mp3
  (klíč townbell_start) (0xdf731658)       -> Sound 988390492 -> Source 594980362 (VORBIS, embedded)

Oba náhodné kontejnery (CAkRanSeqCntr) mají ulNumChilds = 1 (jediná položka playlistu,
weight 50000) -> každá událost má jen JEDNU variantu zvuku, žádné další .wem k vytažení.
Event ID = FNV-1 32bit hash malých písmen názvu (ověřeno: shoduje se s CAkEvent v bance).
Zdroje jsou "Data/bnk", tj. wem je vložený přímo v sekci DIDX/DATA banky 232745270.bnk,
ne jako samostatný stream v PCK.

Délky
-----
townbell_stop_477992262.wav    2.000 s  (96000 vzorků, 48 kHz, stereo, PCM s16; slyšitelný obsah 0.00–1.13 s, špička 0.32)
townbell_stop_477992262.ogg    2.000 s  (Vorbis q6)
townbell_stop_477992262.mp3    2.040 s  (LAME V2; +40 ms je encoder padding MP3)
townbell_start_594980362.wav   2.000 s  (96000 vzorků, 48 kHz, stereo, PCM s16; slyšitelný obsah 0.00–1.70 s, špička 0.30)
townbell_start_594980362.ogg   2.000 s  (Vorbis q6)
townbell_start_594980362.mp3   2.040 s  (LAME V2)

Mezivýsledky (tmp\)
-------------------
tmp\pck.py                 – vlastní parser hlavičky AKPK (tabulky jazyků/bank/streamů)
tmp\extract_wem.py         – vytažení wem podle ID z DIDX/DATA sekce .bnk
tmp\bnk\*.bnk              – 5 soundbank z Base.pck (232745270, 503023331, 1305483010, 1355168291, 1638387902)
tmp\bnk\232745270.bnk.txt  – textový dump HIRC z wwiseru (60 MB)
tmp\txtp\*.txtp            – wwiser výstup pro obě události (cesta Event -> ... -> Source)
tmp\477992262.wem, tmp\594980362.wem – surové Wwise Vorbis soubory
tmp\wwiser.pyz             – stažený wwiser

Použité nástroje
----------------
- Python 3.13 (numpy pro kontrolu úrovní)
- vgmstream-cli r2117  (scoop: `scoop bucket add extras` ; `scoop install vgmstream`
                        -> C:\Users\mjouk\scoop\shims\vgmstream-cli.exe)
- wwiser v20260808     (curl -L https://github.com/bnnm/wwiser/releases/latest/download/wwiser.pyz)
- ffmpeg / ffprobe     (C:\ffmpeg\bin)

Přesné příkazy (Git Bash, cwd = tato složka nebo tmp\)
-------------------------------------------------------
# 1) ID událostí (FNV-1 32bit, malá písmena)
python -c "
def fnv(s):
    h=2166136261
    for c in s.lower().encode():
        h=(h*16777619)&0xffffffff; h^=c
    return h
for n in ['Play_Townbell_Stop','Play_Townbell_Start']: print(n, fnv(n))
"
#   -> Play_Townbell_Stop 2237803748, Play_Townbell_Start 3748861528

# 2) Banky z Base.pck (tmp/pck.py = vlastní parser AKPK; hlavička: 'AKPK', hsize u32, ver u32,
#    délky tabulek lang/bnk/stm (+ externals), položky (id, blockSize, fileSize, offsetBlocks, langId))
cd tmp && mkdir -p bnk && python - <<'EOF'
from pck import parse
f,ver,langs,banks,streams,ext=parse("C:/Program Files (x86)/Steam/steamapps/common/AoE2DE/wwise/Base.pck")
for fid,bs,fs,off,lid in banks:
    f.seek(off); open(f'bnk/{fid}.bnk','wb').write(f.read(fs))
EOF

# 3) Ve které bance jsou event ID (hledání little-endian bajtů) -> obě v HIRC 232745270.bnk
# 4) wwiser: dump + txtp jen pro obě události
python wwiser.pyz -d txt bnk/232745270.bnk
python wwiser.pyz -g -gf 2237803748 3748861528 -go txtp bnk/232745270.bnk
#   txtp: "#s2634 ##477992262.wem" (Stop), "#s3270 ##594980362.wem" (Start)

# 5) Vytažení wem z DIDX/DATA banky
python extract_wem.py bnk/232745270.bnk 477992262 594980362

# 6) Převod (z kořene složky)
vgmstream-cli -i -o townbell_stop_477992262.wav  tmp/477992262.wem
vgmstream-cli -i -o townbell_start_594980362.wav tmp/594980362.wem
ffmpeg -y -i townbell_stop_477992262.wav  -c:a libvorbis  -q:a 6 townbell_stop_477992262.ogg
ffmpeg -y -i townbell_stop_477992262.wav  -c:a libmp3lame -q:a 2 townbell_stop_477992262.mp3
ffmpeg -y -i townbell_start_594980362.wav -c:a libvorbis  -q:a 6 townbell_start_594980362.ogg
ffmpeg -y -i townbell_start_594980362.wav -c:a libmp3lame -q:a 2 townbell_start_594980362.mp3
ffprobe -v error -show_entries format=duration -of csv=p=0 <soubor>

Poznámka: `-i` u vgmstream-cli ignoruje loop (soubory stejně loop nemají). Alternativně jde
přeskočit krok 5 a dekódovat rovnou z banky: `vgmstream-cli -s 2634 -o x.wav tmp/bnk/232745270.bnk`.

Doplněk 13. 9. 2026 – zvuk přijaté zprávy v chatu
-------------------------------------------------
Play_Chat_Received   2568766646   Event 232745270-13610 -> #s2591 -> wem 468419989 (VORBIS, embedded v 232745270.bnk)
  python wwiser.pyz -g -gf 2568766646 -go txtp_chat bnk/232745270.bnk
  python extract_wem.py bnk/232745270.bnk 468419989 ; vgmstream-cli -i -o chat_received_468419989.wav tmp/468419989.wem
  ffmpeg -i chat_received_468419989.wav -c:a libmp3lame -q:a 2 chat_received_468419989.mp3 -> web/src/assets/chat.mp3

Doplněk 13. 9. 2026 – smích (taunt 11)
--------------------------------------
Play_Taunt_11_Random  1217387751  Event 232745270-12863 -> 6 náhodných variant (embedded v 232745270.bnk):
  wem 219413181, 304027938, 505627596, 670980093, 693140238, 971682679 -> web/src/assets/taunty/smich-1..6.mp3 (LAME q4)
Ostatní taunty ve Wwise bankách jako číslované události nejsou (prohledány event ID všech 5 bank
proti vzorům Play_Taunt_NNN apod.); jejich zvuk by chtěl rozbor datového souboru hry (empires2_x2_p1.dat).

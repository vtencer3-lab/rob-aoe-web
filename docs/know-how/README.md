# Know-how: co se v tomhle projektu vymyslelo a dá se vzít jinam

Referenční popisy funkcí webu jouki.cz/aoe, psané pro čtenáře, který zná web,
ale ne tenhle projekt. Každý soubor říká, **jak** funkce funguje (soubory,
funkce, datový model, klíčové výňatky), **proč** je tak, jak je (rozhodnutí,
slepé uličky) a **kde jsou pasti**. Historie změn a stav prací zůstávají
v [`../prehled-praci-a-zameru.md`](../prehled-praci-a-zameru.md); tady je jen
to, co má přežít projekt.

| Soubor | Co v něm je |
|---|---|
| [`chat.md`](chat.md) | Chat zápasu: datový model, cenzura, úpravy a mazání, důležité zprávy, „Nové zprávy“, posouvání jen na obrazovce, odpovědi, odznaky. |
| [`emoty-a-taunty.md`](emoty-a-taunty.md) | 7TV emoty (server cache, klient, zero-width vrstvy), DinkDonk za vykřičník, taunty ze hry, našeptávání s Tabem a fulltextem. |
| [`zvuky.md`](zvuky.md) | Jak vytáhnout zvuky z Wwise archivu AoE2 DE, hlasitost Master × podíl, prohlížečem zadržený zvuk, poplach naplno. |
| [`push-to-talk.md`](push-to-talk.md) | Hlas admina bez WebRTC: MediaRecorder → POST → SSE → MediaSource, komu se posílá, mute, omezení. |
| [`aktivita-a-svolani.md`](aktivita-a-svolani.md) | Lhůta aktivity, puls, „Jsem tu!“, spící hráči, zvonek a super zvonek, okno „tě shání!“, mazání svolání. |
| [`tabulka-prihlasenych.md`](tabulka-prihlasenych.md) | Tažení řádků pointer událostmi, FLIP animace řádků a šířek sloupců, řazení, ikona vlastnictví hry ze Steamu. |
| [`lobby-a-zapasy.md`](lobby-a-zapasy.md) | Odkaz `aoe2de://`, hledání lobby v seznamu hry, kontrola lobby a poslední známé nastavení, úprava zápasu jako návrh, heslo večera, mazání prázdných akcí, výběr mapy. |
| [`grafika-a-obrazky.md`](grafika-a-obrazky.md) | Postup pro obrázky: GPT Image přes Codex CLI, lokální generování, odstranění pozadí, TinyPNG, export do webp, ikony z exe. |
| [`ui-vzory.md`](ui-vzory.md) | Modály přes portál a zámek scrollu, bublina bez prodlevy, sbalitelná lišta, posuvníky, SVG ikony, uložené volby, reduced-motion. |
| [`proces-a-nasazeni.md`](proces-a-nasazeni.md) | Větve, verze, build s návratovým kódem, testy (DB jen na serveru), health, release přes PR a značky, dokumentace. |

Konvence v celém projektu: identifikátory a texty česky, commity anglicky,
komentáře „proč, ne co“. TypeScript ESM (`NodeNext`, `strict`), Fastify +
Postgres na serveru, React + Vite v `web/`. Migrace `database/NNN_*.sql` se
pouští samy při startu kontejneru. Stav se posílá přes SSE **vždy celý**,
nikdy přírůstky (viz `chat.md`, proč to všechno zjednodušuje).

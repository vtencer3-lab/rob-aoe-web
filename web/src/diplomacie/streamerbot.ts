import { TEP_MOSTU_S } from "../../../src/shared/diplomacie/hra.js";

/**
 * Kód akce pro Streamer.bot (sub-akce „Execute C# Code“), kterou si hráč
 * stáhne s vlastním klíčem mostu (uživatel 5. 10. 2026). Spouští ji Timed
 * Action každou sekundu: najde nejnovější `ROB_*.xsdat` ve složkách profilů
 * hry a když se změnil (nebo po 15 s jako tep), pošle ho tak, jak je, na
 * web. Bez běžící hry se jednou za `TEP_MOSTU_S` ozve tepem — pult GM tak
 * svítí zeleně hned po importu. Rozbor souboru dělá web (src/diplomacie/xsdat.ts) — akce zůstává
 * krátká a nezávislá na formátu sondy.
 *
 * Jen C# 5 a System.dll (WebClient), ať se přeloží v každém Streamer.botu
 * bez přidávání referencí; ověřeno překladačem .NET Frameworku.
 */
export function akceStreamerbotu(url: string, klic: string): string {
  // Tep jde vedle souboru sondy: …/api/diplo/hra-soubor → …/api/diplo/most/tep.
  const urlTepu = url.replace(/hra-soubor$/, "most/tep");
  return `// AoE2 Diplomacie — data ze hry na web (${url})
// Importováno z webu (Streamer.bot → Import). Spouští ho časovač
// „AoE Diplomacie — most“ každou sekundu. Klíč níž je tvůj osobní — nesdílej ho.
using System;
using System.IO;
using System.Net;
using System.Text;

public class CPHInline
{
    const string Url = "${url}";
    const string UrlTepu = "${urlTepu}";
    const string Klic = "${klic}";
    static string posledniSoubor = "";
    static DateTime posledniZmena = DateTime.MinValue;
    static DateTime posledniOdeslani = DateTime.MinValue;

    public bool Execute()
    {
        try
        {
            FileInfo nejnovejsi = null;
            string koren = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Games", "Age of Empires 2 DE");
            if (Directory.Exists(koren))
            {
                foreach (string profil in Directory.GetDirectories(koren))
                {
                    string slozka = Path.Combine(profil, "profile");
                    if (!Directory.Exists(slozka)) continue;
                    foreach (string cesta in Directory.GetFiles(slozka, "ROB_*.xsdat"))
                    {
                        FileInfo f = new FileInfo(cesta);
                        if (nejnovejsi == null || f.LastWriteTimeUtc > nejnovejsi.LastWriteTimeUtc) nejnovejsi = f;
                    }
                }
            }
            // Hra neběží (žádný soubor, nebo starší než 2 minuty): jen tep jednou za ${TEP_MOSTU_S} s,
            // ať web ukáže, že spojení funguje.
            if (nejnovejsi == null || DateTime.UtcNow - nejnovejsi.LastWriteTimeUtc > TimeSpan.FromMinutes(2))
            {
                if (DateTime.UtcNow - posledniOdeslani < TimeSpan.FromSeconds(${TEP_MOSTU_S})) return true;
                posledniOdeslani = DateTime.UtcNow;
                Posli(UrlTepu, "{}");
                return true;
            }
            bool zmena = nejnovejsi.FullName != posledniSoubor || nejnovejsi.LastWriteTimeUtc != posledniZmena;
            // Při změně hned, jinak tep jednou za 15 s (pozastavená hra).
            if (!zmena && DateTime.UtcNow - posledniOdeslani < TimeSpan.FromSeconds(15)) return true;
            posledniSoubor = nejnovejsi.FullName;
            posledniZmena = nejnovejsi.LastWriteTimeUtc;
            posledniOdeslani = DateTime.UtcNow;
            byte[] data;
            using (FileStream s = new FileStream(nejnovejsi.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (MemoryStream m = new MemoryStream())
            {
                s.CopyTo(m);
                data = m.ToArray();
            }
            Posli(Url, "{\\"jmeno\\":\\"" + nejnovejsi.Name.Replace("\\\\", "").Replace("\\"", "") + "\\",\\"soubor\\":\\"" + Convert.ToBase64String(data) + "\\"}");
        }
        catch (WebException e)
        {
            // 403 = nejsi GM běžícího zápasu, 404 = web zápas nenašel, 401 = neplatný klíč.
            string popis = e.Message;
            HttpWebResponse odpoved = e.Response as HttpWebResponse;
            if (odpoved != null)
            {
                using (StreamReader r = new StreamReader(odpoved.GetResponseStream())) popis = (int)odpoved.StatusCode + " " + r.ReadToEnd();
            }
            CPH.LogWarn("[AoE Diplomacie] " + popis);
        }
        catch (Exception e)
        {
            CPH.LogWarn("[AoE Diplomacie] " + e.Message);
        }
        return true;
    }

    static void Posli(string url, string telo)
    {
        using (WebClient wc = new WebClient())
        {
            wc.Encoding = Encoding.UTF8;
            wc.Headers[HttpRequestHeader.ContentType] = "application/json";
            wc.Headers[HttpRequestHeader.Authorization] = "Bearer " + Klic;
            wc.UploadString(url, "POST", telo);
        }
    }
}
`;
}

/**
 * Import pro Streamer.bot (uživatel 5. 10. 2026: „rovnou ve formátu importu,
 * klíč zaintegrovaný dynamicky“): base64 z bajtů „SBAE“ + gzip JSONu —
 * stejný formát, jaký Streamer.bot sám exportuje (ověřeno na exportech
 * 1.0.x: obálka `meta`/`data`, `version` 23, C# kód jako base64 zdrojáku
 * v `byteCode`, časovač v `data.timers` a trigger 701 s `timerId`).
 * Obsahuje akci s kódem `akceStreamerbotu`, časovač 1 s a trigger.
 */
export async function importStreamerbotu(url: string, klic: string): Promise<string> {
  const id = () => crypto.randomUUID();
  const akceId = id();
  const casovacId = id();
  const kod = new TextEncoder().encode(akceStreamerbotu(url, klic));
  const json = {
    meta: { name: "AoE Diplomacie — most ke hře", author: "jouki.cz", version: "1.0.0", description: "Posílá soubor sondy z běžící hry AoE2 (ROB_*.xsdat) na web Diplomacie. Obsahuje tvůj osobní klíč — nesdílej ho.", autoRunAction: null, minimumVersion: null },
    data: {
      actions: [
        {
          id: akceId,
          queue: "00000000-0000-0000-0000-000000000000",
          enabled: true,
          excludeFromHistory: true,
          excludeFromPending: false,
          name: "AoE Diplomacie — most",
          group: "AoE Diplomacie",
          alwaysRun: false,
          randomAction: false,
          concurrent: false,
          triggers: [{ timerId: casovacId, id: id(), type: 701, enabled: true, exclusions: [] }],
          subActions: [
            {
              name: null,
              description: null,
              references: ["C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll", "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll"],
              byteCode: base64(kod),
              precompile: false,
              delayStart: false,
              saveResultToVariable: false,
              saveToVariable: "",
              id: id(),
              weight: 0,
              type: 99999,
              parentId: null,
              enabled: true,
              index: 0,
            },
          ],
          collapsedGroups: [],
        },
      ],
      queues: [],
      commands: [],
      websocketServers: [],
      websocketClients: [],
      timers: [{ id: casovacId, name: "AoE Diplomacie — most", enabled: true, repeat: true, interval: 1, randomInterval: false, upperInterval: 0, lines: 0, counter: 0 }],
    },
    version: 23,
    exportedFrom: "1.0.1",
    minimumVersion: "1.0.0-alpha.1",
  };
  const gzip = new Uint8Array(await new Response(new Blob([JSON.stringify(json)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  const vse = new Uint8Array(4 + gzip.length);
  vse.set(new TextEncoder().encode("SBAE"), 0);
  vse.set(gzip, 4);
  return base64(vse);
}

function base64(bajty: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bajty.length; i += 0x8000) s += String.fromCharCode(...bajty.subarray(i, i + 0x8000));
  return btoa(s);
}

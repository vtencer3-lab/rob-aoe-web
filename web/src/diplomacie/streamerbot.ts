/**
 * Kód akce pro Streamer.bot (sub-akce „Execute C# Code“), kterou si hráč
 * stáhne s vlastním klíčem mostu (uživatel 5. 10. 2026). Spouští ji Timed
 * Action každou sekundu: najde nejnovější `ROB_*.xsdat` ve složkách profilů
 * hry a když se změnil (nebo po 15 s jako tep), pošle ho tak, jak je, na
 * web. Rozbor souboru dělá web (src/diplomacie/xsdat.ts) — akce zůstává
 * krátká a nezávislá na formátu sondy.
 *
 * Jen C# 5 a System.dll (WebClient), ať se přeloží v každém Streamer.botu
 * bez přidávání referencí; ověřeno překladačem .NET Frameworku.
 */
export function akceStreamerbotu(url: string, klic: string): string {
  return `// AoE2 Diplomacie — data ze hry na web (${url})
// Streamer.bot: Actions → nová akce → sub-akce Core → C# → Execute C# Code,
// vlož celý tento kód, Compile, Save. Trigger: Core → Timed Actions,
// interval 1 s, zapnout. Klíč níž je tvůj osobní — nesdílej ho.
using System;
using System.IO;
using System.Net;
using System.Text;

public class CPHInline
{
    const string Url = "${url}";
    const string Klic = "${klic}";
    static string posledniSoubor = "";
    static DateTime posledniZmena = DateTime.MinValue;
    static DateTime posledniOdeslani = DateTime.MinValue;

    public bool Execute()
    {
        try
        {
            string koren = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Games", "Age of Empires 2 DE");
            if (!Directory.Exists(koren)) return true;
            FileInfo nejnovejsi = null;
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
            // Bez souboru, nebo hra neběží (soubor starší než 2 minuty): nic.
            if (nejnovejsi == null || DateTime.UtcNow - nejnovejsi.LastWriteTimeUtc > TimeSpan.FromMinutes(2)) return true;
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
            string telo = "{\\"jmeno\\":\\"" + nejnovejsi.Name.Replace("\\\\", "").Replace("\\"", "") + "\\",\\"soubor\\":\\"" + Convert.ToBase64String(data) + "\\"}";
            using (WebClient wc = new WebClient())
            {
                wc.Encoding = Encoding.UTF8;
                wc.Headers[HttpRequestHeader.ContentType] = "application/json";
                wc.Headers[HttpRequestHeader.Authorization] = "Bearer " + Klic;
                wc.UploadString(Url, "POST", telo);
            }
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
}
`;
}

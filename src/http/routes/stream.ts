import type { FastifyInstance } from "fastify";
import { buildAkceStav } from "../../realtime/akceStav.js";
import { hub, KANAL_AKCE } from "../../realtime/hub.js";
import { sledujPritomnost } from "../../realtime/pritomnost.js";
import { redigujProDivaka, zjistiDivaka } from "../../realtime/redakce.js";
import type { AkceStavPayload } from "../../shared/types.js";
import { VERZE } from "../../shared/verze.js";

/** Jak často stream posílá puls; klient po ~trojnásobku ticha spojení obnoví. */
export const PULS_MS = 25_000;

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get("/api/stream", async (request, reply) => {
    // Úklid musí být zaregistrovaný jako úplně první věc v handleru. Handlerův
    // úplně první await (getAktivniAkce níže) běží ještě před hijackem, takže
    // klient se může odpojit dřív, než bychom na 'close' měli vůbec co
    // navěsit — a bez posluchače tady by odběratel i puls unikaly navždy.
    let odhlas: (() => void) | undefined;
    let puls: NodeJS.Timeout | undefined;
    // Zavření poslední karty znamená odchod z akce (pritomnost.ts).
    let odesel: (() => void) | undefined;
    // Volatelné opakovaně a bezpečně: druhé volání (ať už z 'close', nebo
    // z chybové větve níže) už nic nedělá, takže nikdy neuvolní odběratele,
    // který mezitím vznikl znovu se stejným akceId.
    const uklid = () => {
      clearInterval(puls);
      puls = undefined;
      const fn = odhlas;
      odhlas = undefined;
      fn?.();
      odesel?.();
    };
    request.raw.on("close", uklid);

    // Bez akce se stream neodmítá. „Ještě nic neběží“ je normální stav, ne
    // porucha: kdo si stránku otevře odpoledne, drží spojení a Robovo založení
    // akce mu dorazí živě. Dokud se sem odpovídalo 404, svítila na stránce
    // hláška o obnovování spojení celý den a přestala tím znamenat to jediné,
    // k čemu je — že spojení opravdu spadlo.

    // Bereme si odpověď do vlastní režie — bez tohohle by Fastify po
    // doběhnutí handleru zavolal reply.send() přes už rozjetý raw stream.
    reply.hijack();

    try {
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        // Bez tohohle Cloudflare Tunnel události bufferuje a realtime přestane být realtime.
        "x-accel-buffering": "no",
      });

      if (request.raw.destroyed) {
        // Klient odpadl ještě před hijackem (typicky během getAktivniAkce
        // výše) — 'close' proběhlo bez posluchače, uklid() tu nic nemaže
        // (nikdo se ještě nepřihlásil) a jen ukončíme rozjetý raw stream.
        uklid();
        reply.raw.end();
        return reply;
      }

      const divak = await zjistiDivaka(request);
      // Anonymní divák se z ničeho odhlašovat nemusí.
      if (divak.steamId) odesel = sledujPritomnost(divak.steamId);

      const posli = (payload: AkceStavPayload) =>
        reply.raw.write(`data: ${JSON.stringify(redigujProDivaka(payload, divak))}\n\n`);

      // Odběr musí vzniknout dřív, než začneme stavět úvodní stav — jinak by
      // broadcast, který přijde přesně v okně mezi sestavením a přihlášením,
      // nedorazil nikomu a kanál žádné přírůstky nedohání. Dokud ale úvodní
      // stav ještě nedorazil, doručenou zprávu jen schováme — starší stav
      // poslaný až po novějším by na chvíli ukázal novější data a hned je
      // přepsal staršími.
      let zive = false;
      let cekajici: AkceStavPayload | undefined;
      let maCekajici = false;
      odhlas = hub.subscribe(KANAL_AKCE, (payload) => {
        if (!zive) {
          cekajici = payload;
          maCekajici = true;
          return;
        }
        posli(payload);
      });

      const stav = await buildAkceStav();
      if (request.raw.destroyed) {
        uklid();
        return reply;
      }

      // Verze serveru jako první: web se nasazuje několikrát za večer a
      // otevřená stránka se starým bundlem by nové položky stavu tiše
      // ignorovala. Po každém nasazení se stream znovu otevře, takže tohle
      // stačí — puls verzi nosit nemusí.
      reply.raw.write(`event: verze\ndata: ${JSON.stringify({ verze: VERZE })}\n\n`);
      posli(stav);
      zive = true;
      if (maCekajici) {
        posli(cekajici!);
        maCekajici = false;
      }

      // Puls jako pojmenovaná událost, ne komentář: komentář EventSource
      // v prohlížeči nikdy neuvidí, takže by klient nepoznal spojení, které
      // umřelo potichu (NAT, proxy) — a čekal na stav, který nikdy nepřijde.
      puls = setInterval(() => reply.raw.write("event: puls\ndata: {}\n\n"), PULS_MS);
    } catch {
      // Reply je hijacknutá, takže by chyba jinak zmizela beze stopy — Fastify
      // ji jen zaloguje (a logger je vypnutý) a klient by zůstal viset na
      // otevřeném 200 text/event-stream, který už nikdy nic nepošle.
      uklid();
      reply.raw.end();
    }

    return reply;
  });
}

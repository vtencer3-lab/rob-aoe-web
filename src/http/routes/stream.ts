import type { FastifyInstance } from "fastify";
import { getAktivniAkce } from "../../db/events.js";
import { buildAkceStav } from "../../realtime/akceStav.js";
import { hub } from "../../realtime/hub.js";
import { redigujProDivaka, zjistiDivaka } from "../../realtime/redakce.js";
import type { AkceStavPayload } from "../../shared/types.js";

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get("/api/stream", async (request, reply) => {
    // Úklid musí být zaregistrovaný jako úplně první věc v handleru. Handlerův
    // úplně první await (getAktivniAkce níže) běží ještě před hijackem, takže
    // klient se může odpojit dřív, než bychom na 'close' měli vůbec co
    // navěsit — a bez posluchače tady by odběratel i puls unikaly navždy.
    let odhlas: (() => void) | undefined;
    let puls: NodeJS.Timeout | undefined;
    // Volatelné opakovaně a bezpečně: druhé volání (ať už z 'close', nebo
    // z chybové větve níže) už nic nedělá, takže nikdy neuvolní odběratele,
    // který mezitím vznikl znovu se stejným akceId.
    const uklid = () => {
      clearInterval(puls);
      puls = undefined;
      const fn = odhlas;
      odhlas = undefined;
      fn?.();
    };
    request.raw.on("close", uklid);

    const akce = await getAktivniAkce();
    if (!akce) return reply.code(404).send({ chyba: "Žádná aktivní akce." });

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
      odhlas = hub.subscribe(akce.id, (payload) => {
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

      posli(stav);
      zive = true;
      if (maCekajici) {
        posli(cekajici!);
        maCekajici = false;
      }

      puls = setInterval(() => reply.raw.write(": puls\n\n"), 25_000);
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

import type { FastifyInstance } from "fastify";
import { getAktivniAkce } from "../../db/events.js";
import { buildAkceStav } from "../../realtime/akceStav.js";
import { hub } from "../../realtime/hub.js";

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get("/api/stream", async (request, reply) => {
    const akce = await getAktivniAkce();
    if (!akce) return reply.code(404).send({ chyba: "Žádná aktivní akce." });

    // Bereme si odpověď do vlastní režie — bez tohohle by Fastify po
    // doběhnutí handleru zavolal reply.send() přes už rozjetý raw stream.
    reply.hijack();

    // Úklid musí být zaregistrovaný ještě před prvním await. Kdyby se
    // klient odpojil v průběhu buildAkceStav(), 'close' by jinak přišlo
    // dřív, než bychom na něj měli posluchač — a odběratel i puls by pak
    // unikaly po celou dobu běhu procesu.
    let odhlas: (() => void) | undefined;
    let puls: NodeJS.Timeout | undefined;
    request.raw.on("close", () => {
      clearInterval(puls);
      odhlas?.();
    });

    try {
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        // Bez tohohle Cloudflare Tunnel události bufferuje a realtime přestane být realtime.
        "x-accel-buffering": "no",
      });

      const posli = (payload: unknown) => reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);

      // Odběr musí vzniknout dřív, než začneme stavět úvodní stav — jinak by
      // broadcast, který přijde přesně v okně mezi sestavením a přihlášením,
      // nedorazil nikomu a kanál žádné přírůstky nedohání.
      odhlas = hub.subscribe(akce.id, posli);

      const stav = await buildAkceStav();
      if (request.raw.destroyed) return reply; // klient je pryč, 'close' už uklidil sám

      posli(stav);
      puls = setInterval(() => reply.raw.write(": puls\n\n"), 25_000);
    } catch {
      // Reply je hijacknutá, takže by chyba jinak zmizela beze stopy — Fastify
      // ji jen zaloguje (a logger je vypnutý) a klient by zůstal viset na
      // otevřeném 200 text/event-stream, který už nikdy nic nepošle.
      clearInterval(puls);
      odhlas?.();
      reply.raw.end();
    }

    return reply;
  });
}

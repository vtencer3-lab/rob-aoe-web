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

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      // Bez tohohle Cloudflare Tunnel události bufferuje a realtime přestane být realtime.
      "x-accel-buffering": "no",
    });

    const posli = (payload: unknown) => reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    posli(await buildAkceStav());

    const odhlas = hub.subscribe(akce.id, posli);
    const puls = setInterval(() => reply.raw.write(": puls\n\n"), 25_000);

    request.raw.on("close", () => {
      clearInterval(puls);
      odhlas();
    });

    return reply;
  });
}

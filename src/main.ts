import { config, varovaniProstredi, zkontrolujProstredi } from "./config.js";
import { existujeAdmin } from "./db/players.js";
import { deleteExpiredSessions } from "./db/sessions.js";
import { buildServer } from "./http/server.js";

// Neúplné prostředí zastavíme tady, s holou českou větou místo stack trace —
// server, který se nespustí, je nesrovnatelně lepší než server, který běží
// a přitom Robovi při přihlášení sebere práva.
try {
  zkontrolujProstredi();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// Nedostupná databáze tady server neshodí — o tu se postará první požadavek.
// Nevíme-li, jestli admin existuje, bereme to jako že ne: varovat zbytečně je
// levnější než mlčet ve chvíli, kdy je režie volná pro kohokoliv.
let adminUzExistuje = false;
try {
  adminUzExistuje = await existujeAdmin();
} catch {
  adminUzExistuje = false;
}

const varovani = varovaniProstredi(adminUzExistuje);
if (varovani) console.warn(varovani);

const app = buildServer();
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(`Poslouchám na ${config.baseUrl} (port ${config.port})`);

setInterval(() => {
  void deleteExpiredSessions().catch(() => {});
}, 60 * 60 * 1000).unref();

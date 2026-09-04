import { config, zkontrolujProstredi } from "./config.js";
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

const app = buildServer();
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(`Poslouchám na ${config.baseUrl} (port ${config.port})`);

setInterval(() => {
  void deleteExpiredSessions().catch(() => {});
}, 60 * 60 * 1000).unref();

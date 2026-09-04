import { config } from "./config.js";
import { deleteExpiredSessions } from "./db/sessions.js";
import { buildServer } from "./http/server.js";

const app = buildServer();
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(`Poslouchám na ${config.baseUrl} (port ${config.port})`);

setInterval(() => {
  void deleteExpiredSessions().catch(() => {});
}, 60 * 60 * 1000).unref();

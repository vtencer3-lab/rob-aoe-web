import { afterAll, expect, it } from "vitest";
import { closePool, getPool, withTransaction } from "./pool.js";

afterAll(async () => {
  await closePool();
});

it("schéma je nasazené", async () => {
  const { rows } = await getPool().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_name = 'zapas'",
  );
  expect(rows[0]!.count).toBe("1");
});

it("transakce se při chybě vrátí zpět", async () => {
  // Uklidit po předchozích souborech musíme sami: od migrace 003 smí být
  // nedokončená akce nejvýš jedna, takže by vložení narazilo na unikátní index
  // dřív, než se vůbec dostaneme k vlastní chybě, kvůli které test existuje.
  await getPool().query("TRUNCATE akce CASCADE");

  await expect(
    withTransaction(async (client) => {
      await client.query("INSERT INTO akce (nazev) VALUES ('pokus')");
      throw new Error("naschvál");
    }),
  ).rejects.toThrow("naschvál");

  const { rows } = await getPool().query("SELECT 1 FROM akce WHERE nazev = 'pokus'");
  expect(rows).toHaveLength(0);
});

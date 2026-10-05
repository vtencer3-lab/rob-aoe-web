import { expect, it } from "vitest";
import { spojeni } from "./MostStreamerbot.js";

// Uživatel 5. 10. 2026: „zelený indikátor, že je spojení funkční“.
it("kontrolka: neozvala se = čeká, ozvala se nedávno = živá, dlouho mlčí = červená", () => {
  const zaklad = { vytvoren: "2026-10-05T20:00:00Z", naposledy: null };
  expect(spojeni({ ...zaklad, predS: null })).toBe("ceka");
  expect(spojeni({ ...zaklad, naposledy: "x", predS: 3 })).toBe("zive");
  expect(spojeni({ ...zaklad, naposledy: "x", predS: 45 })).toBe("zive");
  expect(spojeni({ ...zaklad, naposledy: "x", predS: 46 })).toBe("mlci");
});

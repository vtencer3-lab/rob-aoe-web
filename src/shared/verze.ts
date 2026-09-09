/**
 * Verze webu. Jediné místo, ze kterého ji čte backend (`/api/health`) i
 * frontend (patička). Musí se rovnat `version` v kořenovém `package.json` —
 * hlídá to test `verze.test.ts` a obojí najednou mění `npm run verze`.
 *
 * Na větvi `experimental` má tvar `X.Y.Z-A.B`: před pomlčkou verze devu,
 * ze které pokus vyšel, za ní vlastní verzování pokusu. Pravidla jsou
 * v `scripts/verze.ts` a v `docs/nasazeni-jouki-cz.md` §2.1.
 */
export const VERZE = "0.27.1";

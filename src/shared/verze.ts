/**
 * Verze webu. Jediné místo, ze kterého ji čte backend (`/api/health`) i
 * frontend (patička). Musí se rovnat `version` v kořenovém `package.json` —
 * hlídá to test `verze.test.ts` a obojí najednou mění `npm run verze`.
 */
export const VERZE = "0.11.1";

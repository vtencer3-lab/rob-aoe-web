/**
 * Porušení unikátního omezení v PostgreSQL (SQLSTATE 23505). Vždycky jde
 * o skutečný konflikt dvou zápisů, ne o interní chybu serveru — patří tedy na
 * 409 se srozumitelnou hláškou, ne na 500 „Něco se pokazilo“.
 */
export function jeUnikatniKonflikt(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export function formatHodiny(hodiny: number | null): string {
  // null znamená skrytý Steam profil — to není totéž co nula odehraných hodin.
  return hodiny === null ? "nezveřejněno" : `${hodiny} h`;
}

export function formatElo(elo: number | null): string {
  return elo === null ? "—" : String(elo);
}

export function formatOdehrano(her: number | null): string {
  if (her === null) return "—";
  if (her === 1) return "1 hra";
  if (her >= 2 && her <= 4) return `${her} hry`;
  return `${her} her`;
}

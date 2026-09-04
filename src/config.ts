function povinne(jmeno: string): string {
  const hodnota = process.env[jmeno];
  if (!hodnota) throw new Error(`Chybí proměnná prostředí ${jmeno}.`);
  return hodnota;
}

export const config = {
  baseUrl: process.env["BASE_URL"] ?? "http://localhost:3000",
  port: Number(process.env["PORT"] ?? 3000),
  steamApiKey: process.env["STEAM_API_KEY"] ?? "",
  adminSteamId: process.env["ADMIN_STEAM_ID"] ?? "",
  get jeProdukce(): boolean {
    return this.baseUrl.startsWith("https://");
  },
};

export { povinne };

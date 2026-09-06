import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Cesta, pod kterou web běží (`/aoe/`, `/aoe/dev/`). Bere se při buildu z
// prostředí, protože se liší pro ostrou a vývojovou verzi na jouki.cz;
// Dockerfile ji dostává jako build ARG. Bez proměnné je to kořen jako dřív.
const zaklad = process.env["BASE_PATH"] ?? "/";

export default defineConfig({
  base: zaklad,
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist" },
});

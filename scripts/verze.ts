import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Zvedne verzi na obou místech naráz: v package.json (npm) a v
// src/shared/verze.ts (běžící kód, patička, /api/health). Použití:
//   npm run verze -- patch|minor|major|1.2.3
const koren = join(import.meta.dirname, "..");
const cestaPkg = join(koren, "package.json");
const cestaVerze = join(koren, "src", "shared", "verze.ts");

const pkg = JSON.parse(readFileSync(cestaPkg, "utf8")) as { version: string };
const [major = 0, minor = 0, patch = 0] = pkg.version.split(".").map(Number);
const pokyn = process.argv[2] ?? "patch";

let nova: string;
if (/^\d+\.\d+\.\d+$/.test(pokyn)) nova = pokyn;
else if (pokyn === "major") nova = `${major + 1}.0.0`;
else if (pokyn === "minor") nova = `${major}.${minor + 1}.0`;
else if (pokyn === "patch") nova = `${major}.${minor}.${patch + 1}`;
else throw new Error(`Neznámý pokyn „${pokyn}“ — čekám patch, minor, major nebo X.Y.Z.`);

pkg.version = nova;
writeFileSync(cestaPkg, JSON.stringify(pkg, null, 2) + "\n");

const verzeTs = readFileSync(cestaVerze, "utf8");
writeFileSync(cestaVerze, verzeTs.replace(/VERZE = "[^"]+"/, `VERZE = "${nova}"`));

console.log(`verze ${major}.${minor}.${patch} → ${nova}`);

#!/usr/bin/env node
/**
 * Génère cloudflare/build-info.js à partir de l'état Git local au moment du build/déploiement.
 * Fichier généré, non versionné — voir cloudflare/build-info.js dans .gitignore.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, "..", "cloudflare", "build-info.js");

function git(command, fallback) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const commit = git("git rev-parse --short HEAD", "local");
const branch = git("git rev-parse --abbrev-ref HEAD", "unknown");
const buildDate = new Date().toISOString();

const fileContent = `// Fichier généré automatiquement par scripts/generate-build-info.mjs — ne pas éditer à la main.
export const BUILD_INFO = ${JSON.stringify({ commit, branch, buildDate }, null, 2)};
`;

writeFileSync(outFile, fileContent, "utf8");
console.log(`cloudflare/build-info.js généré : commit=${commit} branch=${branch} buildDate=${buildDate}`);

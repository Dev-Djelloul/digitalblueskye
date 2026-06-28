#!/usr/bin/env node
/**
 * Génère cloudflare/build-info.js à partir de l'état Git local au moment du build/déploiement.
 * Fichier généré et committé (servant de fallback si jamais régénéré) — voir cloudflare/build-info.js.
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

function parseGithubRemote(remoteUrl) {
  if (!remoteUrl) return null;
  // SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  return null;
}

const commit = git("git rev-parse --short HEAD", "local");
const commitFull = git("git rev-parse HEAD", "local");
const branch = git("git rev-parse --abbrev-ref HEAD", "unknown");
const buildDate = new Date().toISOString();

const buildDateLabel = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date(buildDate));

const buildTimeLabel = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(buildDate));

const remoteUrl = git("git config --get remote.origin.url", "");
const githubRepo = parseGithubRemote(remoteUrl);

const githubCommitUrl =
  githubRepo && commitFull !== "local"
    ? `https://github.com/${githubRepo.owner}/${githubRepo.repo}/commit/${commitFull}`
    : null;

const githubBranchUrl =
  githubRepo && branch !== "unknown"
    ? `https://github.com/${githubRepo.owner}/${githubRepo.repo}/tree/${branch}`
    : null;

const buildInfo = {
  commit,
  commitFull,
  branch,
  buildDate,
  buildDateLabel,
  buildTimeLabel,
  githubCommitUrl,
  githubBranchUrl,
};

const fileContent = `// Fichier généré automatiquement par scripts/generate-build-info.mjs — ne pas éditer à la main.
export const BUILD_INFO = ${JSON.stringify(buildInfo, null, 2)};
`;

writeFileSync(outFile, fileContent, "utf8");
console.log(
  `cloudflare/build-info.js généré : commit=${commit} branch=${branch} buildDate=${buildDate} githubCommitUrl=${githubCommitUrl} githubBranchUrl=${githubBranchUrl}`
);

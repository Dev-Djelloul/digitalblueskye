import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import stylelint from "stylelint";

const baseRef = process.argv[2] || "origin/master";

execFileSync("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], {
  stdio: "ignore",
});

const changedFiles = new Set(
  execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", baseRef, "--", "styles"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file.endsWith(".css")),
);

const untrackedFiles = spawnSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", "styles"],
  { encoding: "utf8" },
);

if (untrackedFiles.error || untrackedFiles.status !== 0) {
  throw new Error(untrackedFiles.stderr || "Unable to list untracked CSS files.");
}

for (const file of untrackedFiles.stdout.split("\n")) {
  if (file.endsWith(".css")) changedFiles.add(file);
}

if (changedFiles.size === 0) {
  console.log("Stylelint: no changed CSS files.");
  process.exit(0);
}

function getDiagnostics(result) {
  return result.results.flatMap((file) => [
    ...file.warnings,
    ...file.parseErrors.map((error) => ({
      rule: "parse-error",
      severity: "error",
      text: error.text,
      line: error.line,
      column: error.column,
    })),
  ]);
}

function diagnosticKey(diagnostic) {
  return JSON.stringify([
    diagnostic.rule,
    diagnostic.severity,
    diagnostic.text.replace(/ at line \d+/g, ""),
  ]);
}

const newDiagnostics = [];
let inheritedCount = 0;

for (const file of [...changedFiles].sort()) {
  const currentSource = readFileSync(file, "utf8");
  const hasBaseline = spawnSync(
    "git",
    ["cat-file", "-e", `${baseRef}:${file}`],
    { stdio: "ignore" },
  );
  if (hasBaseline.error) throw hasBaseline.error;

  const baselineSource =
    hasBaseline.status === 0
      ? execFileSync("git", ["show", `${baseRef}:${file}`], { encoding: "utf8" })
      : "";

  const [currentResult, baselineResult] = await Promise.all([
    stylelint.lint({ code: currentSource, codeFilename: file }),
    stylelint.lint({ code: baselineSource, codeFilename: file }),
  ]);

  const baselineCounts = new Map();
  for (const diagnostic of getDiagnostics(baselineResult)) {
    const key = diagnosticKey(diagnostic);
    baselineCounts.set(key, (baselineCounts.get(key) || 0) + 1);
  }

  for (const diagnostic of getDiagnostics(currentResult)) {
    const key = diagnosticKey(diagnostic);
    const remaining = baselineCounts.get(key) || 0;

    if (remaining > 0) {
      baselineCounts.set(key, remaining - 1);
      inheritedCount += 1;
    } else {
      newDiagnostics.push({ file, ...diagnostic });
    }
  }
}

if (newDiagnostics.length > 0) {
  for (const diagnostic of newDiagnostics) {
    console.error(
      `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.rule} ${diagnostic.text}`,
    );
  }
  console.error(`Stylelint: ${newDiagnostics.length} new violation(s).`);
  process.exit(1);
}

console.log(
  `Stylelint: no new violations; ${inheritedCount} existing diagnostic(s) remain on changed CSS.`,
);

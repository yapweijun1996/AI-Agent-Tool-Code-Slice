#!/usr/bin/env node
/**
 * Builds every pinned Tree-sitter grammar to a WASM module via `tree-sitter build --wasm`
 * and writes grammars/wasm/manifest.json with sha256 integrity metadata for each artifact.
 *
 * Grammar source packages (tree-sitter-cli and the four grammar packages) are
 * NOT in package.json — they have nothing to do with running/testing/building
 * the actual project, and @cfmleditor/tree-sitter-cfml's postinstall script
 * fails on every platform unless run with --ignore-scripts (see
 * grammars/patches/cfml-common/PROVENANCE.md), which would otherwise break a
 * plain `npm install`/`npm ci` for every contributor and CI job. Pinned
 * versions are hardcoded below (PINNED_VERSIONS) and must match
 * `grammars:setup` in package.json exactly. Run `npm run grammars:setup` to
 * install them, then `npm run grammars:build` to produce the WASM + manifest.
 *
 * grammars/wasm/*.wasm (and manifest.json) are COMMITTED build artifacts, not
 * CI-regenerated output: `npm run grammars:verify` re-hashes the files already
 * in the repo and must never rebuild them, and `npm install`/`npm test` never
 * invoke this script. Re-run this script (a maintainer action) only when a
 * pinned grammar version changes, then commit the new .wasm files and
 * manifest.json together. Because `manifest.json` embeds `generatedAt` and
 * the build platform, running this on a different machine — even against
 * identical pinned source versions — will produce a diff there even if the
 * .wasm bytes are unchanged; that's expected and not a reproducibility bug
 * in the integrity check itself (which only compares committed bytes to
 * their recorded hash, and never rebuilds to compare against).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = path.join(repoRoot, "node_modules");
const wasmOutDir = path.join(repoRoot, "grammars", "wasm");
const treeSitterBin = path.join(
  nodeModules,
  "tree-sitter-cli",
  process.platform === "win32" ? "tree-sitter.exe" : "tree-sitter",
);

interface GrammarTarget {
  language: string;
  sourceDir: string;
  sourcePackage: string;
  sourceVersion: string;
  sourceSubdir?: string;
  patchFiles?: string[];
}

// Keep in sync with the `grammars:setup` script in package.json.
const PINNED_VERSIONS: Record<string, string> = {
  "tree-sitter-cli": "0.27.0",
  "tree-sitter-javascript": "0.25.0",
  "tree-sitter-typescript": "0.23.2",
  "tree-sitter-python": "0.25.0",
  "@cfmleditor/tree-sitter-cfml": "0.26.34",
};

function readPinnedVersion(packageName: string): string {
  const version = PINNED_VERSIONS[packageName];
  if (!version) {
    throw new Error(`No pinned version recorded for ${packageName} in grammars/build.ts PINNED_VERSIONS`);
  }
  return version;
}

const cfmlPatchFiles = ["scanner.h", "tag.h"];

const targets: GrammarTarget[] = [
  {
    language: "javascript",
    sourceDir: path.join(nodeModules, "tree-sitter-javascript"),
    sourcePackage: "tree-sitter-javascript",
    sourceVersion: readPinnedVersion("tree-sitter-javascript"),
  },
  {
    language: "typescript",
    sourceDir: path.join(nodeModules, "tree-sitter-typescript", "typescript"),
    sourcePackage: "tree-sitter-typescript",
    sourceVersion: readPinnedVersion("tree-sitter-typescript"),
    sourceSubdir: "typescript",
  },
  {
    language: "tsx",
    sourceDir: path.join(nodeModules, "tree-sitter-typescript", "tsx"),
    sourcePackage: "tree-sitter-typescript",
    sourceVersion: readPinnedVersion("tree-sitter-typescript"),
    sourceSubdir: "tsx",
  },
  {
    language: "python",
    sourceDir: path.join(nodeModules, "tree-sitter-python"),
    sourcePackage: "tree-sitter-python",
    sourceVersion: readPinnedVersion("tree-sitter-python"),
  },
  {
    language: "cfml",
    sourceDir: path.join(nodeModules, "@cfmleditor", "tree-sitter-cfml", "cfml"),
    sourcePackage: "@cfmleditor/tree-sitter-cfml",
    sourceVersion: readPinnedVersion("@cfmleditor/tree-sitter-cfml"),
    sourceSubdir: "cfml",
    patchFiles: cfmlPatchFiles,
  },
  {
    language: "cfscript",
    sourceDir: path.join(nodeModules, "@cfmleditor", "tree-sitter-cfml", "cfscript"),
    sourcePackage: "@cfmleditor/tree-sitter-cfml",
    sourceVersion: readPinnedVersion("@cfmleditor/tree-sitter-cfml"),
    sourceSubdir: "cfscript",
    patchFiles: cfmlPatchFiles,
  },
  {
    language: "cfquery",
    sourceDir: path.join(nodeModules, "@cfmleditor", "tree-sitter-cfml", "cfquery"),
    sourcePackage: "@cfmleditor/tree-sitter-cfml",
    sourceVersion: readPinnedVersion("@cfmleditor/tree-sitter-cfml"),
    sourceSubdir: "cfquery",
    patchFiles: cfmlPatchFiles,
  },
];

function applyCfmlPatch(): void {
  const commonDir = path.join(nodeModules, "@cfmleditor", "tree-sitter-cfml", "common");
  const patchSrcDir = path.join(repoRoot, "grammars", "patches", "cfml-common");
  mkdirSync(commonDir, { recursive: true });
  for (const file of cfmlPatchFiles) {
    copyFileSync(path.join(patchSrcDir, file), path.join(commonDir, file));
  }
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function main(): void {
  if (!existsSync(treeSitterBin)) {
    console.error(`tree-sitter CLI binary not found at ${treeSitterBin}.\nRun "npm run grammars:setup" first.`);
    process.exit(1);
  }

  mkdirSync(wasmOutDir, { recursive: true });

  const needsCfmlPatch = targets.some((t) => t.patchFiles);
  if (needsCfmlPatch) {
    applyCfmlPatch();
  }

  const manifestGrammars: Record<string, unknown>[] = [];

  for (const target of targets) {
    if (!existsSync(target.sourceDir)) {
      throw new Error(
        `Grammar source directory missing for "${target.language}": ${target.sourceDir}. Run "npm run grammars:setup" first.`,
      );
    }

    const outputFile = path.join(wasmOutDir, `${target.language}.wasm`);
    console.log(`Building ${target.language} -> ${path.relative(repoRoot, outputFile)}`);

    const result = spawnSync(treeSitterBin, ["build", "--wasm", "--output", outputFile, target.sourceDir], {
      cwd: repoRoot,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(`tree-sitter build --wasm failed for "${target.language}" (exit ${result.status})`);
    }

    const entry: Record<string, unknown> = {
      language: target.language,
      wasmFile: path.basename(outputFile),
      sha256: sha256File(outputFile),
      sizeBytes: readFileSync(outputFile).length,
      sourcePackage: target.sourcePackage,
      sourceVersion: target.sourceVersion,
    };
    if (target.sourceSubdir) entry.sourceSubdir = target.sourceSubdir;
    if (target.patchFiles) {
      entry.patches = target.patchFiles.map((f) => `grammars/patches/cfml-common/${f}`);
    }
    manifestGrammars.push(entry);
  }

  const versionResult = spawnSync(treeSitterBin, ["--version"], { encoding: "utf8" });
  const treeSitterCliVersion = versionResult.stdout.trim();

  const manifest = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    builtWith: {
      treeSitterCli: treeSitterCliVersion,
      platform: `${process.platform}-${process.arch}`,
      nodeVersion: process.version,
    },
    grammars: manifestGrammars,
  };

  writeFileSync(path.join(wasmOutDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote ${manifestGrammars.length} grammar(s) to grammars/wasm/manifest.json`);
}

main();

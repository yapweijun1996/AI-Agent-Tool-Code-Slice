#!/usr/bin/env node
/**
 * Re-hashes every WASM file listed in grammars/wasm/manifest.json and confirms it
 * matches the recorded sha256. Also used as a library function by the grammar
 * integrity test (test/unit/grammars-manifest.test.ts).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface ManifestGrammar {
  language: string;
  wasmFile: string;
  sha256: string;
  sourcePackage: string;
  sourceVersion: string;
}

export interface Manifest {
  schemaVersion: string;
  grammars: ManifestGrammar[];
}

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  manifest: Manifest;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasmDir = path.join(repoRoot, "grammars", "wasm");

export function verifyGrammarManifest(): VerifyResult {
  const manifestPath = path.join(wasmDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      errors: [`Missing ${path.relative(repoRoot, manifestPath)}. Run "npm run grammars:build" first.`],
      manifest: { schemaVersion: "unknown", grammars: [] },
    };
  }

  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const errors: string[] = [];

  for (const grammar of manifest.grammars) {
    const wasmPath = path.join(wasmDir, grammar.wasmFile);
    if (!existsSync(wasmPath)) {
      errors.push(`${grammar.language}: missing file ${grammar.wasmFile}`);
      continue;
    }
    const actualSha256 = createHash("sha256").update(readFileSync(wasmPath)).digest("hex");
    if (actualSha256 !== grammar.sha256) {
      errors.push(
        `${grammar.language}: sha256 mismatch for ${grammar.wasmFile} (manifest=${grammar.sha256} actual=${actualSha256})`,
      );
    }
  }

  return { ok: errors.length === 0, errors, manifest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = verifyGrammarManifest();
  if (!result.ok) {
    console.error("Grammar integrity check FAILED:");
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(`Grammar integrity check passed for ${result.manifest.grammars.length} grammar(s).`);
}

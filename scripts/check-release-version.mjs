#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const name = pkg.name;
const version = pkg.version;

if (typeof name !== "string" || !name || typeof version !== "string" || !version) {
  console.error("Release version check failed: package.json must contain name and version.");
  process.exit(1);
}

const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;

try {
  const response = await fetch(registryUrl, {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
  });

  if (response.status === 404) {
    console.log(`Release version is available: ${name}@${version}`);
    process.exit(0);
  }

  if (response.ok) {
    console.error(`Refusing to publish: ${name}@${version} already exists on npm.`);
    console.error("Bump package.json to a new SemVer version before publishing.");
    process.exit(1);
  }

  console.error(`Release version check failed: npm registry returned HTTP ${response.status}.`);
  process.exit(1);
} catch (error) {
  console.error(`Release version check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

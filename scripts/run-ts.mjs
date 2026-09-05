#!/usr/bin/env node
/**
 * Cross-version launcher for TypeScript scripts.
 *
 * Node 18.18 can run tsx through the experimental loader hook, while the
 * newer Node versions used by CI support tsx through --import. Keep this
 * compatibility decision at the development-tool boundary, not in Core.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function tsxLoaderArgs() {
  const major = Number(process.versions.node.split(".")[0]);
  return major === 18 ? ["--loader", "tsx"] : ["--import", "tsx"];
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath === fileURLToPath(import.meta.url);

if (isMain) {
  const scriptArgs = process.argv.slice(2);
  if (scriptArgs.length === 0) {
    console.error("Usage: node scripts/run-ts.mjs <typescript-script> [args ...]");
    process.exit(2);
  }

  const result = spawnSync(process.execPath, [...tsxLoaderArgs(), ...scriptArgs], {
    stdio: "inherit",
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  });

  if (result.error) {
    console.error(`Failed to launch TypeScript script: ${result.error.message}`);
  }
  process.exit(result.status ?? 1);
}

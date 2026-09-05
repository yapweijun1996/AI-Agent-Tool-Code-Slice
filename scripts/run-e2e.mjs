#!/usr/bin/env node
/**
 * Cross-platform launcher for the agent-facing E2E tests.
 *
 * Keep discovery in Node instead of relying on shell glob expansion so the
 * same command works under PowerShell, Bash, and the Node 18 floor.
 */
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tsxLoaderArgs } from "./run-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const e2eDir = path.join(repoRoot, "test", "e2e");
const cliPath = path.join(repoRoot, "dist", "cli", "index.js");

if (!existsSync(cliPath)) {
  console.error(`Built CLI not found at ${cliPath}. Run "npm run build" first.`);
  process.exit(1);
}

const testFiles = readdirSync(e2eDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join(e2eDir, name));

if (testFiles.length === 0) {
  console.error(`No *.test.ts files found in ${e2eDir}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [...tsxLoaderArgs(), "--test", ...testFiles], {
  stdio: "inherit",
  cwd: repoRoot,
});

if (result.error) console.error(`Failed to launch E2E tests: ${result.error.message}`);
process.exit(result.status ?? 1);

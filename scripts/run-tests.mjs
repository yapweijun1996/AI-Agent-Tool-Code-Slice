#!/usr/bin/env node
/**
 * Cross-platform test file discovery for `npm test`.
 *
 * `node --test test/unit/*.test.ts` looks fine and works on bash/sh (which
 * glob-expand the pattern before node ever sees it), but real Windows CI
 * (GitHub Actions windows-latest, PowerShell) does NOT expand `*` for an
 * external command's arguments, so node received the literal string
 * `test/unit/*.test.ts` and failed with "Could not find ...". Node's own
 * `--test` glob support only kicks in on newer Node versions (confirmed:
 * works on Node 22, not Node 20) and can't be relied on across the
 * `engines.node >=18.18.0` floor either. Doing file discovery here with
 * plain `fs.readdirSync`, then passing an explicit file list to `node --test`,
 * removes the shell (and the Node version) as a variable entirely.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tsxLoaderArgs } from "./run-ts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unitDir = path.join(repoRoot, "test", "unit");

const testFiles = readdirSync(unitDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join(unitDir, name));

if (testFiles.length === 0) {
  console.error(`No *.test.ts files found in ${unitDir}`);
  process.exit(1);
}

const extraArgs = process.argv.slice(2); // e.g. --watch, forwarded from `npm run test:watch`

const result = spawnSync(
  process.execPath,
  [...tsxLoaderArgs(), "--test", ...extraArgs, ...testFiles],
  { stdio: "inherit", cwd: repoRoot },
);

process.exit(result.status ?? 1);

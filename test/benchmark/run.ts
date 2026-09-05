#!/usr/bin/env node
/**
 * Runs the docs/PERFORMANCE_BENCHMARK.md cohort against test/fixtures/benchmark/
 * and prints a reproducibility-annotated Markdown report (OS, arch, Node
 * version, package version, grammar hashes, fixture hashes, repetitions).
 *
 * Cold = one CLI subprocess per measurement (matches a real agent's first
 * invocation: full grammar load from cold). Warm = repeated in-process
 * calls after the grammar is already cached, reported as a median.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { outline, slice } from "../../src/core/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const fixturesDir = path.join(repoRoot, "test", "fixtures", "benchmark");
const builtCliPath = path.join(repoRoot, "dist", "cli", "index.js");
const sourceCliPath = path.join(repoRoot, "src", "cli", "index.ts");
// Prefer the compiled dist/ CLI: that's what a real npm install runs. Fall
// back to the tsx-loaded TS source (adds loader overhead to "cold") only if
// `npm run build` hasn't been run yet.
const useBuilt = existsSync(builtCliPath);
const cliCommand: [string, string[]] = useBuilt
  ? ["node", [builtCliPath]]
  : ["node", ["--import", "tsx", sourceCliPath]];

const COLD_REPS = 3;
const WARM_REPS = 15;

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

function measureCold(filePath: string): number[] {
  const times: number[] = [];
  for (let i = 0; i < COLD_REPS; i++) {
    const start = performance.now();
    const [cmd, baseArgs] = cliCommand;
    const result = spawnSync(cmd, [...baseArgs, "outline", filePath, "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    const elapsed = performance.now() - start;
    if (result.error || result.status !== 0) {
      throw new Error(
        `Cold CLI invocation failed for ${filePath}: ${result.error?.message ?? ""} ${result.stderr ?? ""}`,
      );
    }
    times.push(elapsed);
  }
  return times;
}

async function measureWarm(filePath: string): Promise<number[]> {
  // Prime the grammar cache with one untimed call, matching "warm" per docs/PERFORMANCE_BENCHMARK.md.
  await outline({ file: filePath });
  const times: number[] = [];
  for (let i = 0; i < WARM_REPS; i++) {
    const start = performance.now();
    const envelope = await outline({ file: filePath });
    const elapsed = performance.now() - start;
    if (!envelope.ok) throw new Error(`Warm outline failed for ${filePath}`);
    times.push(elapsed);
  }
  return times;
}

async function main(): Promise<void> {
  if (!existsSync(fixturesDir) || !existsSync(path.join(fixturesDir, "5kb.js"))) {
    console.error('Benchmark fixtures missing. Run "npx tsx test/benchmark/generate-fixtures.ts" first.');
    process.exit(1);
  }

  const manifestPath = path.join(repoRoot, "grammars", "wasm", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    grammars: Array<{ language: string; sha256: string }>;
  };
  const jsGrammarHash = manifest.grammars.find((g) => g.language === "javascript")?.sha256;

  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string };

  // Context reduction (docs/TESTING_GOLDEN_EVAL.md primary metric: "less
  // context, same required code evidence"). Uses 500kb.js, which the
  // generator names `fn0..fn2013` — fn1000 sits comfortably mid-file.
  const largeFixture = path.join(fixturesDir, "500kb.js");
  const largeFixtureBytes = readFileSync(largeFixture).length;
  const symbolEnvelope = await slice({ file: largeFixture, selector: { type: "symbol", name: "fn1000" } });
  if (!symbolEnvelope.ok) throw new Error("Context-reduction measurement: fn1000 slice failed");
  const symbolCode = (symbolEnvelope.result as { code: string }).code;
  const symbolBytes = Buffer.byteLength(symbolCode, "utf8");
  const symbolReductionPct = (100 * (1 - symbolBytes / largeFixtureBytes)).toFixed(3);

  const outlineEnvelope = await outline({ file: largeFixture });
  if (!outlineEnvelope.ok) throw new Error("Context-reduction measurement: outline failed");
  const outlineJsonBytes = Buffer.byteLength(JSON.stringify((outlineEnvelope.result as { symbols: unknown[] })), "utf8");
  const outlineSymbolCount = (outlineEnvelope.result as { symbols: unknown[] }).symbols.length;
  const outlineReductionPct = (100 * (1 - outlineJsonBytes / largeFixtureBytes)).toFixed(3);

  const rows: string[] = [];
  for (const name of ["5kb.js", "50kb.js", "500kb.js"]) {
    const filePath = path.join(fixturesDir, name);
    const bytes = readFileSync(filePath).length;
    const fixtureHash = sha256(filePath);

    const cold = measureCold(filePath);
    const warm = await measureWarm(filePath);

    rows.push(
      `| ${name} | ${bytes} | \`${fixtureHash.slice(0, 12)}\` | ${median(cold).toFixed(1)} ms | ${median(warm).toFixed(2)} ms |`,
    );
    console.error(`${name}: cold median=${median(cold).toFixed(1)}ms warm median=${median(warm).toFixed(2)}ms`);
  }

  const report = `# Performance Benchmark Results

Generated by \`test/benchmark/run.ts\`. See docs/PERFORMANCE_BENCHMARK.md for
the measurement plan this satisfies. These are initial, single-machine,
single-run numbers (Phase 1 spike evidence) — not a cross-platform or
statistically robust benchmark. Re-run before citing in release materials.

## Reproducibility

- OS: ${os.type()} ${os.release()} (${os.platform()})
- Architecture: ${os.arch()}
- Node version: ${process.version}
- Package version: ${pkg.version}
- JavaScript grammar sha256: \`${jsGrammarHash}\`
- Cold repetitions: ${COLD_REPS} (each a fresh \`node ... cli outline --json\` subprocess; reported as median)
- Warm repetitions: ${WARM_REPS} (in-process, after one untimed cache-priming call; reported as median)
- Command: \`npx tsx test/benchmark/run.ts\`
- Cold CLI invocation: ${useBuilt ? "compiled `dist/cli/index.js` (matches a real npm install)" : "`node scripts/run-ts.mjs src/cli/index.ts` (dist/ not built — includes tsx loader overhead)"}

## JavaScript outline: cold vs warm

| Fixture | Bytes | sha256 (12) | Cold (median, full process) | Warm (median, in-process) |
|---|---:|---|---:|---:|
${rows.join("\n")}

## Reading this table

- **Cold** includes Node process startup, module loading, \`Parser.init()\`
  (loading web-tree-sitter's own WASM runtime), grammar WASM load, and parse —
  the realistic cost of a single CLI invocation from an AI agent's shell tool.
- **Warm** is parse-only cost once a long-lived process (the JS API, or a
  future MCP server) has already loaded the grammar once. This is the number
  that matters for repeated calls within one agent session.
- No native-engine or ast-grep comparison is included yet (docs/PERFORMANCE_BENCHMARK.md
  "Compare" section) — out of scope for this pass.

## Context reduction (docs/TESTING_GOLDEN_EVAL.md primary metric)

Measured against \`500kb.js\` (${largeFixtureBytes} bytes, ${outlineSymbolCount} symbols):

- \`symbol fn1000\` returns ${symbolBytes} bytes of code — a **${symbolReductionPct}%** reduction versus reading the full file. This is the tool's core value case: one named unit out of a large file.
- \`outline\` (every symbol's kind/name/range/signature, no code bodies) returns ${outlineJsonBytes} bytes of JSON — **${outlineReductionPct}%** versus the full file, i.e. *larger than the source*, not smaller.

The negative outline number is real and worth stating plainly rather than
omitting: \`500kb.js\` is a synthetic worst case — ${outlineSymbolCount} symbols
(functions, classes, and their methods/params counted individually) packed
into ${largeFixtureBytes} bytes, so per-symbol range/signature JSON overhead
exceeds the tiny bodies it describes. A file with fewer, larger symbols (most
real source files) would show outline shrinking, not growing; \`--kind\`/
\`--max-symbols\` filtering also help. This one fixture is not evidence for
outline's typical case either way — only for \`symbol\`'s.

This is one fixture, one language, one selector — not the full Golden Eval
context-reduction suite docs/TESTING_GOLDEN_EVAL.md describes.

## Invented-symbol rate

Required value: \`0\`. Evidence for this pass (not re-measured here — see the
referenced tests):

- \`test/unit/javascript.test.ts\` — "syntax-shaped text inside comments,
  strings, and template literals is never mistaken for a real symbol".
- \`test/unit/javascript.test.ts\` — "malformed source returns a warning and
  does not crash or invent symbols" (asserts the truncated function is
  absent, not just that the well-formed one is present).
- \`test/unit/cfml.test.ts\` — the dynamic-name case reports \`name: null\` with
  a \`DYNAMIC_NAME\` warning rather than guessing a name.

No automated fuzz/property test enforces this rate generally; it holds for
the fixtures actually exercised, not as a proven invariant.
`;

  process.stdout.write(report);
}

main();

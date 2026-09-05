#!/usr/bin/env node
/**
 * Runs the reproducible benchmark cohort from docs/PERFORMANCE_BENCHMARK.md.
 *
 * The report deliberately keeps four measurements separate:
 * - raw read: the context baseline before parsing;
 * - engine phases: host grammar load, parse, and adapter extraction;
 * - cold CLI: one fresh process per operation, matching an agent shell call;
 * - warm API: repeated calls after the process has loaded the grammar.
 *
 * The benchmark is a measurement tool, not a performance gate. It fails when
 * a fixture cannot be parsed or the public result is not the expected fn0 symbol,
 * but it does not invent a latency threshold.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import type { LanguageAdapter } from "../../src/languages/types.js";
import { createSymbolBudget } from "../../src/core/limits.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const builtCliPath = path.join(repoRoot, "dist", "cli", "index.js");
const sourceCliPath = path.join(repoRoot, "src", "cli", "index.ts");
const useBuilt = existsSync(builtCliPath);
const nodeMajor = Number(process.versions.node.split(".")[0]);
// Node 23 on macOS 26 can leave a WASM CLI child in V8's background Maglev
// compilation queue after repeated cold launches. Supported CI versions do
// not need this workaround; keep the local unsupported runtime bounded.
const nodeRuntimeArgs = nodeMajor >= 23 ? ["--no-maglev"] : [];
const warmNodeRuntimeArgs = [...nodeRuntimeArgs, "--expose-gc"];
const tsxArgs = nodeMajor === 18 ? ["--loader", "tsx"] : ["--import", "tsx"];
const coldWorkerPath = path.join(repoRoot, "test", "benchmark", "cold-worker.mjs");
const warmWorkerPath = path.join(repoRoot, "test", "benchmark", "warm-worker.mjs");
const captureDir = mkdtempSync(path.join(os.tmpdir(), "agent-code-slice-benchmark-"));
let captureId = 0;

const COLD_REPS = 3;
const WARM_REPS = 7;
const PHASE_REPS = 3;
const SIZE_IDS = ["5kb", "50kb", "500kb", "1mb"] as const;
type SizeId = (typeof SIZE_IDS)[number];

interface BenchmarkCohort {
  id: string;
  extension: string;
  directory?: string;
}

const cohorts: BenchmarkCohort[] = [
  { id: "javascript", extension: "js" },
  { id: "typescript", extension: "ts", directory: "typescript" },
  { id: "tsx", extension: "tsx", directory: "tsx" },
  { id: "python", extension: "py", directory: "python" },
  { id: "cfml", extension: "cfm", directory: "cfml" },
];

interface BenchmarkTarget {
  cohort: BenchmarkCohort;
  size: SizeId;
  filePath: string;
  displayPath: string;
  selectorName: string;
}

type BenchmarkRuntime = {
  WasmEngine: typeof import("../../src/engine/wasm-engine.js").WasmEngine;
  detectAdapter: typeof import("../../src/languages/registry.js").detectAdapter;
  SourceIndex: typeof import("../../src/schema/coordinates.js").SourceIndex;
};

interface CliObservation {
  elapsedMs: number;
  envelopeDigest: string;
  stdoutBytes: number;
  stdoutLines: number;
}

interface ColdObservation {
  medianMs: number;
  last: CliObservation;
}

interface WarmObservation {
  outline: CliObservation;
  symbol: CliObservation;
  symbolCodeBytes: number;
  symbolCodeLines: number;
  rssBytes: number;
}

interface PhaseObservation {
  hostLoadMs: number;
  parseMs: number;
  extractMs: number;
  totalMs: number;
}

interface BenchmarkMeasurement {
  adapter: string;
  fixture: string;
  size: SizeId;
  sourceBytes: number;
  sourceLines: number;
  fixtureSha256: string;
  rawReadMs: number;
  hostLoadMs: number;
  parseMs: number;
  extractMs: number;
  coldOutlineMs: number;
  warmOutlineMs: number;
  coldSymbolMs: number;
  warmSymbolMs: number;
  outlineOutputBytes: number;
  outlineOutputLines: number;
  symbolOutputBytes: number;
  symbolOutputLines: number;
  symbolCodeBytes: number;
  symbolCodeLines: number;
  symbolReductionPct: number;
  warmRssBytes: number;
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function median(values: number[]): number {
  if (values.length === 0) throw new Error("Cannot calculate a median for an empty sample");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function lineCount(text: string): number {
  if (text.length === 0) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function targetFor(cohort: BenchmarkCohort, size: SizeId): BenchmarkTarget {
  const fileName = `${size}.${cohort.extension}`;
  const relativePath = path.join("test", "fixtures", "benchmark", cohort.directory ?? "", fileName);
  return {
    cohort,
    size,
    filePath: path.join(repoRoot, relativePath),
    displayPath: relativePath.split(path.sep).join("/"),
    selectorName: "fn0",
  };
}

function requireSuccess(envelope: Record<string, unknown>, context: string): Record<string, unknown> {
  if (envelope.ok !== true) {
    const error = envelope.error;
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
    throw new Error(`${context} returned ${code}`);
  }
  if (typeof envelope.result !== "object" || envelope.result === null || Array.isArray(envelope.result)) {
    throw new Error(`${context} returned a non-object result`);
  }
  return envelope.result as Record<string, unknown>;
}

function requireCliEnvelope(stdout: string, context: string): Record<string, unknown> {
  if (!stdout.endsWith("\n")) throw new Error(`${context} did not terminate its JSON document with one newline`);
  const document = stdout.slice(0, -1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(document) as unknown;
  } catch (error) {
    throw new Error(`${context} emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${context} emitted a non-object JSON document`);
  }
  return parsed as Record<string, unknown>;
}

function assertExpectedOutline(envelope: Record<string, unknown>, target: BenchmarkTarget, context: string): void {
  const result = requireSuccess(envelope, context);
  if (!Array.isArray(result.symbols)) throw new Error(`${context} returned no symbols array`);
  const found = result.symbols.some(
    (symbol) =>
      typeof symbol === "object" &&
      symbol !== null &&
      !Array.isArray(symbol) &&
      (symbol as Record<string, unknown>).name === target.selectorName,
  );
  if (!found) throw new Error(`${context} did not return ${target.selectorName}`);
}

function assertExpectedSymbol(envelope: Record<string, unknown>, target: BenchmarkTarget, context: string): string {
  const result = requireSuccess(envelope, context);
  if (typeof result.code !== "string") throw new Error(`${context} returned no code text`);
  if (!result.code.includes(target.selectorName)) throw new Error(`${context} returned the wrong symbol`);
  return result.code;
}

function digestEnvelope(envelope: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(envelope), "utf8").digest("hex");
}

// Redirect worker output to temporary files. The worker returns one observation
// containing the last envelope; validate and digest it here before dropping
// the large parsed JSON from the long-lived benchmark process.
function invokeColdWorker(target: BenchmarkTarget, operation: "outline" | "symbol"): ColdObservation {
  const id = captureId++;
  const stdoutPath = path.join(captureDir, `stdout-${id}.txt`);
  const stderrPath = path.join(captureDir, `stderr-${id}.txt`);
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync(process.execPath, [coldWorkerPath, operation, target.filePath, target.selectorName, String(COLD_REPS)], {
      cwd: repoRoot,
      timeout: 180_000,
      stdio: ["ignore", stdoutFd, stderrFd],
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }

  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");
  unlinkSync(stdoutPath);
  unlinkSync(stderrPath);
  if (result.error) throw result.error;
  if (Buffer.byteLength(stdout, "utf8") > 100 * 1024 * 1024) {
    throw new Error("CLI stdout exceeded the 104857600-byte benchmark capture limit");
  }
  if (Buffer.byteLength(stderr, "utf8") > 100 * 1024 * 1024) {
    throw new Error("CLI stderr exceeded the 104857600-byte benchmark capture limit");
  }
  if (result.status !== 0) throw new Error(`Cold worker failed for ${target.displayPath}: ${stderr}`);
  if (stderr !== "") throw new Error(`Cold worker wrote diagnostics for ${target.displayPath}: ${stderr}`);
  const observation = requireCliEnvelope(stdout, `Cold worker ${operation} ${target.displayPath}`);
  if (typeof observation.medianMs !== "number" || typeof observation.last !== "object" || observation.last === null) {
    throw new Error(`Cold worker returned an invalid observation for ${target.displayPath}`);
  }
  const lastEnvelope = (observation.last as { envelope?: unknown }).envelope;
  if (typeof lastEnvelope !== "object" || lastEnvelope === null || Array.isArray(lastEnvelope)) {
    throw new Error(`Cold worker returned an invalid envelope for ${target.displayPath}`);
  }
  const typedEnvelope = lastEnvelope as Record<string, unknown>;
  if (operation === "outline") assertExpectedOutline(typedEnvelope, target, `Cold outline ${target.displayPath}`);
  else assertExpectedSymbol(typedEnvelope, target, `Cold symbol ${target.displayPath}`);
  const lastObservation = observation.last as {
    elapsedMs: number;
    stdoutBytes: number;
    stdoutLines: number;
  };
  return {
    medianMs: observation.medianMs,
    last: {
      elapsedMs: lastObservation.elapsedMs,
      envelopeDigest: digestEnvelope(lastEnvelope as Record<string, unknown>),
      stdoutBytes: lastObservation.stdoutBytes,
      stdoutLines: lastObservation.stdoutLines,
    },
  };
}

function runCold(target: BenchmarkTarget, operation: "outline" | "symbol"): ColdObservation {
  return invokeColdWorker(target, operation);
}

function parseWarmObservation(stdout: string, target: BenchmarkTarget): WarmObservation {
  const value = requireCliEnvelope(stdout, `Warm worker ${target.displayPath}`);
  const outline = value.outline;
  const symbol = value.symbol;
  if (typeof outline !== "object" || outline === null || Array.isArray(outline)) {
    throw new Error(`Warm worker returned no outline observation for ${target.displayPath}`);
  }
  if (typeof symbol !== "object" || symbol === null || Array.isArray(symbol)) {
    throw new Error(`Warm worker returned no symbol observation for ${target.displayPath}`);
  }
  const outlineObservation = outline as Record<string, unknown>;
  const symbolObservation = symbol as Record<string, unknown>;
  const numericFields = [
    ["outline.elapsedMs", outlineObservation.elapsedMs],
    ["outline.stdoutBytes", outlineObservation.stdoutBytes],
    ["outline.stdoutLines", outlineObservation.stdoutLines],
    ["symbol.elapsedMs", symbolObservation.elapsedMs],
    ["symbol.stdoutBytes", symbolObservation.stdoutBytes],
    ["symbol.stdoutLines", symbolObservation.stdoutLines],
    ["symbolCodeBytes", value.symbolCodeBytes],
    ["symbolCodeLines", value.symbolCodeLines],
    ["rssBytes", value.rssBytes],
  ] as const;
  for (const [name, field] of numericFields) {
    if (typeof field !== "number" || !Number.isFinite(field) || field < 0) {
      throw new Error(`Warm worker returned invalid ${name} for ${target.displayPath}`);
    }
  }
  if (
    typeof outlineObservation.envelopeDigest !== "string" ||
    typeof symbolObservation.envelopeDigest !== "string"
  ) {
    throw new Error(`Warm worker returned invalid envelope digests for ${target.displayPath}`);
  }
  return value as unknown as WarmObservation;
}

function runWarm(target: BenchmarkTarget): WarmObservation {
  const workerArgs = useBuilt ? [warmWorkerPath] : [...tsxArgs, warmWorkerPath];
  const result = spawnSync(
    process.execPath,
    [...warmNodeRuntimeArgs, ...workerArgs, target.filePath, target.selectorName, String(WARM_REPS)],
    {
      cwd: repoRoot,
      timeout: 180_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Warm worker failed for ${target.displayPath}: ${result.stderr}`);
  }
  if (result.stderr !== "") throw new Error(`Warm worker wrote diagnostics for ${target.displayPath}: ${result.stderr}`);
  return parseWarmObservation(result.stdout, target);
}

function measureRawRead(target: BenchmarkTarget): number {
  const elapsed: number[] = [];
  for (let repetition = 0; repetition < WARM_REPS; repetition += 1) {
    const start = performance.now();
    const source = readFileSync(target.filePath, "utf8");
    const elapsedMs = performance.now() - start;
    if (source.length === 0) throw new Error(`Raw read returned an empty source for ${target.displayPath}`);
    elapsed.push(elapsedMs);
  }
  return median(elapsed);
}

async function measureEnginePhases(
  target: BenchmarkTarget,
  adapter: LanguageAdapter,
  runtime: BenchmarkRuntime,
): Promise<PhaseObservation> {
  const hostLoad: number[] = [];
  const parse: number[] = [];
  const extract: number[] = [];
  const total: number[] = [];

  for (let repetition = 0; repetition < PHASE_REPS; repetition += 1) {
    const source = readFileSync(target.filePath, "utf8");
    const sourceIndex = new runtime.SourceIndex(source);
    const engine = new runtime.WasmEngine();
    const totalStart = performance.now();
    const loaded = await engine.loadLanguage(adapter.grammarId);
    const afterLoad = performance.now();
    let afterParse = 0;
    const parsed = await engine.withParse(source, loaded, async ({ tree, hadError }) => {
      afterParse = performance.now();
      const symbols = await adapter.extractSymbols({
        tree,
        source,
        sourceIndex,
        filePath: target.filePath,
        engine,
        symbolBudget: createSymbolBudget(),
      });
      return { hadError, symbols };
    });
    const afterExtract = performance.now();

    if (parsed.hadError) throw new Error(`Engine phase parse recovered an error for ${target.displayPath}`);
    if (!parsed.symbols.some((symbol) => symbol.name === target.selectorName)) {
      throw new Error(`Engine phase extraction did not return ${target.selectorName} for ${target.displayPath}`);
    }

    hostLoad.push(afterLoad - totalStart);
    parse.push(afterParse - afterLoad);
    extract.push(afterExtract - afterParse);
    total.push(afterExtract - totalStart);
  }

  return {
    hostLoadMs: median(hostLoad),
    parseMs: median(parse),
    extractMs: median(extract),
    totalMs: median(total),
  };
}

function getCommit(): string {
  const fromEnvironment = process.env.GITHUB_SHA?.trim();
  if (fromEnvironment) return fromEnvironment;
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const status = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", ".", ":(exclude)docs/PERFORMANCE_BENCHMARK_RESULTS.md"],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    return status ? `${commit} (working tree dirty)` : commit;
  } catch {
    return "unknown";
  }
}

function assertDeterministic(cold: CliObservation, warm: CliObservation, context: string): void {
  if (cold.envelopeDigest !== warm.envelopeDigest) {
    throw new Error(`${context} changed between cold CLI and warm API execution`);
  }
}

function formatBytes(bytes: number): string {
  return bytes.toLocaleString("en-US");
}

function formatMiB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function formatMs(milliseconds: number): string {
  return milliseconds.toFixed(2);
}

function buildReport(measurements: BenchmarkMeasurement[]): string {
  const maxRss = Math.max(...measurements.map((measurement) => measurement.warmRssBytes));
  const packageVersion = (JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string }).version;
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, "grammars", "wasm", "manifest.json"), "utf8")) as {
    grammars: Array<{ language: string; wasmFile: string; sha256: string }>;
  };
  const grammarHashes = manifest.grammars
    .map((grammar) => `| ${grammar.language} | ${grammar.wasmFile} | \`${grammar.sha256}\` |`)
    .join("\n");
  const fixtureHashes = measurements
    .map((measurement) => `| ${measurement.adapter} | ${measurement.fixture} | \`${measurement.fixtureSha256}\` |`)
    .join("\n");
  const latencyRows = measurements
    .map(
      (measurement) =>
        `| ${measurement.adapter} | ${measurement.fixture} | ${formatBytes(measurement.sourceBytes)} | ${formatMs(measurement.rawReadMs)} ms | ${formatMs(measurement.hostLoadMs)} ms | ${formatMs(measurement.parseMs)} ms | ${formatMs(measurement.extractMs)} ms | ${formatMs(measurement.coldOutlineMs)} ms | ${formatMs(measurement.warmOutlineMs)} ms | ${formatMs(measurement.coldSymbolMs)} ms | ${formatMs(measurement.warmSymbolMs)} ms |`,
    )
    .join("\n");
  const outputRows = measurements
    .map(
      (measurement) =>
        `| ${measurement.adapter} | ${measurement.fixture} | ${formatBytes(measurement.sourceBytes)} | ${formatBytes(measurement.outlineOutputBytes)} | ${measurement.outlineOutputLines} | ${formatBytes(measurement.symbolOutputBytes)} | ${measurement.symbolOutputLines} | ${formatBytes(measurement.symbolCodeBytes)} | ${measurement.symbolCodeLines} | ${measurement.symbolReductionPct.toFixed(3)}% |`,
    )
    .join("\n");
  const rssRows = measurements
    .map(
      (measurement) =>
        `| ${measurement.adapter} | ${measurement.fixture} | ${formatMiB(measurement.warmRssBytes)} MiB |`,
    )
    .join("\n");

  return `# Performance Benchmark Results

Generated by \`test/benchmark/run.ts\`. This report is evidence from frozen
fixtures, not a release latency promise. Re-run it on the target OS, Node
version, and package commit before comparing environments or making a
performance claim.

## Reproducibility

- Commit: \`${getCommit()}\`
- OS: ${os.type()} ${os.release()} (${os.platform()})
- Architecture: ${os.arch()}
- Node version: ${process.version}
- Package version: ${packageVersion}
- Cohorts: JavaScript, TypeScript, TSX, Python, and CFML
- Fixture sizes: 5 KB, 50 KB, 500 KB, and 1 MB
- Cold repetitions: ${COLD_REPS} per operation (fresh CLI process; median)
- Warm repetitions: ${WARM_REPS} per operation (same-process API in one isolated worker per target; median)
- Engine phase repetitions: ${PHASE_REPS} (fresh engine per sample; median)
- Raw-read repetitions: ${WARM_REPS} (UTF-8 file read; median)
- CLI command: \`${useBuilt ? `node ${path.relative(repoRoot, builtCliPath).split(path.sep).join("/")}` : `node ${tsxArgs.join(" ")} ${path.relative(repoRoot, sourceCliPath).split(path.sep).join("/")}`}\`
- Node runtime flags: \`${nodeRuntimeArgs.length > 0 ? nodeRuntimeArgs.join(" ") : "(none)"}\`
- Warm worker runtime flags: \`${warmNodeRuntimeArgs.join(" ")}\`
- Benchmark command: \`npm run benchmark:fixtures && npm run build && npm run --silent benchmark\`

## Grammar hashes

| Language | WASM file | SHA-256 |
|---|---|---|
${grammarHashes}

## Latency

| Adapter | Fixture | Source bytes | Raw read | Host grammar load | Parse | Adapter extract | Cold outline | Warm outline | Cold symbol | Warm symbol |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${latencyRows}

Definitions:

- **Raw read** is the full-source UTF-8 read baseline; it does not include an
  agent's shell or model overhead.
- **Host grammar load** is the direct engine load phase. The first sample also
  pays the process-wide web-tree-sitter runtime initialization; later samples
  measure a fresh engine's grammar load after that runtime is initialized.
- **Adapter extract** includes AST-to-IR extraction and, for CFML, embedded
  grammar loads/parses for the embedded regions.
- **Cold** is the full CLI process boundary: Node startup, module loading,
  parser initialization, grammar load, parse, extraction, and JSON serialization.
- **Warm** is the same public Core API in a short-lived worker after one
  untimed grammar-cache prime. Repetitions for one target share the worker;
  targets do not share the worker.

## Output and context reduction

| Adapter | Fixture | Source bytes | Outline JSON bytes | Outline lines | Symbol JSON bytes | Symbol lines | Exact symbol code bytes | Code lines | Symbol reduction |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
${outputRows}

The symbol reduction compares the exact \`result.code\` bytes for \`fn0\`
with the full source bytes. The outline and symbol JSON values include the
complete machine envelope an agent receives, including ranges and warnings.
The benchmark compares a SHA-256 digest of the canonical JSON envelope to
detect non-deterministic result changes. CLI framing bytes (including its
terminal newline) are measured separately.

## RSS observation

| Adapter | Fixture | Isolated warm-worker RSS after operation |
|---|---|---:|
${rssRows}

The RSS column is a post-operation sample from the target's isolated warm
worker, not a portable OS peak-memory profile. It includes Node, the WASM
runtime, the loaded grammar, and the target's warm API allocations. The largest
observed sample in this run was **${formatMiB(maxRss)} MiB**; use a
platform-specific profiler when memory limits are part of a deployment decision.

## Fixture hashes

| Adapter | Fixture | SHA-256 |
|---|---|---|
${fixtureHashes}

## Scope and interpretation

- This run covers every current host adapter and all four documented size
  cohorts, including the 1 MB stress case.
- It is not a native Tree-sitter or ast-grep comparison; those remain separate
  benchmark backends and must use the same fixtures and selector contract.
- The runner has a correctness gate (valid parse, expected \`fn0\`, clean CLI
  JSON, and deterministic cold/warm envelopes) but intentionally has no invented
  latency threshold. Cross-platform comparison belongs in CI artifacts, where
  each OS/Node result remains separately attributable.
`;
}

async function main(): Promise<void> {
  const targets = cohorts.flatMap((cohort) => SIZE_IDS.map((size) => targetFor(cohort, size)));
  for (const target of targets) {
    if (!existsSync(target.filePath)) {
      throw new Error(
        `Benchmark fixture missing: ${target.displayPath}. Run "npm run benchmark:fixtures" before "npm run benchmark".`,
      );
    }
  }

  // Complete all cold subprocess measurements before touching a grammar in
  // this process. This keeps the cold process boundary independent from the
  // warm in-process WASM cache and avoids retaining large ASTs while spawning.
  const coldResults = new Map<string, { outline: ColdObservation; symbol: ColdObservation }>();
  for (const target of targets) {
    const outlineResult = await runCold(target, "outline");
    const symbolResult = await runCold(target, "symbol");
    coldResults.set(target.displayPath, { outline: outlineResult, symbol: symbolResult });
    console.error(
      `${target.cohort.id}/${target.size}: cold outline ${formatMs(outlineResult.medianMs)} ms, cold symbol ${formatMs(symbolResult.medianMs)} ms`,
    );
  }

  const [engineModule, registryModule, coordinatesModule] = await Promise.all([
    import("../../src/engine/wasm-engine.js"),
    import("../../src/languages/registry.js"),
    import("../../src/schema/coordinates.js"),
  ]);
  const runtime: BenchmarkRuntime = {
    WasmEngine: engineModule.WasmEngine,
    detectAdapter: registryModule.detectAdapter,
    SourceIndex: coordinatesModule.SourceIndex,
  };

  const measurements: BenchmarkMeasurement[] = [];
  for (const target of targets) {
    const source = readFileSync(target.filePath, "utf8");
    const sourceBytes = Buffer.byteLength(source, "utf8");
    const adapter = runtime.detectAdapter(target.filePath);
    const cold = coldResults.get(target.displayPath);
    if (!cold) throw new Error(`Cold benchmark result missing for ${target.displayPath}`);
    const phases = await measureEnginePhases(target, adapter, runtime);
    const warm = runWarm(target);
    assertDeterministic(cold.outline.last, warm.outline, `Outline ${target.displayPath}`);
    assertDeterministic(cold.symbol.last, warm.symbol, `Symbol ${target.displayPath}`);

    const symbolReductionPct = 100 * (1 - warm.symbolCodeBytes / sourceBytes);
    const measurement: BenchmarkMeasurement = {
      adapter: adapter.id,
      fixture: target.displayPath,
      size: target.size,
      sourceBytes,
      sourceLines: lineCount(source),
      fixtureSha256: sha256(target.filePath),
      rawReadMs: measureRawRead(target),
      hostLoadMs: phases.hostLoadMs,
      parseMs: phases.parseMs,
      extractMs: phases.extractMs,
      coldOutlineMs: cold.outline.medianMs,
      warmOutlineMs: warm.outline.elapsedMs,
      coldSymbolMs: cold.symbol.medianMs,
      warmSymbolMs: warm.symbol.elapsedMs,
      outlineOutputBytes: warm.outline.stdoutBytes,
      outlineOutputLines: warm.outline.stdoutLines,
      symbolOutputBytes: warm.symbol.stdoutBytes,
      symbolOutputLines: warm.symbol.stdoutLines,
      symbolCodeBytes: warm.symbolCodeBytes,
      symbolCodeLines: warm.symbolCodeLines,
      symbolReductionPct,
      warmRssBytes: warm.rssBytes,
    };
    measurements.push(measurement);
    console.error(
      `${measurement.adapter}/${target.size}: warm outline ${formatMs(measurement.warmOutlineMs)} ms, warm symbol ${formatMs(measurement.warmSymbolMs)} ms`,
    );
  }

  process.stdout.write(buildReport(measurements));
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(captureDir, { recursive: true, force: true });
  });

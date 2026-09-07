import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Ajv2020 } from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MIN_OUTPUT_BYTES } from "../../src/core/limits.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const cliPath = path.join(repoRoot, "dist", "cli", "index.js");
const corePath = path.join(repoRoot, "dist", "core", "index.js");
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, "schemas", "code-slice-result-v1.schema.json"), "utf8"),
) as object;
const validateEnvelope = new Ajv2020({ strict: false }).compile(schema);
const cliSchema = JSON.parse(
  readFileSync(path.join(repoRoot, "schemas", "code-slice-result-v1.1.schema.json"), "utf8"),
) as object;
const validateCliEnvelope = new Ajv2020({ strict: false }).compile(cliSchema);

interface JsonRecord {
  [key: string]: unknown;
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    assert.fail(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Captures content, paths, and metadata so a read-only agent workflow cannot silently write. */
function snapshotWorkspace(root: string): string {
  const entries: string[] = [];

  function visit(current: string, relative: string): void {
    const stat = lstatSync(current);
    const type = stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file";
    const target = stat.isSymbolicLink() ? readlinkSync(current) : "";
    const contentHash = stat.isFile() ? sha256(readFileSync(current)) : "";
    entries.push(
      JSON.stringify({
        path: relative,
        type,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        target,
        contentHash,
      }),
    );
    if (!stat.isDirectory()) return;

    for (const name of readdirSync(current).sort((a, b) => a.localeCompare(b))) {
      const child = path.join(current, name);
      const childRelative = relative ? path.join(relative, name) : name;
      visit(child, childRelative.split(path.sep).join("/"));
    }
  }

  visit(root, "");
  return entries.sort().join("\n");
}

function createWorkspace(testContext: TestContext, files: Array<{ source: string; destination: string }>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-code-slice-agent-e2e-"));
  testContext.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of files) {
    const destination = path.join(root, file.destination);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(repoRoot, file.source), destination);
  }
  // Some macOS temp paths are aliases of /private/var. Pass the canonical
  // root to the CLI so the test exercises the product boundary, not alias
  // spelling differences between cwd and --root.
  return realpathSync(root);
}

function runCli(root: string, args: string[]): CliResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    timeout: 60_000,
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.error) assert.fail(`CLI process failed to start: ${result.error.message}`);
  return {
    status: result.status,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
}

function parseJsonEnvelope(run: CliResult, label: string): JsonRecord {
  assert.equal(run.stderr, "", `${label} wrote diagnostics to stderr`);
  assert.ok(run.stdout.endsWith("\n"), `${label} did not end with a JSON newline`);
  const document = run.stdout.slice(0, -1);
  const envelope = record(JSON.parse(document) as unknown, `${label} JSON`);
  assert.equal(validateEnvelope(envelope), true, `${label} violated the v1 JSON schema: ${JSON.stringify(validateEnvelope.errors)}`);
  return envelope;
}

function parseCliErrorEnvelope(run: CliResult, label: string): JsonRecord {
  assert.equal(run.stderr, "", `${label} wrote diagnostics to stderr`);
  assert.ok(run.stdout.endsWith("\n"), `${label} did not end with a JSON newline`);
  const document = run.stdout.slice(0, -1);
  const envelope = record(JSON.parse(document) as unknown, `${label} JSON`);
  assert.equal(
    validateCliEnvelope(envelope),
    true,
    `${label} violated the v1.1 CLI JSON schema: ${JSON.stringify(validateCliEnvelope.errors)}`,
  );
  return envelope;
}

function successResult(envelope: JsonRecord, label: string): JsonRecord {
  assert.equal(envelope.ok, true, `${label} returned ${JSON.stringify(envelope.error)}`);
  return record(envelope.result, `${label}.result`);
}

test("agent-facing CLI workflow uses outline, exact symbol, and fail-closed fallback", (testContext) => {
  const root = createWorkspace(testContext, [
    { source: "test/fixtures/benchmark/500kb.js", destination: "src/large.js" },
    { source: "test/fixtures/javascript/basic.js", destination: "src/basic.js" },
  ]);
  const before = snapshotWorkspace(root);
  const source = readFileSync(path.join(root, "src", "large.js"), "utf8");
  const sourceBytes = Buffer.byteLength(source, "utf8");

  const outlineRun = runCli(root, ["outline", "src/large.js", "--root", root, "--json"]);
  assert.equal(outlineRun.status, 0);
  const outlineEnvelope = parseJsonEnvelope(outlineRun, "agent outline");
  const outlineResult = successResult(outlineEnvelope, "agent outline");
  const symbols = outlineResult.symbols;
  assert.ok(Array.isArray(symbols));
  assert.ok(
    symbols.some((symbol) => record(symbol, "outline symbol").name === "fn1000"),
    "agent outline did not expose the requested symbol",
  );

  const symbolRun = runCli(root, ["symbol", "src/large.js", "fn1000", "--root", root, "--json"]);
  assert.equal(symbolRun.status, 0);
  const symbolEnvelope = parseJsonEnvelope(symbolRun, "agent symbol");
  const symbolResult = successResult(symbolEnvelope, "agent symbol");
  assert.equal(symbolResult.kind, "function");
  assert.match(String(symbolResult.code), /^export function fn1000/);
  const symbolRange = record(symbolResult.range, "agent symbol.range");
  const startByte = Number(symbolRange.startByte);
  const endByte = Number(symbolRange.endByte);
  assert.equal(String(symbolResult.code), Buffer.from(source, "utf8").subarray(startByte, endByte).toString("utf8"));
  assert.ok(Buffer.byteLength(String(symbolResult.code), "utf8") < sourceBytes, "symbol slice did not reduce context");

  const ambiguousRun = runCli(root, ["symbol", "src/basic.js", "save", "--root", root, "--json"]);
  assert.equal(ambiguousRun.status, 7);
  const ambiguousEnvelope = parseJsonEnvelope(ambiguousRun, "agent ambiguity");
  assert.equal(ambiguousEnvelope.ok, false);
  const error = record(ambiguousEnvelope.error, "agent ambiguity.error");
  assert.equal(error.code, "SYMBOL_AMBIGUOUS");
  assert.equal(error.recoverable, true);
  assert.equal((error.candidates as unknown[]).length, 2);

  // An agent must fall back to a normal read after an ambiguous result.
  const fallbackText = readFileSync(path.join(root, "src", "basic.js"), "utf8");
  assert.match(fallbackText, /class Invoice/);
  assert.equal(snapshotWorkspace(root), before, "CLI workflow modified the authorized workspace");
});

test("agent-facing JS API workflow uses the built public entry point and stays read-only", async (testContext) => {
  assert.equal(existsSync(corePath), true, `built public API not found at ${corePath}`);
  const root = createWorkspace(testContext, [
    { source: "test/fixtures/typescript/basic.ts", destination: "src/invoice.ts" },
  ]);
  const before = snapshotWorkspace(root);
  const publicApi = (await import(pathToFileURL(corePath).href)) as {
    capabilities: () => Promise<JsonRecord>;
    outline: (params: JsonRecord) => Promise<JsonRecord>;
    slice: (params: JsonRecord) => Promise<JsonRecord>;
  };

  const capabilities = await publicApi.capabilities();
  assert.equal(capabilities.ok, true);
  const capabilityResult = successResult(capabilities, "agent JS capabilities");
  assert.ok(
    (capabilityResult.languages as unknown[]).some((language) => record(language, "capability").id === "typescript"),
  );

  const outlineEnvelope = await publicApi.outline({ file: path.join(root, "src", "invoice.ts"), root });
  const outlineResult = successResult(outlineEnvelope, "agent JS outline");
  assert.ok((outlineResult.symbols as unknown[]).some((symbol) => record(symbol, "JS outline symbol").name === "calculateTotal"));

  const symbolEnvelope = await publicApi.slice({
    file: path.join(root, "src", "invoice.ts"),
    root,
    selector: { type: "symbol", name: "calculateTotal" },
  });
  const symbolResult = successResult(symbolEnvelope, "agent JS symbol");
  assert.equal(symbolResult.kind, "function");
  assert.match(String(symbolResult.code), /^export function calculateTotal/);
  assert.equal(snapshotWorkspace(root), before, "JS API workflow modified the authorized workspace");
});

test("agent-facing CLI rejects malformed arguments with JSON-clean, machine-readable errors", (testContext) => {
  const root = createWorkspace(testContext, [
    { source: "test/fixtures/javascript/basic.js", destination: "src/basic.js" },
  ]);

  const unknownFlag = runCli(root, ["outline", "src/basic.js", "--unknown-flag", "--json"]);
  assert.equal(unknownFlag.status, 2);
  const unknownEnvelope = parseCliErrorEnvelope(unknownFlag, "unknown flag");
  assert.equal(record(unknownEnvelope.error, "unknown flag.error").code, "INVALID_ARGUMENT");

  const extraArgument = runCli(root, ["line", "src/basic.js", "1", "extra", "--json"]);
  assert.equal(extraArgument.status, 2);
  const extraEnvelope = parseCliErrorEnvelope(extraArgument, "extra argument");
  assert.equal(record(extraEnvelope.error, "extra argument.error").code, "INVALID_ARGUMENT");

  const invalidLimit = runCli(root, ["outline", "src/basic.js", "--max-symbols", "-1", "--json"]);
  assert.equal(invalidLimit.status, 2);
  const invalidLimitEnvelope = parseJsonEnvelope(invalidLimit, "invalid limit");
  assert.equal(record(invalidLimitEnvelope.error, "invalid limit.error").code, "INVALID_ARGUMENT");

  const helpJson = runCli(root, ["--help", "--json"]);
  assert.equal(helpJson.status, 2);
  assert.equal(record(parseCliErrorEnvelope(helpJson, "help with json").error, "help with json.error").code, "INVALID_ARGUMENT");

  const boundedError = runCli(root, [
    "symbol",
    "src/basic.js",
    "x".repeat(10_000),
    "--max-output-bytes",
    String(MIN_OUTPUT_BYTES),
    "--json",
  ]);
  assert.equal(boundedError.status, 8);
  const boundedEnvelope = parseJsonEnvelope(boundedError, "bounded output error");
  assert.equal(record(boundedEnvelope.error, "bounded output error.error").code, "OUTPUT_LIMIT_EXCEEDED");
  assert.ok(Buffer.byteLength(JSON.stringify(boundedEnvelope), "utf8") <= MIN_OUTPUT_BYTES);
});

test("agent-facing CLI narrows large-class navigation with qualified members and syntax ranges", (testContext) => {
  const root = createWorkspace(testContext, [
    { source: "test/fixtures/typescript/navigation.ts", destination: "src/navigation.ts" },
  ]);
  const before = snapshotWorkspace(root);

  const qualified = runCli(root, [
    "symbol",
    "src/navigation.ts",
    "OwnerOAuthProvider.commit",
    "--root",
    root,
    "--max-lines",
    "10",
    "--json",
  ]);
  assert.equal(qualified.status, 0);
  const qualifiedResult = successResult(parseJsonEnvelope(qualified, "qualified member"), "qualified member");
  assert.equal(qualifiedResult.kind, "method");
  assert.match(String(qualifiedResult.code), /^commit\(value: string\)/);

  const topLevel = runCli(root, ["outline", "src/navigation.ts", "--root", root, "--top-level", "--json"]);
  assert.equal(topLevel.status, 0);
  const topLevelResult = successResult(parseJsonEnvelope(topLevel, "top-level outline"), "top-level outline");
  const topNames = (topLevelResult.symbols as unknown[]).map((symbol) => record(symbol, "top-level symbol").name);
  assert.ok(topNames.includes("OwnerOAuthProvider"));
  assert.ok(!topNames.includes("normalized"));

  const withLocals = runCli(root, ["outline", "src/navigation.ts", "--root", root, "--include-locals", "--json"]);
  assert.equal(withLocals.status, 0);
  const withLocalsResult = successResult(parseJsonEnvelope(withLocals, "outline with locals"), "outline with locals");
  const localNames = (withLocalsResult.symbols as unknown[]).map((symbol) => record(symbol, "local symbol").name);
  assert.ok(localNames.includes("normalized"));
  assert.ok(localNames.includes("audit"));

  const tooLarge = runCli(root, [
    "symbol",
    "src/navigation.ts",
    "OwnerOAuthProvider",
    "--root",
    root,
    "--max-lines",
    "5",
    "--json",
  ]);
  assert.equal(tooLarge.status, 8);
  const tooLargeEnvelope = parseJsonEnvelope(tooLarge, "max-lines failure");
  assert.equal(record(tooLargeEnvelope.error, "max-lines failure.error").code, "OUTPUT_LIMIT_EXCEEDED");

  const smallest = runCli(root, [
    "range",
    "src/navigation.ts",
    "6:9",
    "--root",
    root,
    "--smallest",
    "--max-lines",
    "4",
    "--json",
  ]);
  assert.equal(smallest.status, 0);
  const smallestResult = successResult(parseJsonEnvelope(smallest, "smallest range"), "smallest range");
  assert.equal(smallestResult.nativeKind, "if_statement");

  const beyondEof = runCli(root, ["range", "src/navigation.ts", "20:999", "--root", root, "--json"]);
  assert.equal(beyondEof.status, 6);
  const beyondEnvelope = parseJsonEnvelope(beyondEof, "range suggestion");
  const beyondError = record(beyondEnvelope.error, "range suggestion.error");
  assert.equal(beyondError.code, "RANGE_INVALID");
  const details = record(beyondError.details, "range suggestion.details");
  assert.ok(record(details.suggestion, "range suggestion.details.suggestion").endLine);

  const invalidClamp = runCli(root, ["range", "src/navigation.ts", "999:1000", "--root", root, "--clamp", "--json"]);
  assert.equal(invalidClamp.status, 6);
  const invalidClampEnvelope = parseJsonEnvelope(invalidClamp, "invalid clamp");
  assert.equal(record(invalidClampEnvelope.error, "invalid clamp.error").code, "RANGE_INVALID");

  const clamped = runCli(root, ["range", "src/navigation.ts", "20:999", "--root", root, "--clamp", "--json"]);
  assert.equal(clamped.status, 0);
  const clampedEnvelope = parseJsonEnvelope(clamped, "clamped range");
  assert.equal(clampedEnvelope.ok, true);
  assert.ok(
    (clampedEnvelope.warnings as unknown[]).some((warning) => record(warning, "clamp warning").code === "RANGE_CLAMPED"),
  );

  assert.equal(snapshotWorkspace(root), before, "precision navigation workflow modified the authorized workspace");
});

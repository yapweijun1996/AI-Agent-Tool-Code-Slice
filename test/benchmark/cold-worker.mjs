#!/usr/bin/env node
/**
 * Runs a small cold-process sample for the parent benchmark runner.
 *
 * The worker owns only one target/operation. Keeping the three fresh CLI
 * children in a short-lived worker prevents repeated WASM child-process
 * teardown from accumulating in the long-lived benchmark process on some
 * hosts.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const builtCliPath = path.join(repoRoot, "dist", "cli", "index.js");
const sourceCliPath = path.join(repoRoot, "src", "cli", "index.ts");
const nodeMajor = Number(process.versions.node.split(".")[0]);
// Node 23 on macOS 26 can leave a WASM CLI child in V8's background Maglev
// compilation queue after repeated cold launches. Supported CI versions do
// not need this workaround; keep the local unsupported runtime bounded.
const nodeRuntimeArgs = nodeMajor >= 23 ? ["--no-maglev"] : [];
const tsxArgs = nodeMajor === 18 ? ["--loader", "tsx"] : ["--import", "tsx"];
const cliCommand = existsSync(builtCliPath)
  ? [process.execPath, [...nodeRuntimeArgs, builtCliPath]]
  : [process.execPath, [...nodeRuntimeArgs, ...tsxArgs, sourceCliPath]];
const captureDir = mkdtempSync(path.join(os.tmpdir(), "agent-code-slice-cold-worker-"));
let captureId = 0;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function lineCount(text) {
  if (text.length === 0) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function assertExpectedEnvelope(envelope, operation, selectorName) {
  if (envelope?.ok !== true || typeof envelope.result !== "object" || envelope.result === null) {
    throw new Error(`Cold ${operation} CLI returned an error envelope`);
  }
  if (operation === "outline") {
    const symbols = envelope.result.symbols;
    if (!Array.isArray(symbols) || !symbols.some((symbol) => symbol?.name === selectorName)) {
      throw new Error(`Cold outline CLI did not return ${selectorName}`);
    }
    return;
  }
  if (typeof envelope.result.code !== "string" || !envelope.result.code.includes(selectorName)) {
    throw new Error(`Cold symbol CLI did not return ${selectorName}`);
  }
}

function readCli(operation, filePath, selectorName) {
  const [command, baseArgs] = cliCommand;
  const id = captureId++;
  const stdoutPath = path.join(captureDir, `stdout-${id}.txt`);
  const stderrPath = path.join(captureDir, `stderr-${id}.txt`);
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  const operationArgs = operation === "outline"
    ? ["outline", filePath, "--json"]
    : ["symbol", filePath, selectorName, "--json"];
  const start = performance.now();
  let result;
  try {
    result = spawnSync(command, [...baseArgs, ...operationArgs], {
      cwd: repoRoot,
      timeout: 60_000,
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
  if (result.status !== 0) {
    throw new Error(`Cold ${operation} CLI exited with ${String(result.status)}: ${stderr}`);
  }
  if (stderr !== "") throw new Error(`Cold ${operation} CLI wrote diagnostics: ${stderr}`);
  if (!stdout.endsWith("\n")) throw new Error(`Cold ${operation} CLI did not terminate JSON with a newline`);

  const document = stdout.slice(0, -1);
  let envelope;
  try {
    envelope = JSON.parse(document);
  } catch (error) {
    throw new Error(`Cold ${operation} CLI emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertExpectedEnvelope(envelope, operation, selectorName);
  return {
    elapsedMs: performance.now() - start,
    envelope,
    stdoutBytes: Buffer.byteLength(stdout, "utf8"),
    stdoutLines: lineCount(stdout),
  };
}

async function main() {
  const [operation, filePath, selectorName, repetitionsText] = process.argv.slice(2);
  const repetitions = Number(repetitionsText);
  if ((operation !== "outline" && operation !== "symbol") || !filePath || !selectorName || !Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error("Usage: cold-worker.mjs <outline|symbol> <file> <selector> <repetitions>");
  }

  const elapsedTimes = [];
  let last;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    last = readCli(operation, filePath, selectorName);
    elapsedTimes.push(last.elapsedMs);
  }
  process.stdout.write(`${JSON.stringify({ medianMs: median(elapsedTimes), last })}\n`);
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(captureDir, { recursive: true, force: true });
  });

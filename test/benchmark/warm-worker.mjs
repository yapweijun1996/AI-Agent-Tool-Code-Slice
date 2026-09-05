#!/usr/bin/env node
/**
 * Runs the warm public API sample for one target in an isolated process.
 *
 * Repetitions remain same-process API calls after one grammar-cache prime, but
 * the short-lived worker keeps per-target RSS independent from other grammar
 * and fixture sizes in the parent report process.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const builtCorePath = path.join(repoRoot, "dist", "core", "index.js");
const sourceCorePath = path.join(repoRoot, "src", "core", "index.ts");
const corePath = existsSync(builtCorePath) ? builtCorePath : sourceCorePath;
const { outline, slice } = await import(pathToFileURL(corePath).href);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function lineCount(text) {
  if (text.length === 0) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function digestEnvelope(envelope) {
  return createHash("sha256").update(JSON.stringify(envelope), "utf8").digest("hex");
}

function requireSuccess(envelope, context) {
  if (envelope?.ok !== true || typeof envelope.result !== "object" || envelope.result === null) {
    throw new Error(`${context} returned an error envelope`);
  }
  return envelope.result;
}

function assertExpectedOutline(envelope, selectorName, context) {
  const result = requireSuccess(envelope, context);
  if (!Array.isArray(result.symbols) || !result.symbols.some((symbol) => symbol?.name === selectorName)) {
    throw new Error(`${context} did not return ${selectorName}`);
  }
}

function assertExpectedSymbol(envelope, selectorName, context) {
  const result = requireSuccess(envelope, context);
  if (typeof result.code !== "string" || !result.code.includes(selectorName)) {
    throw new Error(`${context} returned the wrong symbol`);
  }
  return result.code;
}

function observation(envelope, elapsedMs) {
  const json = JSON.stringify(envelope);
  return {
    elapsedMs,
    envelopeDigest: digestEnvelope(envelope),
    stdoutBytes: Buffer.byteLength(json, "utf8"),
    stdoutLines: lineCount(json),
  };
}

function collectGarbage() {
  const maybeGc = globalThis.gc;
  if (typeof maybeGc === "function") maybeGc();
}

async function main() {
  const [filePath, selectorName, repetitionsText] = process.argv.slice(2);
  const repetitions = Number(repetitionsText);
  if (!filePath || !selectorName || !Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new Error("Usage: warm-worker.mjs <file> <selector> <repetitions>");
  }

  assertExpectedOutline(await outline({ file: filePath }), selectorName, `Warm prime ${filePath}`);
  collectGarbage();

  const outlineTimes = [];
  const symbolTimes = [];
  let lastOutline;
  let lastSymbol;
  let symbolCode = "";

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const outlineStart = performance.now();
    const outlineEnvelope = await outline({ file: filePath });
    const outlineElapsedMs = performance.now() - outlineStart;
    assertExpectedOutline(outlineEnvelope, selectorName, `Warm outline ${filePath}`);
    lastOutline = observation(outlineEnvelope, outlineElapsedMs);
    outlineTimes.push(outlineElapsedMs);
    collectGarbage();

    const symbolStart = performance.now();
    const symbolEnvelope = await slice({
      file: filePath,
      selector: { type: "symbol", name: selectorName },
    });
    const symbolElapsedMs = performance.now() - symbolStart;
    symbolCode = assertExpectedSymbol(symbolEnvelope, selectorName, `Warm symbol ${filePath}`);
    lastSymbol = observation(symbolEnvelope, symbolElapsedMs);
    symbolTimes.push(symbolElapsedMs);
    collectGarbage();
  }

  if (!lastOutline || !lastSymbol) throw new Error(`Warm benchmark produced no observations for ${filePath}`);
  collectGarbage();
  process.stdout.write(
    `${JSON.stringify({
      outline: { ...lastOutline, elapsedMs: median(outlineTimes) },
      symbol: { ...lastSymbol, elapsedMs: median(symbolTimes) },
      symbolCodeBytes: Buffer.byteLength(symbolCode, "utf8"),
      symbolCodeLines: lineCount(symbolCode),
      rssBytes: process.memoryUsage().rss,
    })}\n`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

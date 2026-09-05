import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createSymbolBudget, normalizeMaxBytes, normalizeMaxOutputBytes, normalizeMaxSymbols } from "../../src/core/limits.js";
import { outline, slice, type OutlineParams, type SliceParams } from "../../src/core/index.js";
import { CodeSliceError } from "../../src/schema/errors.js";

const fixture = path.join(process.cwd(), "test", "fixtures", "javascript", "basic.js");

function errorCode(value: { ok: boolean; error?: { code: string } }): string {
  assert.equal(value.ok, false);
  assert.ok(value.error);
  return value.error.code;
}

function outlineWithUnknownInput(value: unknown) {
  return outline(value as OutlineParams);
}

function sliceWithUnknownInput(value: unknown) {
  return slice(value as SliceParams);
}

test("runtime request validation rejects invalid limits and selector shapes", async () => {
  for (const maxSymbols of [-1, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
    assert.equal(errorCode(await outlineWithUnknownInput({ file: fixture, maxSymbols })), "INVALID_ARGUMENT");
  }

  for (const maxBytes of [-1, Number.NaN, Number.POSITIVE_INFINITY, "1000"]) {
    assert.equal(errorCode(await outlineWithUnknownInput({ file: fixture, maxBytes })), "INVALID_ARGUMENT");
  }

  for (const selector of [
    { type: "wat" },
    { type: "line", line: 1.5 },
    { type: "symbol", name: "save", occurrence: 0 },
  ]) {
    assert.equal(errorCode(await sliceWithUnknownInput({ file: fixture, selector })), "INVALID_ARGUMENT");
  }
  assert.equal(
    errorCode(await sliceWithUnknownInput({ file: fixture, selector: { type: "range", startLine: 3, endLine: 2 } })),
    "RANGE_INVALID",
  );
});

test("output limits fail closed without truncating a symbol slice", async () => {
  const outlineResult = await outline({ file: fixture, maxOutputBytes: 100 });
  assert.equal(errorCode(outlineResult), "OUTPUT_LIMIT_EXCEEDED");

  const sliceResult = await slice({
    file: fixture,
    maxOutputBytes: 100,
    selector: { type: "symbol", name: "calculateTotal" },
  });
  assert.equal(errorCode(sliceResult), "OUTPUT_LIMIT_EXCEEDED");
});

test("bounded limit normalizers preserve defaults and reject values outside the contract", () => {
  assert.equal(normalizeMaxBytes(undefined), 5_000_000);
  assert.equal(normalizeMaxSymbols(undefined), 10_000);
  assert.equal(normalizeMaxOutputBytes(undefined), 8 * 1024 * 1024);
  assert.equal(normalizeMaxSymbols(0), 0);
  assert.throws(() => normalizeMaxBytes(10_000_001), (error: unknown) => {
    return error instanceof CodeSliceError && error.code === "INVALID_ARGUMENT";
  });
});

test("symbol budget fails before an extraction result can exceed its hard cap", () => {
  const budget = createSymbolBudget(2);
  budget.consume();
  budget.consume();
  assert.throws(() => budget.consume(), (error: unknown) => {
    return error instanceof CodeSliceError && error.code === "OUTPUT_LIMIT_EXCEEDED";
  });
});

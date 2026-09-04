import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outline, slice } from "../../src/core/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
function fixture(name: string): string {
  return path.join(here, "..", "fixtures", "python", name);
}

test("Python outline distinguishes module-level functions from methods", async () => {
  const envelope = await outline({ file: fixture("basic.py") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { symbols: Array<{ kind: string; name: string | null }> };
  const named = result.symbols.filter((s) => s.name !== null).map((s) => `${s.kind}:${s.name}`);
  assert.deepEqual(named.sort(), [
    "class:InvoiceService",
    "class:ReceiptService",
    "function:calculate_total",
    "function:format_price",
    "method:build",
    "method:save",
    "method:save",
  ]);
});

test("decorated method inside a class is still classified as a method, not a function", async () => {
  const envelope = await slice({ file: fixture("basic.py"), selector: { type: "symbol", name: "build" } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; code: string };
  assert.equal(result.kind, "method");
  assert.match(result.code, /^@staticmethod\s*\n\s*def build/);
});

test("lambda assignment is reported as kind function", async () => {
  const envelope = await slice({ file: fixture("basic.py"), selector: { type: "symbol", name: "format_price" } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string };
  assert.equal(result.kind, "function");
});

test("ambiguous method name across Python classes fails closed", async () => {
  const envelope = await slice({ file: fixture("basic.py"), selector: { type: "symbol", name: "save" } });
  assert.equal(envelope.ok, false);
  if (envelope.ok) return;
  assert.equal(envelope.error.code, "SYMBOL_AMBIGUOUS");
  assert.equal(envelope.error.candidates?.length, 2);
});

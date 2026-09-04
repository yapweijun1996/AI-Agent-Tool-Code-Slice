import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outline, slice } from "../../src/core/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
function fixture(name: string): string {
  return path.join(here, "..", "fixtures", "typescript", name);
}

test("TypeScript outline covers interface, type alias, function, arrow export, and classes", async () => {
  const envelope = await outline({ file: fixture("basic.ts") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { symbols: Array<{ kind: string; name: string | null }> };
  const named = result.symbols.filter((s) => s.name !== null).map((s) => `${s.kind}:${s.name}`);
  assert.deepEqual(named.sort(), [
    "class:InvoiceService",
    "class:ReceiptService",
    "function:calculateTotal",
    "function:formatPrice",
    "interface:LineItem",
    "method:save",
    "method:save",
    "type:Total",
  ]);
});

test("TypeScript symbol slice preserves the export keyword and type annotations in the signature", async () => {
  const envelope = await slice({ file: fixture("basic.ts"), selector: { type: "symbol", name: "calculateTotal" } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { signature: string | null; code: string };
  assert.equal(result.signature, "calculateTotal(qty: number, price: number)");
  assert.match(result.code, /^export function calculateTotal\(qty: number, price: number\): Total/);
});

test("ambiguous method name across TypeScript classes fails closed", async () => {
  const envelope = await slice({ file: fixture("basic.ts"), selector: { type: "symbol", name: "save" } });
  assert.equal(envelope.ok, false);
  if (envelope.ok) return;
  assert.equal(envelope.error.code, "SYMBOL_AMBIGUOUS");
});

test("TSX adapter parses JSX and finds the component function", async () => {
  const envelope = await slice({ file: fixture("basic.tsx"), selector: { type: "symbol", name: "Greeting" } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; code: string };
  assert.equal(result.kind, "function");
  assert.match(result.code, /^export function Greeting/);
  assert.match(result.code, /<div>Hello, \{name\}!<\/div>/);
});

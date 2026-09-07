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

test("line selector trims indentation before choosing the smallest TypeScript container", async () => {
  const envelope = await slice({
    file: fixture("indented-method.ts"),
    selector: { type: "line", line: 3 },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as {
    kind: string;
    name: string | null;
    range: { startLine: number; endLine: number };
  };
  assert.equal(result.kind, "method");
  assert.equal(result.name, "save");
  assert.equal(result.range.startLine, 3);
  assert.equal(result.range.endLine, 5);
});

test("expanded ranges trim blank boundary lines without changing the returned symbol", async () => {
  const envelope = await slice({
    file: fixture("indented-method.ts"),
    selector: { type: "range", startLine: 2, endLine: 6, expand: true },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; name: string | null; code: string };
  assert.equal(result.kind, "method");
  assert.equal(result.name, "save");
  assert.match(result.code, /^save\(value: string\): string \{/);
  assert.match(result.code, /\n  \}$/);
});

test("class closing lines still resolve to the class after content trimming", async () => {
  const envelope = await slice({
    file: fixture("indented-method.ts"),
    selector: { type: "line", line: 10 },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; name: string | null };
  assert.equal(result.kind, "class");
  assert.equal(result.name, "Box");
});

test("whitespace-only selections use a safe enclosing container", async () => {
  const envelope = await slice({
    file: fixture("indented-method.ts"),
    selector: { type: "line", line: 2 },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; name: string | null };
  assert.equal(result.kind, "class");
  assert.equal(result.name, "Box");
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

test("qualified class member lookup resolves Owner.member without occurrence guessing", async () => {
  const envelope = await slice({
    file: fixture("navigation.ts"),
    selector: { type: "symbol", name: "OwnerOAuthProvider.commit" },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; name: string | null; code: string; parent?: { name: string | null } };
  assert.equal(result.kind, "method");
  assert.equal(result.name, "commit");
  assert.equal(result.parent?.name, "OwnerOAuthProvider");
  assert.match(result.code, /^commit\(value: string\): string \{/);
});

test("outline hides function and method locals by default and can opt them back in", async () => {
  const compact = await outline({ file: fixture("navigation.ts") });
  assert.equal(compact.ok, true);
  if (!compact.ok) return;
  const compactNames = (compact.result as { symbols: Array<{ name: string | null }> }).symbols.map((s) => s.name);
  assert.ok(compactNames.includes("topLevelValue"));
  assert.ok(compactNames.includes("commit"));
  assert.ok(!compactNames.includes("normalized"));
  assert.ok(!compactNames.includes("audit"));

  const full = await outline({ file: fixture("navigation.ts"), includeLocals: true });
  assert.equal(full.ok, true);
  if (!full.ok) return;
  const fullNames = (full.result as { symbols: Array<{ name: string | null }> }).symbols.map((s) => s.name);
  assert.ok(fullNames.includes("normalized"));
  assert.ok(fullNames.includes("audit"));
});

test("topLevel outline exposes only parentless structural entries", async () => {
  const envelope = await outline({ file: fixture("navigation.ts"), topLevel: true });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const named = (envelope.result as { symbols: Array<{ kind: string; name: string | null }> }).symbols
    .filter((s) => s.name !== null)
    .map((s) => `${s.kind}:${s.name}`)
    .sort();
  assert.deepEqual(named, ["class:OtherProvider", "class:OwnerOAuthProvider", "variable:topLevelValue"]);
});

test("smallest range mode returns a local syntax node instead of widening to the method or class", async () => {
  const envelope = await slice({
    file: fixture("navigation.ts"),
    selector: { type: "range", startLine: 6, endLine: 9, smallest: true },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; nativeKind: string; range: { startLine: number; endLine: number }; code: string };
  assert.equal(result.kind, "block");
  assert.equal(result.nativeKind, "if_statement");
  assert.deepEqual([result.range.startLine, result.range.endLine], [6, 9]);
  assert.match(result.code, /^if \(normalized\.length > 0\) \{/);
});

test("maxLines fails closed instead of truncating a resolved slice", async () => {
  const envelope = await slice({
    file: fixture("navigation.ts"),
    maxLines: 5,
    selector: { type: "symbol", name: "OwnerOAuthProvider" },
  });
  assert.equal(envelope.ok, false);
  if (envelope.ok) return;
  assert.equal(envelope.error.code, "OUTPUT_LIMIT_EXCEEDED");
  assert.equal(envelope.error.recoverable, true);
  const details = envelope.error.details as { maxLines: number; resolvedLines: number };
  assert.equal(details.maxLines, 5);
  assert.ok(details.resolvedLines > 5);
});

test("range beyond EOF returns structured suggestion and clamp can apply it safely", async () => {
  const invalid = await slice({
    file: fixture("navigation.ts"),
    selector: { type: "range", startLine: 20, endLine: 999 },
  });
  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.equal(invalid.error.code, "RANGE_INVALID");
  assert.equal(invalid.error.recoverable, true);
  const details = invalid.error.details as {
    requested: { startLine: number; endLine: number };
    available: { startLine: number; endLine: number };
    suggestion: { startLine: number; endLine: number };
  };
  assert.deepEqual(details.requested, { startLine: 20, endLine: 999 });
  assert.equal(details.suggestion.startLine, 20);
  assert.equal(details.suggestion.endLine, details.available.endLine);

  const clamped = await slice({
    file: fixture("navigation.ts"),
    selector: { type: "range", startLine: 20, endLine: 999, clamp: true },
  });
  assert.equal(clamped.ok, true);
  if (!clamped.ok) return;
  const result = clamped.result as { range: { startLine: number; endLine: number }; code: string };
  assert.equal(result.range.startLine, 20);
  assert.equal(result.range.endLine, details.available.endLine);
  assert.ok(clamped.warnings.some((warning) => warning.code === "RANGE_CLAMPED"));
  assert.match(result.code, /return "other";/);
});

test("range rejects simultaneous expand and smallest modes", async () => {
  const envelope = await slice({
    file: fixture("navigation.ts"),
    selector: { type: "range", startLine: 6, endLine: 9, expand: true, smallest: true },
  });
  assert.equal(envelope.ok, false);
  if (envelope.ok) return;
  assert.equal(envelope.error.code, "INVALID_ARGUMENT");
});

test("qualified member lookup still fails closed when the owner has ambiguous matching members", async () => {
  const envelope = await slice({
    file: fixture("ambiguous-member.ts"),
    selector: { type: "symbol", name: "OwnerOAuthProvider.commit" },
  });
  assert.equal(envelope.ok, false);
  if (envelope.ok) return;
  assert.equal(envelope.error.code, "SYMBOL_AMBIGUOUS");
  assert.equal(envelope.error.recoverable, true);
  assert.equal(envelope.error.candidates?.length, 2);
});

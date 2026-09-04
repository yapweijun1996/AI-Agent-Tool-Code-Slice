import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outline, slice, capabilities } from "../../src/core/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "..", "fixtures", "javascript");
function fixture(name: string): string {
  return path.join(fixturesDir, name);
}

test("capabilities lists all four V0.1 language families", async () => {
  const envelope = await capabilities();
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { languages: Array<{ id: string }> };
  const ids = result.languages.map((l) => l.id).sort();
  assert.deepEqual(ids, ["cfml", "javascript", "python", "tsx", "typescript"]);
});

test("outline finds every top-level symbol in basic.js", async () => {
  const envelope = await outline({ file: fixture("basic.js") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { symbols: Array<{ kind: string; name: string | null }> };
  const named = result.symbols.filter((s) => s.name !== null).map((s) => `${s.kind}:${s.name}`);
  assert.deepEqual(named.sort(), [
    "class:Invoice",
    "class:Receipt",
    "function:calculateTotal",
    "function:formatPrice",
    "method:constructor",
    "method:save",
    "method:save",
  ]);
});

test("symbol slice includes the export keyword in the range (export widening)", async () => {
  const envelope = await slice({
    file: fixture("basic.js"),
    selector: { type: "symbol", name: "calculateTotal" },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; nativeKind: string; code: string };
  assert.equal(result.kind, "function");
  assert.equal(result.nativeKind, "function_declaration");
  assert.match(result.code, /^export function calculateTotal/);
  assert.match(result.code, /return qty \* price;/);
});

test("arrow function export is reported as kind function, not variable", async () => {
  const envelope = await slice({
    file: fixture("basic.js"),
    selector: { type: "symbol", name: "formatPrice" },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; code: string };
  assert.equal(result.kind, "function");
  assert.match(result.code, /^export const formatPrice = \(price\) =>/);
});

test("ambiguous symbol name fails closed with bounded candidates", async () => {
  const envelope = await slice({
    file: fixture("basic.js"),
    selector: { type: "symbol", name: "save" },
  });
  assert.equal(envelope.ok, false);
  if (envelope.ok) return;
  assert.equal(envelope.error.code, "SYMBOL_AMBIGUOUS");
  assert.equal(envelope.error.recoverable, true);
  assert.equal(envelope.error.candidates?.length, 2);
});

test("occurrence disambiguates deterministically instead of guessing", async () => {
  const envelope = await slice({
    file: fixture("basic.js"),
    selector: { type: "symbol", name: "save", occurrence: 2 },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { range: { startLine: number } };
  // second "save" belongs to class Receipt, later in the file than Invoice's.
  assert.equal(result.range.startLine, 22);
});

test("unknown symbol name fails closed with SYMBOL_NOT_FOUND", async () => {
  const envelope = await slice({
    file: fixture("basic.js"),
    selector: { type: "symbol", name: "doesNotExist" },
  });
  assert.equal(envelope.ok, false);
  if (envelope.ok) return;
  assert.equal(envelope.error.code, "SYMBOL_NOT_FOUND");
});

test("line selector resolves to the smallest enclosing container", async () => {
  // line 4 is `return qty * price;`, inside calculateTotal (lines 3-5).
  const envelope = await slice({ file: fixture("basic.js"), selector: { type: "line", line: 4 } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; name: string | null };
  assert.equal(result.kind, "function");
  assert.equal(result.name, "calculateTotal");
});

test("line selector out of file bounds fails closed", async () => {
  const envelope = await slice({ file: fixture("basic.js"), selector: { type: "line", line: 9999 } });
  assert.equal(envelope.ok, false);
  if (envelope.ok) return;
  assert.equal(envelope.error.code, "LINE_OUT_OF_RANGE");
});

test("range without --expand returns the exact requested text, not a container", async () => {
  const envelope = await slice({
    file: fixture("basic.js"),
    selector: { type: "range", startLine: 3, endLine: 4, expand: false },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; code: string };
  assert.equal(result.kind, "block");
  assert.equal(result.code, "export function calculateTotal(qty, price) {\n  return qty * price;");
});

test("range with --expand returns the minimal enclosing container", async () => {
  const envelope = await slice({
    file: fixture("basic.js"),
    selector: { type: "range", startLine: 4, endLine: 4, expand: true },
  });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; name: string | null };
  assert.equal(result.kind, "function");
  assert.equal(result.name, "calculateTotal");
});

test("malformed source returns a warning and does not crash or invent symbols", async () => {
  const envelope = await outline({ file: fixture("malformed.js") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  assert.ok(envelope.warnings.some((w) => w.code === "PARSE_ERROR_RECOVERED"));
  const result = envelope.result as { symbols: Array<{ name: string | null }> };
  // the well-formed function before the syntax error must still be found;
  // nothing is invented to paper over the truncated one after it.
  assert.ok(result.symbols.some((s) => s.name === "wellFormed"));
  assert.ok(!result.symbols.some((s) => s.name === "truncated"));
});

test("syntax-shaped text inside comments, strings, and template literals is never mistaken for a real symbol", async () => {
  const envelope = await outline({ file: fixture("fake-syntax.js") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { symbols: Array<{ name: string | null }> };
  const names = result.symbols.map((s) => s.name);
  // sqlLike and s are real variable symbols (their *values* happen to be
  // strings that look like syntax) — only the fake symbols "inside" those
  // string/template values must be absent.
  assert.deepEqual(
    names.filter((n) => n !== null).sort(),
    ["realFunction", "s", "sqlLike"],
  );
  assert.ok(!names.includes("commentedOutFunction"));
  assert.ok(!names.includes("CommentedClass"));
  assert.ok(!names.includes("stringFunction"));
  assert.ok(!names.includes("StringClass"));
  assert.ok(!names.includes("fakeInTemplate"));
});

test("byte offsets account for multi-byte characters (UTF-16 vs UTF-8 divergence)", async () => {
  const filePath = fixture("emoji.js");
  const buffer = readFileSync(filePath);
  const expectedStartByte = buffer.indexOf(Buffer.from("function afterEmoji"));
  assert.ok(expectedStartByte > 0);

  const envelope = await slice({ file: filePath, selector: { type: "symbol", name: "afterEmoji" } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { range: { startByte: number }; code: string };
  assert.equal(result.range.startByte, expectedStartByte);
  assert.match(result.code, /^function afterEmoji/);
});

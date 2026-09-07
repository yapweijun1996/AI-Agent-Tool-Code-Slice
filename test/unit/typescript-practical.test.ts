import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outline, slice } from "../../src/core/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "..", "fixtures", "typescript", "practical-symbols.ts");

function successResult(envelope: Awaited<ReturnType<typeof slice>>) {
  if (!envelope.ok) assert.fail(`expected success, got ${envelope.error.code}: ${envelope.error.message}`);
  return envelope.result as {
    kind: string;
    name: string | null;
    nativeKind: string;
    signature?: string | null;
    parent?: { kind: string; name: string | null } | null;
    code: string;
  };
}

test("TypeScript practical coverage exposes enum, namespace/module, callable class fields, and object callables", async () => {
  const envelope = await outline({ file: fixture });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as {
    symbols: Array<{ kind: string; name: string | null; nativeKind: string; parent?: { name: string | null } | null }>;
  };
  const key = result.symbols.map((symbol) => `${symbol.parent?.name ?? "<root>"}|${symbol.kind}|${symbol.name}`);

  for (const expected of [
    "<root>|enum|Status",
    "<root>|module|OAuth",
    "OAuth|function|normalize",
    "OAuth|function|parse",
    "<root>|module|Legacy",
    "Legacy|function|ping",
    "<root>|class|OwnerOAuthProvider",
    "OwnerOAuthProvider|method|commit",
    "OwnerOAuthProvider|method|fallback",
    "<root>|variable|handlers",
    "handlers|function|commit",
    "handlers|function|fallback",
    "handlers|method|shorthand",
  ]) {
    assert.ok(key.includes(expected), `missing ${expected}`);
  }
  assert.equal(key.includes("OwnerOAuthProvider|property|label"), false, "ordinary class data fields should not add outline noise");
  assert.equal(key.includes("handlers|property|label"), false, "ordinary object data properties should not add outline noise");
  assert.equal(key.some((entry) => entry.includes("localHandlers")), false, "callable-local object declarations should stay hidden by default");

  const withLocals = await outline({ file: fixture, includeLocals: true });
  assert.equal(withLocals.ok, true);
  if (!withLocals.ok) return;
  const localSymbols = (withLocals.result as { symbols: Array<{ name: string | null; parent?: { name: string | null } | null }> }).symbols;
  assert.ok(localSymbols.some((symbol) => symbol.name === "localHandlers"));
  assert.ok(localSymbols.some((symbol) => symbol.name === "commit" && symbol.parent?.name === "localHandlers"));
  assert.ok(localSymbols.some((symbol) => symbol.name === "shorthand" && symbol.parent?.name === "localHandlers"));
});

test("TypeScript enum and namespace/module symbols are directly sliceable", async () => {
  const enumResult = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "Status", kind: "enum" } }));
  assert.equal(enumResult.kind, "enum");
  assert.equal(enumResult.nativeKind, "enum_declaration");
  assert.match(enumResult.code, /^export enum Status/);

  const namespace = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "OAuth", kind: "module" } }));
  assert.equal(namespace.nativeKind, "internal_module");
  assert.match(namespace.code, /^export namespace OAuth/);

  const legacy = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "Legacy", kind: "module" } }));
  assert.equal(legacy.nativeKind, "module");
  assert.match(legacy.code, /^export module Legacy/);
});

test("qualified lookup selects class-field arrows/functions and namespace members", async () => {
  const commit = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "OwnerOAuthProvider.commit" } }));
  assert.equal(commit.kind, "method");
  assert.equal(commit.nativeKind, "public_field_definition");
  assert.equal(commit.parent?.name, "OwnerOAuthProvider");
  assert.equal(commit.signature, "commit(value: string)");
  assert.match(commit.code, /^commit = \(value: string\)/);

  const fallback = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "OwnerOAuthProvider.fallback" } }));
  assert.equal(fallback.kind, "method");
  assert.equal(fallback.signature, "fallback(value: string)");
  assert.match(fallback.code, /^fallback = function/);

  const normalize = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "OAuth.normalize" } }));
  assert.equal(normalize.kind, "function");
  assert.equal(normalize.parent?.name, "OAuth");
});

test("qualified lookup selects object arrow/function values while bare names stay fail-closed", async () => {
  const commit = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "handlers.commit" } }));
  assert.equal(commit.kind, "function");
  assert.equal(commit.nativeKind, "pair");
  assert.equal(commit.parent?.name, "handlers");
  assert.equal(commit.signature, "commit(value: string)");
  assert.match(commit.code, /^commit: \(value: string\)/);

  const fallback = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "handlers.fallback" } }));
  assert.equal(fallback.kind, "function");
  assert.match(fallback.code, /^fallback: function/);

  const shorthand = successResult(await slice({ file: fixture, selector: { type: "symbol", name: "handlers.shorthand" } }));
  assert.equal(shorthand.kind, "method");
  assert.equal(shorthand.parent?.name, "handlers");

  const ambiguous = await slice({ file: fixture, selector: { type: "symbol", name: "commit" } });
  assert.equal(ambiguous.ok, false);
  if (ambiguous.ok) return;
  assert.equal(ambiguous.error.code, "SYMBOL_AMBIGUOUS");
  assert.equal(ambiguous.error.recoverable, true);
  assert.equal(ambiguous.error.candidates?.length, 3);
});

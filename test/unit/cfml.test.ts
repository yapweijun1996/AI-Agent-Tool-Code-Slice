import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outline, slice } from "../../src/core/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
function fixture(name: string): string {
  return path.join(here, "..", "fixtures", "cfml", name);
}

test("CFML outline resolves component/function nesting despite the grammar's flat open/close tags", async () => {
  const envelope = await outline({ file: fixture("Invoice.cfc") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as {
    symbols: Array<{ kind: string; name: string | null; parent?: { kind: string; name: string | null } | null }>;
  };

  const component = result.symbols.find((s) => s.kind === "class");
  assert.ok(component, "component should be synthesized from paired open/close tags");
  assert.equal(component!.parent, null);

  const getInvoice = result.symbols.find((s) => s.name === "getInvoice");
  assert.equal(getInvoice?.kind, "method");
  assert.equal(getInvoice?.parent?.kind, "class");

  // save() and runDynamicQuery() are also direct component methods.
  assert.equal(result.symbols.find((s) => s.name === "save")?.kind, "method");
  assert.equal(result.symbols.find((s) => s.name === "runDynamicQuery")?.kind, "method");
});

test("cfquery is a query symbol tagged with embeddedLanguage cfquery and nests under its cffunction", async () => {
  const envelope = await slice({ file: fixture("Invoice.cfc"), selector: { type: "symbol", name: "qInvoice" } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as {
    kind: string;
    embeddedLanguage?: string;
    parent?: { kind: string; name: string | null } | null;
    code: string;
  };
  assert.equal(result.kind, "query");
  assert.equal(result.embeddedLanguage, "cfquery");
  assert.equal(result.parent?.name, "getInvoice");
  assert.match(result.code, /<cfquery name="qInvoice"/);
  assert.match(result.code, /SELECT id, total FROM invoices/);
});

test("a function declared inside a <cfscript> block is re-parsed with the cfscript grammar and offset back into host coordinates", async () => {
  const envelope = await slice({ file: fixture("Invoice.cfc"), selector: { type: "symbol", name: "calculateTotal" } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { kind: string; embeddedLanguage?: string; signature: string | null; code: string };
  assert.equal(result.kind, "function");
  assert.equal(result.embeddedLanguage, "cfscript");
  assert.equal(result.signature, "calculateTotal(qty, price)");
  assert.match(result.code, /^function calculateTotal\(qty, price\) \{/);
  assert.match(result.code, /return qty \* price;/);
});

test("a dynamic (hash-expression) cfquery name is reported as null with a DYNAMIC_NAME warning, never guessed", async () => {
  const envelope = await outline({ file: fixture("Invoice.cfc") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as {
    symbols: Array<{ kind: string; name: string | null; dynamicName?: boolean; warnings?: Array<{ code: string }> }>;
  };
  const dynamicQuery = result.symbols.find((s) => s.kind === "query" && s.name === null);
  assert.ok(dynamicQuery, "dynamically-named query should still appear in the IR");
  assert.equal(dynamicQuery!.dynamicName, true);
  assert.equal(dynamicQuery!.warnings?.[0]?.code, "DYNAMIC_NAME");
});

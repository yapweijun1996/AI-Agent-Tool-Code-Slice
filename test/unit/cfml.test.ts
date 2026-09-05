import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outline, slice } from "../../src/core/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
function fixture(name: string): string {
  return path.join(here, "..", "fixtures", "cfml", name);
}

interface OutlineSymbol {
  kind: string;
  nativeKind: string;
  name: string | null;
  embeddedLanguage?: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    startByte: number;
    endByte: number;
  };
  warnings?: Array<{ code: string }>;
  parent?: { kind: string; name: string | null } | null;
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

test("CFML <script> is re-parsed as JavaScript with exact host coordinates", async () => {
  const envelope = await slice({ file: fixture("Embedded.cfm"), selector: { type: "symbol", name: "renderInvoice" } });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as {
    kind: string;
    nativeKind: string;
    embeddedLanguage?: string;
    range: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
      startByte: number;
      endByte: number;
    };
    signature: string | null;
    code: string;
  };
  assert.equal(result.kind, "function");
  assert.equal(result.nativeKind, "function_declaration");
  assert.equal(result.embeddedLanguage, "javascript");
  assert.equal(result.signature, "renderInvoice(id)");
  assert.equal(result.range.startLine, 3);
  assert.equal(result.range.startColumn, 3);
  assert.equal(result.range.endLine, 5);
  assert.equal(result.range.endColumn, 4);
  assert.equal(result.range.startByte, 41);
  assert.equal(result.range.endByte, 91);
  assert.equal(result.code, "function renderInvoice(id) {\n\t\t\treturn id + 1;\n\t\t}");
});

test("CFML <style> is re-parsed as CSS and exposes selector/property symbols", async () => {
  const envelope = await outline({ file: fixture("Embedded.cfm") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { symbols: OutlineSymbol[] };

  const selector = result.symbols.find((symbol) => symbol.name === ".invoice-card");
  assert.ok(selector);
  assert.equal(selector!.kind, "block");
  assert.equal(selector!.nativeKind, "rule_set");
  assert.equal(selector!.embeddedLanguage, "css");
  assert.equal(selector!.range.startLine, 10);
  assert.equal(selector!.range.startColumn, 3);
  assert.equal(selector!.range.endLine, 12);
  assert.equal(selector!.range.endColumn, 4);
  assert.equal(selector!.range.startByte, 149);
  assert.equal(selector!.range.endByte, 184);

  const property = result.symbols.find((symbol) => symbol.name === "color");
  assert.ok(property);
  assert.equal(property!.kind, "property");
  assert.equal(property!.embeddedLanguage, "css");
  assert.equal(property!.parent?.name, ".invoice-card");
});

test("cfquery content is deep-parsed into SQL clauses and function symbols", async () => {
  const envelope = await outline({ file: fixture("Embedded.cfm") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { symbols: OutlineSymbol[] };

  const clauses = result.symbols
    .filter((symbol) => symbol.embeddedLanguage === "cfquery" && symbol.nativeKind === "query_clause")
    .map((symbol) => `${symbol.name}:${symbol.range.startLine}-${symbol.range.endLine}`);
  assert.deepEqual(clauses, ["SELECT:22-22", "FROM:23-23", "WHERE:24-24", "ORDER BY:25-25"]);

  const coalesce = result.symbols.find((symbol) => symbol.name === "COALESCE");
  assert.ok(coalesce);
  assert.equal(coalesce!.kind, "function");
  assert.equal(coalesce!.nativeKind, "query_function");
  assert.equal(coalesce!.embeddedLanguage, "cfquery");
  assert.equal(coalesce!.range.startByte, 332);
  assert.equal(coalesce!.range.endByte, 350);
  assert.equal(coalesce!.parent?.name, "SELECT");

  const envelopeForClause = await slice({ file: fixture("Embedded.cfm"), selector: { type: "symbol", name: "WHERE" } });
  assert.equal(envelopeForClause.ok, true);
  if (!envelopeForClause.ok) return;
  const clauseResult = envelopeForClause.result as { embeddedLanguage?: string; code: string };
  assert.equal(clauseResult.embeddedLanguage, "cfquery");
  assert.equal(
    clauseResult.code,
    'WHERE id = <cfqueryparam value="#arguments.invoiceId#" cfsqltype="cf_sql_integer">',
  );
});

test("explicit non-JavaScript and non-CSS region types are skipped instead of guessed", async () => {
  const envelope = await outline({ file: fixture("Embedded-unsupported.cfm") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { symbols: OutlineSymbol[] };
  assert.ok(!result.symbols.some((symbol) => symbol.name === "notJavascript"));
  assert.ok(!result.symbols.some((symbol) => symbol.name === "dynamicTypeScript"));
  assert.ok(!result.symbols.some((symbol) => symbol.name === "notVbscript"));
  assert.ok(!result.symbols.some((symbol) => symbol.name === ".notCss"));
  assert.ok(!result.symbols.some((symbol) => symbol.name === ".dynamicTypeStyle"));
});

test("recoverable JavaScript errors in a CFML <script> region remain visible as warnings", async () => {
  const envelope = await outline({ file: fixture("Embedded-malformed.cfm") });
  assert.equal(envelope.ok, true);
  if (!envelope.ok) return;
  const result = envelope.result as { symbols: OutlineSymbol[] };
  const validFunction = result.symbols.find((symbol) => symbol.name === "validBeforeError");
  assert.ok(validFunction, "symbols before an embedded parse error should remain available");
  assert.ok(validFunction!.warnings?.some((warning) => warning.code === "EMBEDDED_PARSE_ERROR"));
});

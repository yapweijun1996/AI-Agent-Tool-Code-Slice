# Language Adapter Contract

Status: Implemented for the current adapter registry; hardening commit
`1712f17` passed cross-platform CI run
[33972164494](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33972164494).

## Purpose

Language adapters translate Tree-sitter-specific syntax into Agent Code Slice's stable normalized model.

Core must remain language-agnostic.

## Conceptual interface

```ts
interface LanguageAdapter {
  readonly id: string;
  readonly extensions: string[];
  readonly grammarId: string;
  readonly embeddedLanguages?: readonly string[];
  extractSymbols(ctx: AdapterContext): CodeSymbol[] | Promise<CodeSymbol[]>;
}
```

The current `AdapterContext` includes the scoped Tree-sitter tree, source
coordinates, the parser engine for embedded regions, and a shared symbol
budget. Resolution and envelope assembly remain Core responsibilities; the
adapter owns language-specific extraction and normalization.

## Adapter owns

- extension detection;
- grammar identity;
- Tree-sitter queries;
- raw node → normalized kind mapping;
- symbol-name extraction;
- signature extraction when reliable;
- container priority;
- injected-language regions;
- language-specific ambiguity.

## Adapter does not own

- CLI formatting;
- delivery transport, including any future serverless wrapper;
- agent integration;
- filesystem authorization;
- global JSON envelope;
- package telemetry;
- source-code editing.

## Symbol normalization

Example mapping:

```text
JavaScript function_declaration -> function
Python function_definition      -> function
CFML cffunction                 -> function
CFQuery named cfquery           -> query
```

Raw grammar node names can be exposed as `nativeKind` for diagnostics but must not replace the normalized kind.

## Dynamic names

If a name cannot be statically resolved:

```json
{
  "name": null,
  "dynamicName": true
}
```

Do not invent the evaluated name.

## Ambiguity

Multiple supported matches must return candidates.

Do not rely on source order as a hidden tiebreaker.

## Line resolution

Adapters expose normalized symbol boundaries; Core performs the generic line
and range containment decision.

Example TypeScript:

```text
method
function
class
module
block
```

For `line` and expanded `range`, Core removes leading/trailing whitespace
and blank boundary lines from the selection only while resolving containment.
The minimal supported container containing that meaningful byte span should
win. The unexpanded range still returns the exact requested line span.

## Malformed source

Tree-sitter can often produce a partial tree for malformed source.

Adapter rules:

- preserve parser diagnostics;
- return a slice only when the boundary is structurally supported;
- attach warnings when the tree contains relevant error nodes;
- never hide parse uncertainty.

## Mixed-language

An adapter may declare injection regions.

Public result should include:

```json
{
  "language": "cfml",
  "embeddedLanguage": "cfquery"
}
```

or equivalent host/embedded fields.

For the current CFML adapter, deep CFQuery extraction exposes structurally
recognized SQL clauses as `block` symbols and query calls as `function` symbols.
It intentionally does not infer whether every flat SQL identifier is a table or
column, because the CFQuery grammar does not provide that role as a stable
syntax node.

## Adding a language

Required evidence:

1. grammar load test;
2. detection fixtures;
3. outline fixtures;
4. symbol fixtures;
5. line-container fixtures;
6. ambiguity fixtures;
7. malformed-source fixtures;
8. JSON schema validation;
9. benchmark sample.

A grammar being available is not sufficient for "Supported" status.

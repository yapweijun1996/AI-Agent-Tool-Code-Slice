# Language Adapter Contract

Status: Planned V0.1.

## Purpose

Language adapters translate Tree-sitter-specific syntax into Agent Code Slice's stable normalized model.

Core must remain language-agnostic.

## Conceptual interface

```ts
interface LanguageAdapter {
  id: string;
  displayName: string;
  extensions: string[];
  grammar: GrammarDescriptor;
  embeddedLanguages?: string[];

  detect(input: DetectInput): DetectionResult;
  outline(ctx: ParseContext): Promise<CodeSymbol[]>;
  resolveSymbol(ctx: ParseContext, selector: SymbolSelector): Promise<Resolution>;
  resolveLine(ctx: ParseContext, line: number): Promise<Resolution>;
  resolveRange(ctx: ParseContext, range: LineRange): Promise<Resolution>;

  capabilities(): LanguageCapabilities;
}
```

The exact TypeScript names may change before implementation, but the responsibilities should not.

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

Each adapter defines an ordered set of supported containers.

Example TypeScript:

```text
method
function
class
module
block
```

The minimal meaningful supported container containing the line should win.

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

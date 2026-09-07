# Architecture

## Design summary

Agent Code Slice separates:

1. parser engine;
2. language knowledge;
3. normalized intermediate representation;
4. slice operations;
5. delivery adapters.

```text
                     User / AI Agent
                           |
              +------------+------------+
              |                         |
             CLI              Serverless adapter (future)
              |                         |
              +------------+------------+
                           |
                      Public Core API
                           |
               +-----------+-----------+
               |                       |
         Language Registry        Slice Engine
               |                       |
       +-------+-------+               |
       |       |       |               |
      JS      Python   CFML            |
       |       |       |               |
       +-------+-------+---------------+
                           |
                     Parser Engine
                           |
                  web-tree-sitter
                           |
                    WASM grammars
```

## Layer 1 — Parser engine

Current default:

- `web-tree-sitter`;
- pinned WASM grammars;
- grammar integrity metadata;
- no project code execution.

The engine returns syntax trees; it does not decide product-level symbol kinds.

Interface concept:

```ts
interface ParserEngine {
  loadLanguage(grammarId: string): Promise<LoadedLanguage>;
  withParse<T>(
    source: string,
    language: LoadedLanguage,
    visitor: (result: ParseResult) => Promise<T> | T,
  ): Promise<T>;
}
```

`withParse` deliberately scopes the native Tree-sitter `Tree` to the visitor.
The engine releases the tree and parser after the visitor settles, including
when extraction throws. Future native engines must implement the same scoped
contract and produce the same normalized IR.

## Layer 2 — Language adapters

Each adapter owns language-specific knowledge:

- extensions;
- grammar descriptor;
- symbol queries;
- normalized kind mapping;
- naming rules;
- supported containers;
- injection handling;
- ambiguity behavior.

Core must not contain a growing language `if/else` chain.

## Layer 3 — Normalized IR

All languages map into a stable internal shape:

```ts
interface CodeSymbol {
  kind: SymbolKind;
  name: string | null;
  language: string;
  embeddedLanguage?: string;
  range: SourceRange;
  parent?: SymbolRef | null;
  signature?: string | null;
  dynamicName?: boolean;
  warnings?: Diagnostic[];
}
```

Normalized kinds are deliberately small:

- `function`
- `method`
- `class`
- `interface`
- `type`
- `module`
- `query`
- `block`
- `variable`
- `property`
- `import`
- `export`
- `unknown`

Language adapters may expose a native kind separately, but the public contract should not depend on raw Tree-sitter node names.

## Layer 4 — Slice engine

Operations:

```ts
capabilities()
outline()
slice({ selector })
```

Selectors:

```ts
type Selector =
  | { type: "symbol"; name: string; kind?: string; occurrence?: number }
  | { type: "line"; line: number }
  | {
      type: "range";
      startLine: number;
      endLine: number;
      expand?: boolean;
      smallest?: boolean;
      clamp?: boolean;
    };
```

`occurrence` should not be used to hide ambiguity by default. It is an explicit disambiguator.
Qualified `Owner.member` lookup remains normalized-IR selection: it filters a
member by its immediate normalized parent name and still fails closed on
ambiguity.

`range.expand` selects the smallest supported normalized symbol/container.
`range.smallest` is deliberately different: while the parser tree is still
request-scoped, Core walks only the containment path and returns the smallest
named syntax node as normalized `kind: "block"`. Its `nativeKind` is
informational parser evidence, not a stable cross-grammar semantic kind;
consumers should use `kind`, `range`, and `code` as the stable contract. This
mode has no language-specific branch in Core and does not change adapter symbol
extraction.

## Layer 5 — Delivery adapters

### CLI

Primary lowest-common compatibility layer.

### JS API

Direct integration for runtimes such as AGRUN.

### Serverless adapter (future)

Optional stateless function wrapper. It must call Core, use the same JSON
contract, and define explicit source-input, authentication, privacy, size,
timeout, and logging behavior. It is not a resident server and does not use
MCP/stdio.

### Agent-specific packs

Skills, extensions, custom tool wrappers, instructions. No duplicated parser logic.

## File loading boundary

A slicing request should identify:

- requested file;
- optional allowed root/workspace;
- encoding policy;
- maximum file size.

Security requirements belong to the loader boundary, not the grammar.

## Resource and output budgets

Core validates runtime requests before parsing. The default file budget is
5,000,000 bytes and callers may lower it but may not raise it above the
10,000,000-byte hard ceiling. Outline extraction has a bounded symbol budget;
the default returned outline limit is 10,000 symbols and the extraction safety
ceiling is 50,000 symbols. Core envelopes are checked against the default
8 MiB serialized-output limit, which callers may lower to a minimum of 256
bytes but may not raise. Slice callers may also set `maxLines` to fail closed
when the resolved code unit is larger than the requested context budget; Core
never truncates the syntax unit to satisfy that budget. The serialized-output
limit covers both success and error envelopes.

Limits fail closed with `INVALID_ARGUMENT` for malformed values and
`OUTPUT_LIMIT_EXCEEDED` when a valid operation or its error envelope cannot
fit the requested output budget. The finalizer returns a compact schema-valid
limit error and never silently truncates result or diagnostic fields.

## Mixed-language model

Mixed-language files should be represented as nested language regions rather than flattened guesses.

Example:

```text
invoice.cfm (CFML)
  |
  +-- cfquery qEmbedded (CFQuery / SQL region)
  |     +-- SELECT (SQL clause block)
  |     +-- COALESCE (SQL function)
  |
  +-- script renderInvoice (JavaScript region)
  |
  +-- style .invoice-card (CSS region)
  |
  +-- cfscript calculateTotal (CFScript region)
```

The output keeps both host and embedded language.

## Caching

Allowed future caches:

- loaded WASM grammars;
- normalized symbol inventory.

The current engine caches loaded grammars for the process lifetime and
coalesces concurrent first loads for the same grammar. Parsed trees are
request-scoped and are not cached. Do not persist source-code caches by default
without an explicit privacy decision.

## Network

Normal V0.x slice operations must not require network access.

Package install may of course use npm; runtime parsing should not.

## Observability

Safe diagnostics may include:

- language id;
- parser version;
- grammar version/hash;
- parse duration;
- file size;
- result count;
- warning codes.

Do not log source content by default.

## Replaceability

The architecture intentionally permits:

```text
WasmEngine (default)
NativeEngine (future)
```

Both must produce equivalent normalized IR for the same frozen fixture before a backend is considered compatible.

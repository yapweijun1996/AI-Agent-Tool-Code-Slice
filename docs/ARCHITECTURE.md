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

Planned default:

- `web-tree-sitter`;
- pinned WASM grammars;
- grammar integrity metadata;
- no project code execution.

The engine returns syntax trees; it does not decide product-level symbol kinds.

Interface concept:

```ts
interface ParserEngine {
  loadLanguage(grammar: GrammarDescriptor): Promise<LoadedLanguage>;
  parse(source: string, language: LoadedLanguage): Promise<ParseResult>;
}
```

Future native engines must implement the same contract.

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
  | { type: "range"; startLine: number; endLine: number; expand?: boolean };
```

`occurrence` should not be used to hide ambiguity by default. It is an explicit disambiguator.

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
- parsed syntax tree for unchanged `(path, content hash)` during one process;
- normalized symbol inventory.

Do not persist source-code caches by default without an explicit privacy decision.

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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This repository currently contains **only a documentation/specification pack** for a product called
**Agent Code Slice**. There is no `package.json`, no `src/`, no build tooling, and no test runner yet —
implementation has not started (Phase 0 of `docs/IMPLEMENTATION_PLAN.md` is not done). Do not invent or
assume build/lint/test commands; none exist. If asked to bootstrap the project, follow
`docs/IMPLEMENTATION_PLAN.md` Phase 0 (package skeleton, TS/JS build choice, test runner, lint/format
policy, CI matrix) rather than improvising a structure.

Existing top-level content:

- `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `SECURITY.md`, `CHANGELOG.md` — project docs.
- `docs/` — the full contract/spec set (see Documentation map below).
- `schemas/code-slice-result-v1.schema.json` — the planned JSON output schema.
- `examples/*.json` — example success/error/CFML output envelopes.
- `DOCUMENTATION_INDEX.md` / `MANIFEST.json` — index and file manifest for this doc pack.

## What the product is

Agent Code Slice is a **local-first, read-only** developer tool that extracts the exact syntactic code
unit (a function, method, class, query, or line/range container) an AI coding agent needs, instead of
making the agent read an entire source file. It is explicitly **not** a code search engine, repo indexer,
RAG system, formatter, linter, or autonomous coding agent — see "Non-goals V0.1" in
`docs/PRODUCT_SPEC.md`.

Planned pipeline (see README):

```
Large source file → language detection → Tree-sitter WASM parser → language adapter
  → normalized symbol IR → exact code slice → AI coding agent
```

## Architecture (docs/ARCHITECTURE.md)

Five layers, each with a hard boundary — **read this file before touching engine/adapter code**:

1. **Parser engine** — `web-tree-sitter` with pinned WASM grammars. Returns syntax trees only; does not
   decide product-level symbol kinds. A future native engine must implement the same `ParserEngine`
   interface and produce equivalent normalized IR.
2. **Language adapters** (`src/languages/` when it exists) — own everything language-specific: file
   extension detection, grammar descriptor, symbol queries, normalized-kind mapping, naming rules,
   container resolution, injection handling, ambiguity behavior.
3. **Normalized IR** — all languages map into one stable `CodeSymbol` shape with a deliberately small,
   fixed set of `SymbolKind` values (`function`, `method`, `class`, `interface`, `type`, `module`,
   `query`, `block`, `variable`, `property`, `import`, `export`, `unknown`). The public contract never
   depends on raw Tree-sitter node names.
4. **Slice engine** — three operations: `capabilities()`, `outline()`, `slice({ selector })`, where
   selector is `symbol` (by name, with optional `kind`/`occurrence` disambiguator), `line`, or `range`
   (with optional `expand`). `occurrence` is an explicit disambiguator only — never used to silently hide
   ambiguity.
5. **Delivery adapters** — CLI (lowest-common layer), JS API, optional local stdio MCP, and
   agent-specific packs (Skills/Extensions/custom tools). **All of these must call the same Core API and
   must never duplicate parsing logic.**

The expected module layout (from `AGENTS.md`, not yet created):

```
src/core/  src/engine/  src/languages/  src/schema/  src/cli/  src/mcp/  integrations/  grammars/  test/
```

### Rules that apply to any future implementation

These come from `AGENTS.md` and are the actual constraints on this project, not generic advice:

- **No language conditionals in Core.** Never write `if (language === "python")` in core code — that
  behavior belongs in a registered adapter. Core must not grow a language `if/else` chain.
- **Never guess.** Ambiguous symbol/language/boundary resolution must fail closed and return explicit
  candidates (`SYMBOL_AMBIGUOUS`, `LANGUAGE_AMBIGUOUS`), never a silent first match.
- **Read-only, local-only, no required network/LLM/account/API key** for the core in V0.x. Do not modify
  source files, execute project code, run arbitrary user commands as part of slicing, or read outside the
  requested file/workspace boundary.
- **stdout is machine-clean.** When `--json` is active, stdout is exactly one JSON document; all
  diagnostics/banners/progress go to stderr.
- **CFML is a first-class adapter, not the product boundary.** It's a differentiator (one `.cfm` file can
  embed CFScript and CFQuery/SQL as nested language regions) but must never become a CFML-specific
  special case in Core.
- Scope is fixed at: capabilities, outline, symbol slice, line slice, range slice with expansion. Do not
  add RAG, embeddings, repo-wide indexing, call graphs, automatic edits, codegen, formatting, test
  execution, or autonomous planning to V0.1 — these are explicit non-goals (`docs/PRODUCT_SPEC.md`).

## Contracts (must stay in sync; changes need explicit review — see CONTRIBUTING.md)

- **CLI** — `docs/CLI_CONTRACT.md`. Commands: `capabilities`, `outline`, `symbol`, `line`, `range`.
  Working package name `agent-code-slice`, executable `code-slice`. Exit codes 0–8 map to coarse
  classes (arg error, file/root error, unsupported/ambiguous language, parse error, not found,
  ambiguous, output limit, internal failure); the JSON `error.code` is the primary machine semantic.
- **JSON schema** — `docs/JSON_SCHEMA.md` + `schemas/code-slice-result-v1.schema.json`. Versioned
  envelope (`schemaVersion`, `ok`, `operation`, `file`, `result`/`error`, `warnings`, `meta`). Lines and
  columns are 1-based; byte offsets are 0-based UTF-8. Stable error codes are enumerated in that file
  (`FILE_NOT_FOUND`, `SYMBOL_AMBIGUOUS`, `LANGUAGE_AMBIGUOUS`, etc.) — reuse them rather than inventing
  new ones.
- **Language adapter contract** — `docs/LANGUAGE_ADAPTER_CONTRACT.md`. A language isn't "supported" just
  because a grammar can parse a file; an adapter must define+test extension detection, grammar loading,
  symbol/kind mapping, naming rules, container resolution, line/range expansion, ambiguity behavior,
  malformed-source behavior, and golden fixtures.
- **MCP** — `docs/MCP_INTEGRATION.md`. Planned local stdio server exposing exactly three read-only tools:
  `code_slice_capabilities`, `code_slice_outline`, `code_slice_get`. Must call the same Core API as the
  CLI. Deferred to V0.2.

## Documentation map

Start with `docs/PRODUCT_SPEC.md` (goals/scope/non-goals), `docs/ARCHITECTURE.md`, and
`docs/IMPLEMENTATION_PLAN.md` (phased plan, current phase). Full index with every doc's purpose:
`DOCUMENTATION_INDEX.md`. Architecture decisions are recorded as ADRs in `docs/adr/` (WASM-first engine,
CLI-first multi-agent integration, read-only fail-closed V0). Planned languages and their status are in
`docs/LANGUAGE_SUPPORT_MATRIX.md` (V0.1: JavaScript, TypeScript/TSX, Python, CFML; V0.2+: Java, C#, Go,
Rust, PHP, C/C++, HTML/CSS).

## Status labels (use these precisely — see DOCUMENTATION_INDEX.md)

`Design` (agreed, no implementation) → `Planned` (targeted) → `Implemented` (code exists, not
release-verified) → `Verified` (acceptance evidence exists for a named environment/version). Also
`Experimental` for things outside the stable contract. **Never upgrade a status without stored evidence**
(per `AGENTS.md` "Public-claim discipline"), and never claim "supports all AI agents" — the approved
phrase is "Works with AI coding agents that can use shell commands, JavaScript, or MCP."

## Testing discipline (once implementation exists)

Per `AGENTS.md`: before claiming a feature complete, add/update frozen fixtures; test success, malformed,
no-match, and ambiguity cases; verify exact line/byte boundaries; verify JSON schema conformance; verify
stdout/stderr separation; run cross-platform package smoke where applicable; preserve the benchmark
baseline. A fluent explanation is not acceptance evidence — see `docs/TESTING_GOLDEN_EVAL.md`.

## Completion report format

When finishing engineering work in this repo, report (per `AGENTS.md`): files changed, contracts changed,
tests run and results, fixture/benchmark evidence, compatibility impact, remaining limitations, and
whether public docs need a status change.

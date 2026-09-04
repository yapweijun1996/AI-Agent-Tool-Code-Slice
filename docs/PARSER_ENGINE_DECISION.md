# Parser Engine Decision

Status: Design decision.

## Decision

Use `web-tree-sitter` with pinned Tree-sitter WASM grammars as the planned default V0.1 parser engine.

Treat:

- native Node Tree-sitter as a possible future performance backend;
- `ast-grep` as a complementary tool and benchmark competitor, not the core runtime.

## Evaluation criteria

- multi-language coverage;
- Node/npm install experience;
- Windows/macOS/Linux portability;
- CFML support;
- mixed-language support;
- control over exact ranges and AST;
- browser potential;
- performance;
- maintenance/supply-chain cost.

## Why WASM by default

The product workload is targeted at single-file or bounded small-batch slicing, not indexing a massive repository.

For that workload, install portability and deterministic grammar ownership are initially more important than maximum parser throughput.

Benefits:

- avoids making native compilation a normal install requirement;
- same parser model can potentially run in Node and browser environments;
- direct access to Tree-sitter nodes/queries;
- language adapters can remain independent from agent integrations.

## Risks

- WASM startup can be slower than native bindings;
- grammar artifacts must be kept compatible with the Tree-sitter runtime;
- package size grows as languages are added;
- mixed-language parsing requires careful injection/range handling.

These risks must be benchmarked, not assumed away.

## Native Tree-sitter

Possible future `NativeEngine`:

```text
ParserEngine
  |- WasmEngine   (default)
  `- NativeEngine (optional)
```

Requirements before adding:

- measurable need;
- install compatibility plan;
- exact IR parity tests;
- no change to CLI/JSON contract.

## ast-grep

Strengths:

- broad language support;
- fast Rust implementation;
- structural search/navigation;
- agent-oriented outline capability.

Why not core:

- Agent Code Slice needs direct control of exact syntactic-unit extraction and a stable language-neutral IR;
- CFML/custom-language and distribution requirements should not be hidden behind another CLI;
- becoming an `ast-grep` wrapper would weaken product differentiation.

Benchmark it instead.

## Grammar build policy

Before public release:

- pin grammar source revision/version;
- pin build toolchain;
- build or source WASM from a trusted reproducible path;
- record SHA-256;
- load-smoke every artifact;
- run golden parsing fixtures;
- fail the package/release gate on mismatch.

## Decision reversal trigger

Revisit only if measured V0.1 evidence shows WASM latency or memory makes normal agent usage impractical.

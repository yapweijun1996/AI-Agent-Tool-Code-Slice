# ADR 0001: Use web-tree-sitter + WASM as Default Parser

Status: Accepted for V0.1 design.

## Context

The package must be multi-language, npm-friendly, local-first, and portable. Native grammar bindings can add installation/Node-version complexity.

## Decision

Default to `web-tree-sitter` and pinned WASM grammars.

## Consequences

Positive:

- portable install target;
- future browser potential;
- direct Tree-sitter control;
- language adapters remain modular.

Negative:

- likely slower than native Node bindings;
- grammar artifact management;
- package-size growth.

## Guardrail

Benchmark before stable release. Add a native backend only behind the same `ParserEngine` contract if evidence requires it.

# V0.1 Implementation Plan

## Phase 0 — Repository bootstrap

Deliver:

- package skeleton;
- TypeScript/JavaScript build choice;
- test runner;
- lint/format policy;
- schema folder;
- fixture structure;
- CI matrix;
- license decision before first public reusable release.

Gate:

- clean install;
- empty build/test;
- package metadata validation.

## Phase 1 — Parser engine spike

Implement minimal `WasmEngine`.

Languages:

- JavaScript;
- TypeScript;
- Python;
- CFML grammar load spike.

Measure:

- cold/warm startup;
- 5/50/500 KB parse;
- cross-platform install.

Gate:

- architecture decision remains valid or ADR amended.

## Phase 2 — Normalized IR + adapter registry

Implement:

- source range type;
- code symbol type;
- diagnostics;
- language adapter registry;
- language detection;
- no Core language switch statement.

Gate:

- adapters can register independently;
- schema tests.

## Phase 3 — First two languages

Recommended first:

- JavaScript;
- TypeScript/TSX.

Implement:

- outline;
- symbol;
- line;
- ambiguity.

Gate:

- frozen fixtures green.

## Phase 4 — Python

Repeat certification contract.

Do not refactor Core for Python-specific behavior unless the abstraction is genuinely cross-language.

## Phase 5 — CFML family

Implement:

- CFML host;
- CFScript symbols;
- CFQuery named query plus SQL-level clause/function symbols;
- JavaScript `<script>` and CSS `<style>` embedded regions;
- dynamic query name diagnostics;
- mixed-language/injection evidence.

This phase is allowed to expose adapter shortcomings, but fixes should generalize through explicit adapter hooks rather than CFML conditionals in Core.

## Phase 6 — CLI

Commands:

- capabilities;
- outline;
- symbol;
- line;
- range.

Implement strict stdout/stderr rules and exit codes.

## Phase 7 — Stable JSON schema

Freeze V1 envelope and run every CLI fixture through schema validation.

## Phase 8 — Golden Eval + benchmark

Publish:

- fixture manifest;
- results;
- known limitations.

The declarative evaluator is implemented at `test/golden/` with frozen JSON
cases in `test/golden/cases/`; `npm run test:golden` executes the cases through
the public Core API and `npm test` includes a regression check for the runner.
The benchmark runner now covers all current host adapters and the 5 KB, 50 KB,
500 KB, and 1 MB cohorts, with cold CLI, warm API, engine-phase,
context-reduction, isolated per-target RSS, grammar-hash, and fixture-hash
evidence. The CI
workflow uploads the same report for each supported OS on Node 20. The
agent-facing contract E2E is implemented under `test/e2e/` and runs through
the built CLI and public JS API without model calls. Both remain separately
documented in `docs/PERFORMANCE_BENCHMARK_RESULTS.md` and
`docs/TESTING_GOLDEN_EVAL.md`.

The current hardening phase additionally covers scoped native Tree cleanup,
runtime request validation, bounded symbol/output materialization, strict CLI
argument parsing, and concurrent grammar-load coalescing. Hardening commit
`1712f17` passed cross-platform CI run
[33972164494](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33972164494).
Registry installation remains separately verified for published releases.

No marketing benchmark before this phase.

## Phase 9 — Cross-platform packaging

Test npm artifact on Windows/macOS/Linux.

Verify packaged WASM resolution from installed package, not source checkout only.

## V0.1 release gate

Must pass:

- language certification;
- schema;
- install;
- cross-platform smoke;
- no-write tests;
- root/path tests;
- performance report;
- docs consistency.

## Deferred to V0.2

- provider-neutral stateless serverless adapter;
- serverless source-input, authentication, privacy, size, timeout, and logging contract;
- Codex Skill;
- Claude setup;
- additional languages.

CLI-first keeps V0.1 small and proves the core before integration complexity.

# Changelog

All notable changes should be documented here.

The project follows semantic versioning once the first package is published.

## [Unreleased]

### Added

- Implemented the V0.1 Core API (`capabilities`/`outline`/`slice`), the
  `web-tree-sitter` `WasmEngine` parser backend, and a language adapter
  registry with zero language conditionals in Core.
- Implemented language adapters for JavaScript, TypeScript, TSX, Python, and
  CFML (including CFScript and CFQuery as embedded-region grammars re-parsed
  and offset back into host-file coordinates).
- Implemented the `code-slice` CLI (`capabilities`, `outline`, `symbol`,
  `line`, `range`) with the documented exit-code classes and strict
  stdout/stderr separation in `--json` mode.
- Implemented the pinned grammar build pipeline (`grammars/build.ts`,
  `grammars/verify.ts`): builds all 7 grammars to WASM via `tree-sitter build
  --wasm` (no Docker/emscripten required — the CLI self-hosts a WASI-SDK
  toolchain) and records a sha256 integrity manifest.
- Added 35 automated tests (`node:test`) covering per-language outline/
  symbol/line/range resolution, fail-closed ambiguity and not-found
  behavior, malformed-source recovery, UTF-8 byte-offset correctness for
  multi-byte source text, fake-syntax-in-comments/strings robustness, and
  full JSON Schema validation (via `ajv`) of every success/error envelope
  shape plus the three checked-in `examples/*.json` fixtures.
- Added an initial single-machine performance benchmark
  (`test/benchmark/`) with reproducibility metadata; see
  `docs/PERFORMANCE_BENCHMARK_RESULTS.md`.

### Fixed

- Worked around a packaging bug in `@cfmleditor/tree-sitter-cfml@0.26.34`
  (missing `common/scanner.h`/`common/tag.h` in the published npm tarball)
  by vendoring those two files from the exact matching upstream git tag; see
  `grammars/patches/cfml-common/PROVENANCE.md`.

### Status

V0.1 core (Core API, CLI, JS API, all four language families) is
**Implemented** per `DOCUMENTATION_INDEX.md`'s status convention — real code,
real tests, all passing on this machine (macOS/arm64, Node v23.10.0). It is
**not yet Verified**: no Windows/Linux install/run smoke tests have been run,
and the benchmark above covers only JavaScript on one platform. MCP,
Codex/Gemini/OpenCode integration packs, and V0.2+ languages remain
unimplemented, per `ROADMAP.md`.

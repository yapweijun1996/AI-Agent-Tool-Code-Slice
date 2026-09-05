# Changelog

All notable changes should be documented here.

The project follows semantic versioning.

## [Unreleased]

### Added

- Expanded the deterministic benchmark cohort to all current host adapters and
  the 5 KB, 50 KB, 500 KB, and 1 MB fixtures, with engine-phase, cold CLI,
  warm API, output-reduction, RSS, grammar-hash, and fixture-hash evidence.
- Added an isolated warm benchmark worker so per-fixture RSS observations do
  not retain large cold/warm envelopes or memory from earlier grammar cohorts.
- Added the built-package agent-facing E2E workflow for CLI and JS API usage,
  including exact byte-range validation, fail-closed ambiguity/fallback,
  schema validation, stdout/stderr separation, and read-only workspace checks.
- Added cross-platform CI coverage for agent-facing E2E and separate Node 20
  benchmark artifacts on Ubuntu, Windows, and macOS.

### Changed

- Scoped Tree-sitter parser/tree ownership to `ParserEngine.withParse()` and
  release the native tree on both successful and throwing extraction paths.
- Added runtime request validation and bounded file, symbol, and serialized
  output budgets. Invalid values fail closed with `INVALID_ARGUMENT`; valid
  results that exceed the output budget return `OUTPUT_LIMIT_EXCEEDED`.
- Made CLI flag and positional-argument parsing strict and added an additive
  v1.1 JSON envelope for CLI usage errors, while keeping Core/API result
  envelopes on schema v1.0.
- Added runtime grammar-manifest validation and coalesced concurrent first
  loads for the same WASM grammar.
- Confirmed the product boundary: no MCP server or MCP/stdio adapter will be
  built. A future serverless integration, if selected, will be a separate
  stateless wrapper over Core with an explicit source-input and privacy
  contract.

The changes in this section are implemented and locally verified in the
current working tree. They are not a new cross-platform release claim until
the CI matrix is rerun.

## [0.2.0] - 2026-09-05

### Added

- Extended the CFML adapter to re-parse HTML-style `<script>` and `<style>`
  regions with the pinned JavaScript and CSS WASM grammars, and to deep-parse
  `<cfquery>` bodies with the pinned CFQuery grammar. SQL-level clause blocks
  and query-function symbols keep their embedded-language metadata and exact
  host-file ranges; ambiguous or unsupported HTML region types are skipped
  rather than guessed.
- Added the pinned `tree-sitter-css@0.25.0` source to the grammar build and
  integrity pipeline, bringing the committed WASM manifest to 8 grammars.
- Added CFML mixed-language fixtures, SQL-level fixtures, unsupported-region
  coverage, recoverable embedded-error coverage, and four declarative Golden
  Eval cases. The suite now has 47 unit tests and 16 Golden Eval cases; CI run
  [33936169516](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33936169516)
  covers the new CFML paths on the Windows/macOS/Ubuntu × Node 18.18.0/20/22
  matrix.
- Added a Node 18.18-compatible TypeScript development-script launcher,
  root/symlink containment, byte-limit, invalid-UTF-8, and read-only file-loader
  regression tests, and an opt-in cross-platform registry-install smoke job.
- Published `agent-code-slice@0.2.0` with the latest CFML paths; release CI run
  [33937790994](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33937790994)
  verified registry installation and CFML embedding on Windows, macOS, and
  Ubuntu with Node 20.
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
  `grammars/verify.ts`): builds all 8 grammars to WASM via `tree-sitter build
  --wasm` (no Docker/emscripten required — the CLI self-hosts a WASI-SDK
  toolchain) and records a sha256 integrity manifest.
- Added 36 initial automated tests (`node:test`) covering per-language outline/
  symbol/line/range resolution, fail-closed ambiguity and not-found
  behavior, malformed-source recovery, UTF-8 byte-offset correctness for
  multi-byte source text, fake-syntax-in-comments/strings robustness, real
  grammar load+parse for the original 7 WASM grammars, and full JSON Schema
  validation (via `ajv`) of every success/error envelope shape plus the
  three checked-in `examples/*.json` fixtures.
- Added an initial single-machine performance benchmark
  (`test/benchmark/`) with reproducibility metadata; see
  `docs/PERFORMANCE_BENCHMARK_RESULTS.md`.

- Published `agent-code-slice@0.1.0-dev` to the public npm registry
  (`https://www.npmjs.com/package/agent-code-slice`); added a top-level
  `LICENSE` (MIT) and `package.json` publish metadata
  (author/repository/bugs/homepage/keywords), resolving the decision
  `docs/LICENSE_DECISION.md` flagged as required before external publish.
- Added `.github/workflows/ci.yml`: a Windows/macOS/Ubuntu × Node 18.18.0/20/22
  matrix (9 jobs) running install, typecheck, build, grammar integrity,
  the full test suite, a CLI smoke test, and `npm pack --dry-run` on every
  push/PR to `main`.
- Added a "For AI coding agents" section to `README.md`: a concrete,
  verified-working command reference (decision rule, five CLI examples,
  how to read the JSON output, current honest limits) rather than prose
  spread across contract docs.
- Added a declarative Golden Eval runner under `test/golden/`, with 16 frozen
  JSON cases covering all current adapters, selector operations, exact range
  text, embedded CFML symbols, ambiguity, not-found behavior, and malformed
  source warnings. `npm run test:golden` executes the cases through the public
  Core API, and CI runs it separately from the unit suite. CI run
  [33888822744](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33888822744)
  passed the then-current 12 cases on Windows/macOS/Linux with Node 20 and
  Node 22. The expanded 16-case set and 44-test suite are covered by the
  later CI run [33933654632](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33933654632).

### Fixed

- Worked around a packaging bug in `@cfmleditor/tree-sitter-cfml@0.26.34`
  (missing `common/scanner.h`/`common/tag.h` in the published npm tarball)
  by vendoring those two files from the exact matching upstream git tag; see
  `grammars/patches/cfml-common/PROVENANCE.md`.
- Fixed a real bug the above CI turned up: a plain `npm install`/`npm ci` in
  this repo failed on every platform (not just CI) because
  `@cfmleditor/tree-sitter-cfml`'s postinstall script attempts a native
  addon build that fails without `--ignore-scripts` (same root cause as the
  packaging bug above). That package and the other five grammar-source
  packages were never needed for developing/building/testing the project —
  only for the occasional `grammars:build` maintainer action — so they're
  no longer in `package.json` `devDependencies` at all;
  `npm run grammars:setup` installs them on demand.
- Fixed two Windows-specific CI failures found via the real Windows CI run
  ([33885209969](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33885209969)):
  `node --test test/unit/*.test.ts` relied on shell glob expansion, which
  PowerShell (npm's default Windows script shell) does not do for external
  commands — replaced with `scripts/run-tests.mjs`, which enumerates test
  files itself via `fs.readdirSync`; and `.gitattributes` lacked `eol=lf`,
  so a Windows checkout converted committed LF fixtures to CRLF and broke
  one exact-text assertion.

### Status

V0.1 core (Core API, CLI, JS API, all four language families, the original 7
grammars) is **Verified** for functional correctness per
`docs/LANGUAGE_SUPPORT_MATRIX.md`'s certification rule: the 36-test suite
passes on Windows Server 2025, macOS 26.5.2, and Ubuntu 24.04.4, each on
Node 20 and 22 — see
[CI run 33885596301](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33885596301).
At that point, performance evidence was limited to a macOS-only benchmark. The
serverless adapter and agent-specific integration packs remain unimplemented,
per `ROADMAP.md`; an MCP server is explicitly out of scope.

The newer CFML `<script>`/`<style>` and deep-CFQuery paths are implemented and
covered by CI run
[33936169516](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33936169516)
on the full Windows/macOS/Ubuntu × Node 18.18.0/20/22 matrix. The declared
Node floor is now covered by CI. The `0.2.0` package contains these latest
CFML paths, and release CI run
[33937790994](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33937790994)
verified its registry installation on Windows/macOS/Ubuntu with Node 20. The
performance benchmark remains outside this evidence.

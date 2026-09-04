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
- Added 36 automated tests (`node:test`) covering per-language outline/
  symbol/line/range resolution, fail-closed ambiguity and not-found
  behavior, malformed-source recovery, UTF-8 byte-offset correctness for
  multi-byte source text, fake-syntax-in-comments/strings robustness, real
  grammar load+parse for all 7 WASM grammars, and full JSON Schema
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
- Added `.github/workflows/ci.yml`: a Windows/macOS/Ubuntu × Node 20/22
  matrix (6 jobs) running install, typecheck, build, grammar integrity,
  the full test suite, a CLI smoke test, and `npm pack --dry-run` on every
  push/PR to `main`.
- Added a "For AI coding agents" section to `README.md`: a concrete,
  verified-working command reference (decision rule, five CLI examples,
  how to read the JSON output, current honest limits) rather than prose
  spread across contract docs.
- Added a declarative Golden Eval runner under `test/golden/`, with 12 frozen
  JSON cases covering all current adapters, selector operations, exact range
  text, embedded CFML symbols, ambiguity, not-found behavior, and malformed
  source warnings. `npm run test:golden` executes the cases through the public
  Core API, and CI runs it separately from the unit suite. CI run
  [33888822744](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33888822744)
  passed all 12 cases on Windows/macOS/Linux with Node 20 and Node 22.

### Fixed

- Worked around a packaging bug in `@cfmleditor/tree-sitter-cfml@0.26.34`
  (missing `common/scanner.h`/`common/tag.h` in the published npm tarball)
  by vendoring those two files from the exact matching upstream git tag; see
  `grammars/patches/cfml-common/PROVENANCE.md`.
- Fixed a real bug the above CI turned up: a plain `npm install`/`npm ci` in
  this repo failed on every platform (not just CI) because
  `@cfmleditor/tree-sitter-cfml`'s postinstall script attempts a native
  addon build that fails without `--ignore-scripts` (same root cause as the
  packaging bug above). That package and the other four grammar-source
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

V0.1 core (Core API, CLI, JS API, all four language families, all 7
grammars) is **Verified** for functional correctness per
`docs/LANGUAGE_SUPPORT_MATRIX.md`'s certification rule: the 36-test suite
passes on Windows Server 2025, macOS 26.5.2, and Ubuntu 24.04.4, each on
Node 20 and 22 — see
[CI run 33885596301](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33885596301).
Not covered by that evidence: a real registry install on Windows/Linux
(macOS-only so far), the Node 18.18 floor specifically (CI tests 20/22),
and performance (macOS-only benchmark). MCP, Codex/Gemini/OpenCode
integration packs, and V0.2+ languages remain unimplemented, per
`ROADMAP.md`.

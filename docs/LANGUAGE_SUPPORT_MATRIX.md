# Language Support Matrix

Status values:

- Planned
- Implemented
- Verified
- Experimental

Rows below reflect the current implementation. "Verified" here means the
36-test certification suite passes on a named CI matrix (see "Certification
evidence" below) — it certifies functional correctness (parsing, symbol
resolution, ambiguity, malformed-source handling), not performance or a
real npm-registry install on every platform (see `README.md`'s status
banner for what's still macOS-only).

| Language | Extensions | V0.1 target | Mixed-language role | Status |
|---|---|---:|---|---|
| JavaScript | `.js .jsx .mjs .cjs` | Yes | embedded in HTML/CFML | Verified |
| TypeScript | `.ts` | Yes | host | Verified |
| TSX | `.tsx` | Yes | JSX embedded syntax | Verified |
| Python | `.py` | Yes | host | Verified |
| CFML | `.cfm .cfc` | Yes | host for CFScript/CFQuery/JS/CSS | Verified (existing certification; new embedded JS/CSS/SQL paths are locally verified and pending a new cross-platform run) |
| CFScript | embedded / script-oriented CFML | Yes | embedded | Verified |
| CFQuery | `<cfquery>` region | Yes | embedded SQL-like region | Verified (named query plus SQL clause/function symbols; new deep-parse path is locally verified and pending a new cross-platform run) |
| Java | `.java` | V0.2 candidate | host | Planned |
| C# | `.cs` | V0.2 candidate | host | Planned |
| Go | `.go` | V0.2 candidate | host | Planned |
| Rust | `.rs` | V0.2 candidate | host | Planned |
| PHP | `.php` | V0.2 candidate | host + HTML/JS | Planned |
| C | `.c .h` | later | host | Planned |
| C++ | `.cc .cpp .cxx .hpp` | later | host | Planned |
| HTML | `.html .htm` | later | host for JS/CSS | Planned |
| CSS | `.css` | later | embedded/host | Planned |
| Vue | `.vue` | research | mixed | Planned |
| Svelte | `.svelte` | research | mixed | Planned |
| JSP / Razor | varies | research | mixed | Planned |

## Certification rule

A language may be marked **Verified** only when its certification suite passes for a named package/runtime version.

Certification evidence should include:

- grammar identity/hash;
- Node version range;
- operating systems tested;
- fixture counts;
- exact-slice accuracy;
- ambiguity behavior;
- malformed-source behavior;
- known limitations.

## Certification evidence (the original 7 grammars, current Verified status)

- **Run:** GitHub Actions `CI` workflow, commit `0da6685`, run
  [33885596301](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33885596301)
  — `.github/workflows/ci.yml`.
- **Operating systems:** Windows Server 2025 (build 10.0.26100, GitHub image
  `windows-2025-vs2026`), macOS 26.5.2 (image `macos-26-arm64`), Ubuntu
  24.04.4 (image `ubuntu-24.04`). These are GitHub-hosted rolling runner
  images, not manually pinned OS builds — re-running the workflow later may
  land on a newer image revision of the same OS version.
- **Node versions:** 20 and 22 (resolved by `actions/setup-node@v4`), on all
  three OSes above — 6 jobs total, all green. The declared `engines.node`
  floor of `>=18.18.0` is not itself independently verified (18 is not in
  the CI matrix).
- **Grammar identity/hash:** `grammars/wasm/manifest.json` sha256 per
  grammar, re-verified by `npm run grammars:verify` in every job.
- **Fixture counts / exact-slice / ambiguity / malformed-source:** the
  original 36-test certification suite, covering all four language families
  plus CFML's CFScript/CFQuery embedding — see `CHANGELOG.md` for what each
  test asserts. The declarative Golden Eval regression tests are additional
  evidence and are described in `docs/TESTING_GOLDEN_EVAL.md`.
- **Known limitations:** see below. This certification does not cover a
  real `npm install agent-code-slice` from the public registry on
  Windows/Linux (only `npm pack --dry-run`, which the CI does check), nor
  performance (macOS-only, `docs/PERFORMANCE_BENCHMARK_RESULTS.md`).

Additional declarative Golden Eval evidence: CI run
[33888822744](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33888822744)
passed the then-current 12 frozen cases on the same Windows/macOS/Linux × Node
20/22 matrix. The Golden set now has 16 cases; the four new CFML embedded
JS/CSS/SQL cases are locally verified only. This is additional regression
evidence and does not change the language status labels above.

An earlier run on the same commit lineage
([33885209969](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33885209969))
failed on Windows for two real, now-fixed platform bugs: `npm test`'s shell
glob (`test/unit/*.test.ts`) wasn't expanded by PowerShell on Node 20, and
Git's checkout converted committed LF fixtures to CRLF, breaking one
exact-text assertion on Node 22. Both are why `scripts/run-tests.mjs` and
`.gitattributes`' `eol=lf` exist — recorded here so the fix doesn't look
unmotivated later.

## Known limitations (current Verified state)

- CFML `<script>` and `<style>` regions are parsed only when their `type`
  attribute is absent or an explicitly supported JavaScript/CSS MIME type;
  dynamic and unknown types are skipped to avoid guessing the embedded
  language. Standalone CSS is not a registered host adapter.
- The new CFML embedded JS/CSS/CFQuery paths have local macOS/arm64 evidence;
  the named cross-platform certification and Golden Eval CI runs above
  predate these additions. A new matrix run is required before expanding the
  public cross-platform evidence claim.
- Destructuring patterns (`const { a, b } = x`, tuple-unpacking assignment in
  Python) are not surfaced as named symbols — a CodeSymbol with
  `name: null, dynamicName: true` is still emitted rather than being dropped.
- Functional correctness (the test suite) is CI-verified on Windows/macOS/
  Linux — see "Certification evidence" above. What's *not* covered: a real
  `npm install` from the public registry on Windows/Linux (only locally on
  macOS, plus `npm pack --dry-run` in CI on all three), the Node 18.18 floor
  specifically (CI tests 20/22), and performance (macOS-only benchmark).
- `typescript.wasm`/`tsx.wasm` report `Language.name === null` (grammar ABI
  14, built from `tree-sitter-typescript@0.23.2`'s pre-generated parser
  source) where the other five grammars (ABI 15) self-report identity.
  Parsing and symbol extraction are unaffected — see
  `test/unit/grammars-manifest.test.ts`.

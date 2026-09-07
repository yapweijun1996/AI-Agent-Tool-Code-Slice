# Language Support Matrix

Status values:

- Planned
- Implemented
- Verified
- Experimental

Rows below reflect the current implementation. "Verified" here means the
language certification and regression suite passes on a named CI matrix (see
"Certification evidence" below) — it certifies functional correctness
(parsing, symbol resolution, ambiguity, malformed-source handling), not a
universal performance promise. A previous Node 20 CI run covers benchmark
execution on all three OS families; the latest lifecycle/budget changes still
need a new cross-platform run (see `README.md`'s status banner).

| Language | Extensions | V0.1 target | Mixed-language role | Status |
|---|---|---:|---|---|
| JavaScript | `.js .jsx .mjs .cjs` | Yes | embedded in HTML/CFML | Verified |
| TypeScript | `.ts` | Yes | host | Verified |
| TSX | `.tsx` | Yes | JSX embedded syntax | Verified |
| Python | `.py` | Yes | host | Verified |
| CFML | `.cfm .cfc` | Yes | host for CFScript/CFQuery/JS/CSS | Verified (existing certification plus CI coverage for embedded JS/CSS/SQL) |
| CFScript | embedded / script-oriented CFML | Yes | embedded | Verified |
| CFQuery | `<cfquery>` region | Yes | embedded SQL-like region | Verified (named query plus SQL clause/function symbols, covered by the latest CI matrix) |
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

## TypeScript practical symbol coverage

The TypeScript/TSX adapter recognizes the practical navigation units most
likely to appear in large application files:

- `enum` declarations as normalized kind `enum`;
- `namespace X {}` and `module X {}` as normalized kind `module`;
- class field arrows/function expressions such as `commit = () => ...` as
  callable `method` symbols; ordinary non-callable class data fields are
  intentionally omitted from discovery;
- function-valued object properties such as `commit: () => ...` as `function`;
- object shorthand methods continue to surface as `method`.

These nested symbols preserve parent identity, so qualified lookup such as
`OwnerOAuthProvider.commit`, `OAuth.normalize`, or `handlers.commit` can select
one member without reading the enclosing class/module/object. Ordinary
non-callable object-literal data properties are intentionally not added to the
symbol inventory because doing so would recreate outline noise. Computed or
otherwise non-static names remain fail-closed/dynamic rather than guessed.

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
  three OSes above — 6 jobs total, all green. Follow-up run
  [33936169516](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33936169516)
  adds Node 18.18.0, for 9 green jobs total, and independently verifies the
  declared `engines.node` floor of `>=18.18.0`.
- **Grammar identity/hash:** `grammars/wasm/manifest.json` sha256 per
  grammar, re-verified by `npm run grammars:verify` in every job.
- **Fixture counts / exact-slice / ambiguity / malformed-source:** the
  original 36-test certification suite, covering all four language families
  plus CFML's CFScript/CFQuery embedding — see `CHANGELOG.md` for what each
  test asserts. The declarative Golden Eval regression tests are additional
  evidence and are described in `docs/TESTING_GOLDEN_EVAL.md`.
- **Known limitations:** see below. This certification does not make a
  universal latency or memory promise. The separate `0.2.0` release CI smoke
  covers public-registry installation on all three listed platforms and
  verifies CFML embedding, not agent-specific integrations.

Additional declarative Golden Eval evidence: CI run
[33888822744](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33888822744)
passed the then-current 12 frozen cases on the same Windows/macOS/Linux × Node
20/22 matrix. The latest CI run
[33933654632](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33933654632)
passed the current 16 cases and 44-test suite on all six jobs, including the
new CFML embedded JS/CSS/SQL cases. Follow-up CI run
[33936169516](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33936169516)
passed the current 16 cases and 47-test suite on all nine Windows/macOS/Ubuntu
× Node 18.18.0/20/22 jobs. This follow-up also independently covers the
declared Node floor. Release CI run
[33937790994](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33937790994)
passed those core checks again and completed the opt-in registry-install smoke
on Windows/macOS/Ubuntu with Node 20, including the published CFML embedding.
The existing Verified labels remain supported by the original certification
and these expanded matrix runs.

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
- Destructuring patterns (`const { a, b } = x`, tuple-unpacking assignment in
  Python) are not surfaced as named symbols — a CodeSymbol with
  `name: null, dynamicName: true` is still emitted rather than being dropped.
- Functional correctness (the test suite) is CI-verified on Windows/macOS/
  Linux — see "Certification evidence" above. The `0.2.0` release CI also
  verified real public-registry installation on all three listed platforms with
  Node 20. Hardening commit `1712f17` passed the Node 20 benchmark jobs on all
  three platforms; benchmark numbers remain environment-specific and are not
  a universal latency or memory promise.
- `typescript.wasm`/`tsx.wasm` report `Language.name === null` (grammar ABI
  14, built from `tree-sitter-typescript@0.23.2`'s pre-generated parser
  source) where the other five grammars (ABI 15) self-report identity.
  Parsing and symbol extraction are unaffected — see
  `test/unit/grammars-manifest.test.ts`.

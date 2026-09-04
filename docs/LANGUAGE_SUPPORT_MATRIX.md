# Language Support Matrix

Status values:

- Planned
- Implemented
- Verified
- Experimental

Rows below reflect the current implementation. "Implemented" means real
adapter code with passing automated tests on this machine (macOS/arm64, Node
v23.10.0) — see `CHANGELOG.md`. None are "Verified" yet: that requires the
cross-platform/CI evidence described in the certification rule below, which
has not been generated.

| Language | Extensions | V0.1 target | Mixed-language role | Status |
|---|---|---:|---|---|
| JavaScript | `.js .jsx .mjs .cjs` | Yes | embedded in HTML/CFML later | Implemented |
| TypeScript | `.ts` | Yes | host | Implemented |
| TSX | `.tsx` | Yes | JSX embedded syntax | Implemented |
| Python | `.py` | Yes | host | Implemented |
| CFML | `.cfm .cfc` | Yes | host for CFScript/CFQuery/JS/CSS | Implemented (JS `<script>`/CSS embedding not yet handled — see Known limitations below) |
| CFScript | embedded / script-oriented CFML | Yes | embedded | Implemented |
| CFQuery | `<cfquery>` region | Yes | embedded SQL-like region | Implemented (region is captured as an opaque named symbol; not deep-parsed with the built `cfquery` grammar yet) |
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

## Known limitations (current Implemented state)

- CFML's `<script>` (client-side JS) and `<style>` (CSS) regions are not yet
  re-parsed as embedded languages, even though the CFML grammar exposes
  `script_element`/`style_element` nodes for them. Only `<cfscript>` and
  `<cfquery>` are wired up.
- `cfquery` content is captured as an opaque named `query` symbol (matching
  the documented JSON example); it is not deep-parsed with the built
  `cfquery` WASM grammar for SQL-level symbols.
- Destructuring patterns (`const { a, b } = x`, tuple-unpacking assignment in
  Python) are not surfaced as named symbols — a CodeSymbol with
  `name: null, dynamicName: true` is still emitted rather than being dropped.
- Only macOS/arm64 has been exercised; Windows/Linux install and run smoke
  tests (README "V0.1 Definition of Done") have not been performed. Runtime
  (not build) has additionally been verified on Node v20.20.2 in this
  environment, alongside the primary v23.10.0; the declared `engines.node`
  floor of `>=18.18.0` itself is not independently verified.
- `typescript.wasm`/`tsx.wasm` report `Language.name === null` (grammar ABI
  14, built from `tree-sitter-typescript@0.23.2`'s pre-generated parser
  source) where the other five grammars (ABI 15) self-report identity.
  Parsing and symbol extraction are unaffected — see
  `test/unit/grammars-manifest.test.ts`.

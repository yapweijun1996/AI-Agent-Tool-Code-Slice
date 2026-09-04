# CFML grammar patch: missing `common/` headers

## What this is

`@cfmleditor/tree-sitter-cfml@0.26.34` (the pinned CFML/CFScript/CFQuery grammar
source, see `devDependencies` in `package.json`) has an npm packaging bug: its
`package.json` `files` allowlist ships `common/define-grammar.js` but omits
`common/scanner.h` and `common/tag.h`. Both `cfml/src/scanner.c` and
`cfscript/src/scanner.c` (and transitively `cfquery`) `#include
"../../common/scanner.h"`, so neither the native addon nor the WASM build can
compile from the published npm tarball alone — confirmed by reproducing the
`fatal error: '../../common/scanner.h' file not found` build failure.

## What we did

These two files are re-fetched from the upstream GitHub repository at the
**exact commit that npm version 0.26.34 was published from** (verified via
`GET https://api.github.com/repos/cfmleditor/tree-sitter-cfml/tags`), not from
`main` or any other ref:

- source repo: `https://github.com/cfmleditor/tree-sitter-cfml`
- tag: `v0.26.34`
- commit: `60769475046eec15c277775b03b02a4ab3388b64`
- license: MIT (`UPSTREAM-LICENSE` in this directory is that commit's `LICENSE` file, verbatim)

| File | sha256 |
|---|---|
| `scanner.h` | `aae10d004b2e30895c0a1374d98f8057ded011511fa146c7e08ec8cefd3f5f4b` |
| `tag.h` | `437fbefba5309f509b4a530d77aaeee924c5a5d4407131645c7f0364196def10` |

`grammars/build.ts` copies these two files into
`node_modules/@cfmleditor/tree-sitter-cfml/common/` before invoking
`tree-sitter build --wasm` for the `cfml`, `cfscript`, and `cfquery` grammar
directories. No other upstream source is modified or vendored — everything
else needed to build comes from the pinned npm package itself.

## Why this doesn't violate "pinned, repository-controlled" grammar sources

The content is unmodified upstream source at the same commit the npm release
was cut from; we're completing an incomplete tarball, not patching grammar
behavior. If a future `@cfmleditor/tree-sitter-cfml` release fixes its `files`
allowlist, this directory (and the corresponding step in `grammars/build.ts`)
should be deleted and the pinned version bumped instead.

## Follow-up

Consider filing an upstream issue against `cfmleditor/tree-sitter-cfml` so the
`files` field ships `common/scanner.h` and `common/tag.h` directly. Not done as
part of this change — no repository access to file it from this environment.

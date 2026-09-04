# License Decision

**Decided: MIT.** A top-level `LICENSE` file and `package.json` `license: "MIT"`
are in place. All bundled Tree-sitter grammar dependencies
(`tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`,
`@cfmleditor/tree-sitter-cfml`) and `web-tree-sitter` itself are also MIT —
confirmed via `npm view <pkg> license` — so redistributing the compiled WASM
grammar artifacts under MIT does not conflict with any upstream license.

The rest of this document is kept as the historical record of the decision
that was made.

---

No license has been selected by this documentation pack.

A public GitHub repository without a license does not automatically grant others permission to reuse, modify, or distribute the code.

## Candidate

For a small open-source developer tool intended for broad adoption, MIT is a common simple option.

However, the project owner should explicitly choose the license.

## Before first public implementation release

Review:

- desired reuse rights;
- attribution requirements;
- commercial reuse;
- contribution policy;
- licenses of bundled Tree-sitter grammars and dependencies;
- whether grammar artifacts can be redistributed under their licenses.

Then add a real top-level `LICENSE` file and package metadata.

Do not publish a placeholder license text that does not reflect the owner's decision.

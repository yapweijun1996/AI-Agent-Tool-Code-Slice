# Contributing

Agent Code Slice is designed around stable contracts, small adapters, and evidence-backed language support.

## Before contributing

Read:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/LANGUAGE_ADAPTER_CONTRACT.md`
- `docs/TESTING_GOLDEN_EVAL.md`

## Contribution types

Useful contributions include:

- new language adapters;
- stronger Tree-sitter queries;
- mixed-language injection support;
- ambiguity handling;
- malformed-source fixtures;
- cross-platform packaging;
- performance measurements;
- CLI/MCP contract tests;
- verified agent integration documentation.

## Adding a language

A language is not considered supported merely because a grammar can parse a file.

A language adapter must define and test:

- file extension detection;
- grammar loading;
- symbols and normalized kinds;
- symbol naming rules;
- container resolution;
- line/range expansion;
- ambiguity behavior;
- malformed-source behavior;
- golden fixtures;
- expected JSON output.

See `docs/LANGUAGE_ADAPTER_CONTRACT.md`.

## Pull requests

Keep PRs focused. Include:

- problem statement;
- scope and non-goals;
- contract impact;
- tests and fixtures;
- benchmark impact when relevant;
- security/privacy impact;
- release-note impact.

Do not combine unrelated refactors with a language/contract feature.

## Stable contract changes

Changes to any of the following require explicit review and a versioning decision:

- CLI command/flag names;
- JSON schema;
- normalized symbol kinds;
- error codes;
- JS public API;
- MCP tool names or input/output contracts.

## Generated artifacts

Do not manually patch generated WASM or generated schemas. Change the source/build input and regenerate.

## Code style

Prefer clear modular TypeScript/JavaScript. Avoid hidden magic and language-specific branches in Core.

## Tests

New parser behavior requires a regression fixture. A feature without representative fixtures is incomplete.

## Security reports

Do not open public issues for vulnerabilities involving path traversal, unintended file access, package integrity, or source disclosure. Follow `SECURITY.md`.

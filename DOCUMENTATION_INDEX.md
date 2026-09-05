# Documentation Index

This index describes the current public repository documentation.

## Start here

1. `README.md` — public project overview.
2. `docs/PRODUCT_SPEC.md` — goals, users, scope, non-goals, acceptance.
3. `docs/ARCHITECTURE.md` — system layers and boundaries.
4. `docs/IMPLEMENTATION_PLAN.md` — phased engineering plan.
5. `AGENTS.md` — repository rules for AI coding agents.

## Contracts

- `docs/CLI_CONTRACT.md`
- `docs/JSON_SCHEMA.md`
- `schemas/code-slice-result-v1.schema.json`
- `schemas/code-slice-result-v1.1.schema.json`
- `docs/LANGUAGE_ADAPTER_CONTRACT.md`
- `docs/SERVERLESS_INTEGRATION.md`
- `docs/AGENT_INTEGRATIONS.md`

## Platform and quality

- `docs/PARSER_ENGINE_DECISION.md`
- `docs/LANGUAGE_SUPPORT_MATRIX.md`
- `docs/SECURITY_PRIVACY.md`
- `SECURITY.md`
- `docs/TESTING_GOLDEN_EVAL.md`
- `docs/PERFORMANCE_BENCHMARK.md`
- `docs/PERFORMANCE_BENCHMARK_RESULTS.md`
- `docs/RELEASE_CHECKLIST.md`

## Project operations

- `ROADMAP.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `docs/LICENSE_DECISION.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`

## Architecture decisions

- `docs/adr/0001-web-tree-sitter-wasm-default.md`
- `docs/adr/0002-cli-first-multi-agent-integration.md`
- `docs/adr/0003-read-only-fail-closed-v0.md`
- `docs/adr/0004-serverless-no-mcp.md`

## Examples

- `examples/success-symbol.json`
- `examples/error-symbol-ambiguous.json`
- `examples/cfml-query-slice.json`

## Status convention

Public documentation must use these labels consistently:

- **Design** — agreed architecture, no implementation claim.
- **Planned** — targeted for a future milestone.
- **Implemented** — code exists but may not be release-verified.
- **Verified** — acceptance evidence exists for the named environment/version.
- **Experimental** — available but not covered by the stable compatibility contract.

# AGENTS.md — Agent Code Slice

## Mission

Build Agent Code Slice as a small, deterministic, local-first code-context utility for AI coding agents.

## Core product contract

- Multi-language; never specialize the whole product to one language.
- CFML is a first-class language adapter, not the product boundary.
- Core is local-only and read-only for V0.x.
- No LLM, remote service, database, account, or API key is required by the core.
- CLI is the lowest-common agent integration.
- JS API and optional stdio MCP must call the same Core API.
- Agent-specific Skills / Extensions / custom tools are thin adapters only.
- Ambiguous symbol resolution must fail closed with candidates.
- Never guess a symbol, language, or code boundary.
- Machine JSON goes to stdout; diagnostics go to stderr.

## Architecture boundaries

Expected modules:

```text
src/core/
src/engine/
src/languages/
src/schema/
src/cli/
src/mcp/
integrations/
grammars/
test/
```

Do not add language conditionals to the Core such as:

```js
if (language === "python") ...
```

Language behavior belongs in registered adapters.

Do not implement separate parsing logic for Codex, Claude Code, Gemini CLI, OpenCode, or MCP.

## Parser policy

Default engine target: `web-tree-sitter` with pinned, repository-controlled WASM grammars.

- Grammar sources and build toolchain must be pinned.
- Built WASM artifacts must have integrity metadata.
- Every grammar must pass a load smoke and golden parse fixtures.
- Native Tree-sitter is optional future work and must produce the same normalized IR.
- `ast-grep` is a benchmark/complementary tool, not a hidden runtime dependency unless an explicit ADR changes this.

## Security

V0.x must not:

- modify source files;
- execute project code;
- run arbitrary user commands as part of slicing;
- require network access during normal slicing;
- upload source code;
- read outside the explicitly requested file/workspace boundary;
- follow symlinks outside an allowed root without an explicit policy decision.

Treat source text as untrusted input.

## Scope control

V0.1 target operations:

- capabilities;
- outline;
- slice by symbol;
- slice by line;
- slice by range with syntactic expansion.

Do not add RAG, semantic search, embeddings, repository-wide indexing, call graph, automatic edits, code generation, formatting, test execution, or autonomous planning to V0.1.

## Testing discipline

Before claiming a feature is complete:

1. add/update frozen fixtures;
2. test success, malformed, no-match, and ambiguity cases;
3. verify exact line/byte boundaries;
4. verify JSON schema;
5. verify stdout/stderr separation;
6. run cross-platform package smoke where applicable;
7. preserve benchmark baseline.

A fluent explanation is not acceptance evidence.

## Public-claim discipline

Do not change a status from Planned/Implemented to Verified without stored evidence.

Do not claim "supports all AI agents." Use:

> Works with AI coding agents that can use shell commands, JavaScript, or MCP.

## Completion report

For engineering work, report:

- files changed;
- contracts changed;
- tests run and results;
- fixture/benchmark evidence;
- compatibility impact;
- remaining limitations;
- whether public docs need a status change.

# Agent Code Slice

Precise, language-aware code context for AI coding agents.

> Status: **V0.1 core Implemented, not yet Verified**.  
> The Core API, CLI, JS API, and JavaScript/TypeScript/TSX/Python/CFML adapters described below exist as real code with a passing automated test suite (see `CHANGELOG.md`). "Verified" per `DOCUMENTATION_INDEX.md`'s status convention additionally requires cross-platform evidence, which has not been generated — only macOS/arm64 has been exercised so far. MCP and agent-specific integration packs remain **Planned** (V0.2).

Agent Code Slice is a local-first, read-only developer tool that extracts the exact syntactic code unit an AI coding agent needs instead of forcing the agent to read an entire source file.

The product is designed to work with any AI coding agent that can use one or more of:

- shell / terminal commands;
- a JavaScript / Node.js API;
- Model Context Protocol (MCP).

Target integrations include Codex CLI, Claude Code, Gemini CLI, OpenCode, AGRUN, VM-MCP, and other coding agents. Integration support must be verified by real end-to-end tests before being marked as supported.

## Why

AI coding agents frequently read large source files when they only need one function, method, class, query, or logical block. This increases context usage and makes navigation less precise.

Agent Code Slice targets this flow:

```text
Large source file
      |
      v
Language detection
      |
      v
Tree-sitter WASM parser
      |
      v
Language adapter
      |
      v
Normalized symbol IR
      |
      v
Exact code slice
      |
      v
AI coding agent
```

The project is intentionally not a code search engine, repository indexer, RAG system, formatter, linter, or autonomous coding agent.

## Product principles

1. **Local-first** — source code is parsed on the user's machine.
2. **No hosted backend required** — no cloud service, database, account, or API key is required for the core product.
3. **Read-only** — V0.1 reads and parses files; it does not edit them.
4. **Deterministic** — no LLM is required to decide code boundaries.
5. **Fail closed** — ambiguous symbols produce explicit candidates instead of guessed results.
6. **Multi-language** — one stable contract across languages.
7. **Multi-agent** — CLI is the lowest common compatibility layer; MCP and agent-specific packs are optional adapters.
8. **Small public contract** — stable CLI, JSON schema, and JS API; implementation details remain replaceable.

## Planned V0.1 languages

| Language | Planned V0.1 | Notes |
|---|---:|---|
| JavaScript | Yes | `.js`, `.jsx`, `.mjs`, `.cjs` |
| TypeScript | Yes | `.ts`, `.tsx` |
| Python | Yes | `.py` |
| CFML | Yes | `.cfm`, `.cfc`; CFScript / CFQuery are first-class embedded languages |
| Java | Later | V0.2 candidate |
| C# | Later | V0.2 candidate |
| Go | Later | V0.2 candidate |
| Rust | Later | V0.2 candidate |
| PHP | Later | V0.2 candidate |
| C / C++ | Later | Later |
| HTML / CSS / mixed frameworks | Later | Driven by injection support |

See [docs/LANGUAGE_SUPPORT_MATRIX.md](docs/LANGUAGE_SUPPORT_MATRIX.md).

## Planned CLI

```bash
code-slice capabilities --json
code-slice outline src/app.ts --json
code-slice symbol src/app.ts calculateTotal --json
code-slice line src/app.ts 382 --json
code-slice range src/app.ts 380:390 --expand --json
```

For machine consumers:

```text
stdout = result data
stderr = diagnostics
exit code = execution status
```

No banners, progress prose, or logging may be mixed into `stdout` when `--json` is active.

## Planned JavaScript API

```js
import { capabilities, outline, slice } from "agent-code-slice";

const result = await slice({
  file: "src/app.ts",
  selector: {
    type: "symbol",
    name: "calculateTotal"
  }
});
```

## Planned MCP

The MCP adapter is intentionally small and read-only:

- `code_slice_capabilities`
- `code_slice_outline`
- `code_slice_get`

The MCP server is planned as a local stdio server. It must call the same Core API as the CLI and must not duplicate parsing logic.

## Agent compatibility model

| Agent | Lowest-common integration | Enhanced integration |
|---|---|---|
| Codex CLI | CLI | MCP + Skill |
| Claude Code | CLI | MCP |
| Gemini CLI | CLI | MCP + Extension |
| OpenCode | CLI | MCP + Custom Tool |
| AGRUN | JS API | MCP optional |
| VM-MCP | CLI | MCP optional |
| Other agents | CLI if shell exists | MCP / JS API if supported |

The public compatibility statement should be:

> Works with AI coding agents that can use shell commands, JavaScript, or MCP.

Do not claim "supports all AI agents."

## Parser foundation

The default V0.1 design uses:

```text
web-tree-sitter
+
pinned Tree-sitter WASM grammars
+
per-language adapters
```

Why:

- portable across Windows, macOS, and Linux;
- avoids making native compilation a base install requirement;
- suitable for Node.js now and possible browser use later;
- preserves direct control over AST and mixed-language slicing.

Native Tree-sitter may be evaluated later as an optional performance backend. `ast-grep` is treated as a complementary tool and benchmark competitor, not the core dependency.

See [docs/PARSER_ENGINE_DECISION.md](docs/PARSER_ENGINE_DECISION.md).

## Repository documentation

Start with:

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [CLI contract](docs/CLI_CONTRACT.md)
- [JSON contract](docs/JSON_SCHEMA.md)
- [Language adapter contract](docs/LANGUAGE_ADAPTER_CONTRACT.md)
- [MCP integration](docs/MCP_INTEGRATION.md)
- [Agent integrations](docs/AGENT_INTEGRATIONS.md)
- [Security and privacy](docs/SECURITY_PRIVACY.md)
- [Testing and Golden Eval](docs/TESTING_GOLDEN_EVAL.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Roadmap](ROADMAP.md)

## V0.1 Definition of Done

V0.1 is not complete until:

- the Core API, CLI, and JSON schema are stable and versioned;
- JavaScript, TypeScript/TSX, Python, and CFML fixtures pass language-specific golden tests;
- ambiguous symbols fail closed;
- line and range expansion return deterministic syntactic containers;
- malformed input returns warnings/errors without invented symbols;
- CLI JSON mode keeps stdout machine-clean;
- no core path requires network access, a hosted service, an account, or an API key;
- packaged WASM grammars pass load tests and integrity checks;
- Windows, macOS, and Linux install/run smoke tests pass;
- documented benchmark results are generated from frozen fixtures rather than marketing claims.

## Licensing

MIT. See [LICENSE](LICENSE) and [docs/LICENSE_DECISION.md](docs/LICENSE_DECISION.md) for how this was decided.

## Project owner

Initial project concept and direction: Yap Wei Jun.

This documentation is intended to be repository-ready, but all implementation and compatibility claims must remain evidence-backed.

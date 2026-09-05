# Agent Code Slice

Precise, language-aware code context for AI coding agents.

> Status: **V0.1 core Verified** (functional correctness and cross-platform package/install CI) — performance is **not yet Verified** across the supported OS/Node matrix.
> The Core API, CLI, JS API, and JavaScript/TypeScript/TSX/Python/CFML adapters described below have a 47-test regression suite passing on Windows Server 2025, macOS 26, and Ubuntu 24.04 (Node 18.18.0, 20, and 22 each) — see the [CI workflow](.github/workflows/ci.yml) and `CHANGELOG.md` for the exact run. The repository includes a 16-case declarative Golden Eval regression set (`npm run test:golden`); release CI run [33937790994](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33937790994) passed all 47 unit tests and 16 Golden cases, including the CFML embedded JS/CSS/SQL paths, on the Windows/macOS/Ubuntu × Node 18.18.0/20/22 matrix, and installed `agent-code-slice@0.2.0` successfully from the public registry on all three platforms with Node 20. CI also confirms `npm pack` resolves correctly on all three. `npm run test:e2e` now verifies the built CLI/JS API agent-facing contract, while vendor-specific live agent behavior remains unverified. The performance benchmark (`docs/PERFORMANCE_BENCHMARK_RESULTS.md`) now covers all current adapters and four sizes; CI run [33944283579](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33944283579) passed the Ubuntu/Windows/macOS × Node 20 benchmark jobs and uploaded three non-expired report artifacts. This is recorded evidence for that matrix, not a universal latency promise across every supported Node version. No MCP server is planned; the future serverless adapter and agent-specific integration packs remain **Planned** (V0.2).

Agent Code Slice is a local-first, read-only developer tool that extracts the exact syntactic code unit an AI coding agent needs instead of forcing the agent to read an entire source file.

The current product is designed to work with any AI coding agent that can use one or more of:

- shell / terminal commands;
- a JavaScript / Node.js API.

Target integrations include Codex CLI, Claude Code, Gemini CLI, OpenCode, AGRUN, VM-MCP, and other coding agents. A future serverless adapter is a separate planned integration; support must be verified by real end-to-end tests before being marked as supported.

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

## For AI coding agents

If you are an AI coding agent and `code-slice` is installed (`npm install -D agent-code-slice`, or already a dependency of the project you're working in), prefer it over reading a whole file when you only need one symbol, one line's container, or one range.

**Decision rule:** know the file and a symbol name → use `symbol`. Know the file and a line number (e.g. from a stack trace or lint error) → use `line`. Don't know what's in the file yet → use `outline` first, then `symbol` on what you find. Don't know if this file's language is supported → check `capabilities` or just try; it fails closed with a machine-readable error rather than guessing.

```bash
# What can this tool do, and what languages does it support?
code-slice capabilities --json

# What's in this file? (bounded list of symbols: kind, name, range, signature)
code-slice outline src/app.ts --json

# Give me exactly this function/method/class/query — nothing else.
code-slice symbol src/app.ts calculateTotal --json

# A stack trace or lint error points at a line — what's the enclosing unit?
code-slice line src/app.ts 382 --json

# I know roughly where, but not the exact boundaries — expand to a container.
code-slice range src/app.ts 380:390 --expand --json
```

Every command above prints **exactly one JSON document to stdout** when `--json` is passed (schema: `schemas/code-slice-result-v1.schema.json`, described in `docs/JSON_SCHEMA.md`) — safe to pipe and parse directly, e.g. `code-slice symbol src/app.ts calculateTotal --json | jq -r .result.code`. Diagnostics go to stderr, never stdout.

Read `result.code` for the exact text; do not re-derive it from `result.range` yourself. On failure, check `error.code` (stable values like `SYMBOL_NOT_FOUND`, `SYMBOL_AMBIGUOUS`, `LANGUAGE_UNSUPPORTED` — full list in `docs/JSON_SCHEMA.md`) rather than parsing `error.message`, and fall back to reading the file normally — this tool never guesses a symbol, language, or boundary, so an error here is real signal, not a bug to route around. `SYMBOL_AMBIGUOUS` includes bounded `candidates`; either narrow with `--kind` or pick one and say which.

From Node.js/TypeScript, the same three operations are a JS API (`import { capabilities, outline, slice } from "agent-code-slice"` — see below) if shelling out isn't convenient.

**Current honest limits, so you don't assume more than what's real:** No MCP server or MCP/stdio adapter is planned. Agent-specific Skills/Extensions and the future serverless adapter are not built yet (V0.2, see `ROADMAP.md`) — the CLI and JS API are the current integration surfaces. Only JavaScript, TypeScript, TSX, Python, and CFML/CFScript/CFQuery are supported (`docs/LANGUAGE_SUPPORT_MATRIX.md`); CFML `<script>`/`<style>` regions are re-parsed as JavaScript/CSS, while standalone CSS is not a registered host adapter. Anything else returns `LANGUAGE_UNSUPPORTED`. Release CI covers the new CFML embedded paths, the declared Node floor, and `0.2.0` registry installation on Windows/macOS/Ubuntu; standalone CSS, serverless, agent-specific integrations, and broader performance guarantees remain outside the current evidence.

## Product principles

1. **Local-first** — source code is parsed on the user's machine.
2. **No hosted backend required** — no cloud service, database, account, or API key is required for the core product.
3. **Read-only** — V0.1 reads and parses files; it does not edit them.
4. **Deterministic** — no LLM is required to decide code boundaries.
5. **Fail closed** — ambiguous symbols produce explicit candidates instead of guessed results.
6. **Multi-language** — one stable contract across languages.
7. **On-demand integration** — CLI is the lowest common compatibility layer; JS API and any future serverless wrapper are thin adapters over Core, with no resident MCP server.
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

## Planned serverless adapter

The future serverless adapter is intentionally stateless and read-only:

- one request invokes `capabilities`, `outline`, or `slice`;
- the response uses the same versioned JSON envelope and stable error codes;
- the wrapper delegates to Core and does not duplicate parsing logic.

It will not expose MCP/stdio or require a long-running process. A cloud
function cannot access a caller's local path by default, so the source-input,
authentication, privacy, size, timeout, and logging contract must be selected
before implementation. See [Serverless integration](docs/SERVERLESS_INTEGRATION.md).

## Agent compatibility model

| Agent | Current integration | Future optional integration |
|---|---|---|
| Codex CLI | CLI | Skill or serverless wrapper |
| Claude Code | CLI | Serverless wrapper |
| Gemini CLI | CLI | Serverless wrapper or Extension |
| OpenCode | CLI | Serverless wrapper or Custom Tool |
| AGRUN | JS API | Serverless wrapper |
| VM-MCP | CLI | None provided by Code Slice |
| Other agents | CLI if shell exists | JS API or serverless wrapper if supported |

The public compatibility statement should be:

> Works with AI coding agents that can use shell commands or JavaScript. A
> future serverless adapter is a separate planned integration.

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
- [Serverless integration](docs/SERVERLESS_INTEGRATION.md)
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

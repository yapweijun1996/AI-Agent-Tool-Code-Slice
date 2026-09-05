# AI Agent Integrations

For a concrete, copy-pasteable command reference (what to run, how to read
the JSON, when to fall back to a normal file read), see
[README.md "For AI coding agents"](../README.md#for-ai-coding-agents). This
document covers integration philosophy and per-agent-platform roadmap status
instead.

## Integration philosophy

Agent Code Slice is agent-agnostic.

Lowest common layer:

```text
CLI
```

Enhanced layers:

```text
JS API
future serverless function adapter
agent-specific Skill / Extension / Custom Tool
```

Agent-specific adapters must not contain independent slicing logic.

## Agent-facing contract E2E

`test/e2e/agent-workflow.test.ts` and `npm run test:e2e` exercise the built CLI
and public JS API from an isolated workspace. The suite proves the common
agent-facing contract: outline-to-symbol navigation, exact byte boundaries,
schema-valid JSON, fail-closed ambiguity with candidates, normal-read
fallback, stdout/stderr separation, and no workspace writes.

This suite is deterministic and does not call an LLM or a vendor agent CLI.
It is therefore evidence for the package integration boundary, not a
Verified Codex/Claude/Gemini/OpenCode compatibility row. Vendor-specific live
E2E requires an explicit opt-in run and remains tracked in the matrix below.

## Codex CLI

Planned progression:

1. CLI:
   ```bash
   code-slice outline src/app.ts --json
   code-slice symbol src/app.ts calculateTotal --json
   ```
2. future serverless wrapper, once its provider and source-input contract are selected;
3. `integrations/codex/SKILL.md` with usage policy.

Recommended Skill behavior:

- use Code Slice for large source files or known symbol targets;
- call outline first when target symbol is unknown;
- fall back to normal reads if unsupported/ambiguous;
- never treat Code Slice output as proof of runtime behavior.

Package CLI path: **Implemented**. Codex-version-specific live compatibility:
**Planned**, not verified.

## Claude Code

Primary: shell/CLI.

Enhanced: future serverless wrapper or direct JS API, once implemented.

Keep permission requirements read-only where platform capabilities permit.

Package CLI path: **Implemented**. Claude-version-specific live compatibility:
**Planned**, not verified.

## Gemini CLI

Primary: shell/CLI.

Enhanced:

- serverless wrapper, once implemented;
- Gemini CLI Extension packaging instructions if still needed.

Package CLI path: **Implemented**. Gemini-version-specific live compatibility:
**Planned**, not verified.

## OpenCode

Primary: shell/CLI.

Enhanced options:

- serverless wrapper, once implemented;
- thin custom tool wrapper importing Core.

Package CLI path: **Implemented**. OpenCode-version-specific live compatibility:
**Planned**, not verified.

## AGRUN

Preferred: JS API Host Tool.

AGRUN integration should call Core directly and return bounded JSON.

Package JS API path: **Implemented**. AGRUN host integration: **Planned**, not
verified.

## VM-MCP

Preferred: execute installed CLI inside the authorized VM workspace.

Do not expand VM-MCP permissions simply to support Code Slice.

Package CLI path: **Implemented**. VM-MCP host integration: **Planned**, not
verified.

## Unknown future agents

Compatibility statement:

> If the agent can execute shell commands, it can potentially use the CLI. If it supports JavaScript tools, it can use the JS API; future serverless integration depends on the selected provider and its verified adapter.

This is an architectural compatibility claim, not an E2E certification claim.

## Verification matrix

Maintain a table in releases:

| Agent | Agent version | Integration | OS | Package version | Result | Evidence |
|---|---|---|---|---|---|---|

Only rows with successful E2E evidence should receive a Verified badge/status.

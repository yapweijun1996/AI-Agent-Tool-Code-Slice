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
MCP
agent-specific Skill / Extension / Custom Tool
```

Agent-specific adapters must not contain independent slicing logic.

## Codex CLI

Planned progression:

1. CLI:
   ```bash
   code-slice outline src/app.ts --json
   code-slice symbol src/app.ts calculateTotal --json
   ```
2. optional local stdio MCP;
3. `integrations/codex/SKILL.md` with usage policy.

Recommended Skill behavior:

- use Code Slice for large source files or known symbol targets;
- call outline first when target symbol is unknown;
- fall back to normal reads if unsupported/ambiguous;
- never treat Code Slice output as proof of runtime behavior.

Status at documentation creation: **Planned**, not verified.

## Claude Code

Primary: shell/CLI.

Enhanced: local MCP configuration.

Keep permission requirements read-only where platform capabilities permit.

Status: Planned.

## Gemini CLI

Primary: shell/CLI.

Enhanced:

- local stdio MCP;
- Gemini CLI Extension packaging instructions and MCP config.

Status: Planned.

## OpenCode

Primary: shell/CLI.

Enhanced options:

- MCP;
- thin custom tool wrapper importing Core.

Status: Planned.

## AGRUN

Preferred: JS API Host Tool.

AGRUN integration should call Core directly and return bounded JSON.

Status: Planned.

## VM-MCP

Preferred: execute installed CLI inside the authorized VM workspace.

Do not expand VM-MCP permissions simply to support Code Slice.

Status: Planned.

## Unknown future agents

Compatibility statement:

> If the agent can execute shell commands, it can potentially use the CLI. If it supports JavaScript tools or MCP, enhanced integration is possible.

This is an architectural compatibility claim, not an E2E certification claim.

## Verification matrix

Maintain a table in releases:

| Agent | Agent version | Integration | OS | Package version | Result | Evidence |
|---|---|---|---|---|---|---|

Only rows with successful E2E evidence should receive a Verified badge/status.

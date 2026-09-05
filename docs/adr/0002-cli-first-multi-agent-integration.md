# ADR 0002: CLI-First Multi-Agent Integration

Status: Superseded by ADR 0004 for future integration direction; CLI/JS API
decisions remain in force.

## Context

Codex CLI, Claude Code, Gemini CLI, OpenCode, and future agents expose different integration systems. Tying Core to one agent creates churn.

## Decision

Use CLI + stable JSON as the lowest-common integration.

Add JS API for direct hosts. Do not make Core depend on an agent protocol;
future serverless delivery must remain a separate thin adapter.

Agent-specific Skills/Extensions/custom tools stay thin.

## Consequences

- the project remains agent-neutral;
- most shell-capable agents can use V0.1;
- enhanced integrations can evolve independently;
- compatibility must still be E2E verified per agent/version.

## Public wording

Use:

> Works with AI coding agents that can use shell commands or JavaScript. A
> future serverless adapter is a separate planned integration.

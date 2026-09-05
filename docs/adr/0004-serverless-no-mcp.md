# ADR 0004: Serverless Adapter, No MCP Server

Status: Accepted

## Context

The project needs to remain small, local-first, and usable by coding agents
without a resident process. An MCP server would add a protocol and lifecycle
boundary that is not part of the product direction. A future cloud or
provider-managed function may still be useful, but it must not move network
or source-upload behavior into Core implicitly.

## Decision

Do not build or publish an MCP server or MCP/stdio adapter.

Keep the CLI and JavaScript API as the current integration surfaces. If a
serverless capability is added, implement it as a separate stateless wrapper
around the same Core API, with an explicit source-input, authentication,
privacy, size, timeout, and logging contract.

The serverless provider remains undecided until those constraints and the
deployment target are specified.

## Consequences

- No `src/mcp/` module, MCP tool surface, or resident daemon is required.
- Core remains local-only, read-only, deterministic, and offline-capable.
- A remote/serverless invocation must receive an explicitly authorized source
  representation; it cannot assume access to the caller's local path.
- Serverless and agent-specific wrappers remain thin adapters and must reuse
  Core output and error contracts.

## Public wording

Use:

> Works with AI coding agents that can use shell commands or JavaScript. A
> future serverless adapter is a separate planned integration.

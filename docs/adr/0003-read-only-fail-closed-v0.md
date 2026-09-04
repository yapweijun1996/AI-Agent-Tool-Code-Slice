# ADR 0003: V0.x Is Read-Only and Fail-Closed

Status: Accepted.

## Context

AI agents may treat structured tool output as high-confidence evidence. Guessing an ambiguous symbol or modifying source would create disproportionate risk.

## Decision

V0.x:

- reads source only;
- does not edit or execute project code;
- fails on ambiguity;
- returns candidates;
- surfaces parse uncertainty;
- never invents dynamic names.

## Consequences

The tool can be adopted with a smaller permission surface.

Users/agents must explicitly fall back to normal investigation when the exact slice cannot be established.

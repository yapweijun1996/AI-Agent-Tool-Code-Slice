# Product Specification

## Product

**Agent Code Slice**

Tagline:

> Precise, language-aware code context for AI coding agents.

## Problem

Coding agents often consume entire source files to answer a narrow question such as:

- "show me `calculateTotal`";
- "what function contains line 382?";
- "give me the `qInvoice` query";
- "what top-level symbols are in this file?"

This creates unnecessary context usage and can make navigation less precise.

## Goal

Provide a deterministic local utility that returns the smallest correct syntactic code unit required for the requested selector.

## Primary users

- AI coding agents;
- developers using AI coding agents;
- agent runtimes and serverless function consumers;
- local developer tooling.

## Target consumers

- Codex CLI;
- Claude Code;
- Gemini CLI;
- OpenCode;
- AGRUN;
- VM-MCP;
- any agent/runtime able to invoke shell commands or JavaScript.

## Product statement

Do not say:

> Supports all AI agents.

Use:

> Works with AI coding agents that can use shell commands or JavaScript. A
> future serverless adapter is a separate planned integration.

## Core use cases

### File outline

```bash
code-slice outline src/app.ts --json
```

Return a bounded structural inventory.

### Symbol slice

```bash
code-slice symbol src/app.ts calculateTotal --json
```

Return the exact resolved symbol. If ambiguous, return candidates.

### Line container

```bash
code-slice line src/app.ts 382 --json
```

Return the best supported syntactic container for that line.

### Range expansion

```bash
code-slice range src/app.ts 380:390 --expand --json
```

Expand a line range to the minimal supported container(s).

## V0.1 planned languages

- JavaScript;
- TypeScript / TSX;
- Python;
- CFML / CFScript / CFQuery.

CFML is a first-class differentiator because one `.cfm` can contain multiple embedded languages, but CFML must never become the product-wide special case.

## Functional requirements

### F1 — Language detection

Determine language from file extension and adapter rules. If detection is uncertain, fail with `LANGUAGE_AMBIGUOUS`.

### F2 — Outline

Return normalized symbols with:

- kind;
- name where available;
- language;
- range;
- parent/container relation when available;
- signature when reliably derivable.

### F3 — Symbol resolution

Resolve symbol names according to the language adapter.

No silent first-match behavior.

### F4 — Line resolution

Resolve an exact line to the minimal supported enclosing syntactic unit.

### F5 — Range expansion

Expand a requested range deterministically.

### F6 — Stable JSON

All machine consumers use a versioned envelope and error model.

### F7 — Diagnostics

Parser warnings are returned explicitly. Malformed source must not be silently treated as fully valid.

### F8 — Capabilities

Expose language and feature support so agents can decide whether to use the tool or fall back.

## Non-functional requirements

- local execution;
- no required network;
- no required hosted service;
- no required account/API key;
- read-only;
- deterministic;
- cross-platform Node/npm install;
- bounded output;
- fail-closed ambiguity;
- reproducible grammar packaging.

## Non-goals V0.1

- semantic repository search;
- embeddings;
- RAG;
- LLM summarization;
- code editing;
- formatter;
- linter;
- test runner;
- repository index;
- caller/callee graph;
- Git operations;
- autonomous agent;
- MCP server or MCP transport;
- persistent resident server;
- remote source processing without an explicit serverless privacy contract.

## Success metrics

Metrics must be measured on frozen fixtures.

Primary:

- exact requested-symbol selection accuracy;
- range boundary accuracy;
- ambiguity precision;
- invented-symbol rate = 0;
- JSON schema validity;
- context reduction versus full-file read.

Operational:

- parser startup latency;
- parse latency by file size;
- package/install reliability;
- grammar load success;
- cross-platform smoke success.

## Definition of Done V0.1

See README and `docs/TESTING_GOLDEN_EVAL.md`.

No feature is "Verified" until evidence exists for the declared version and environment.

# Testing and Golden Eval

## Principle

The project must prove:

> Less context, same required code evidence.

Do not evaluate only whether output "looks useful."

## Test layers

### Unit

- path/range validation;
- selector validation;
- normalized kind mapping;
- error mapping;
- JSON serialization;
- output limits.

### Grammar load

Every packaged WASM grammar:

- loads;
- reports expected language identity;
- matches recorded hash;
- parses a minimal fixture.

### Language certification

Per language:

- outline;
- symbol;
- line;
- range;
- nested container;
- overloaded/ambiguous symbol;
- malformed source;
- comments/strings containing fake syntax;
- Unicode.

### Mixed-language

CFML first:

- CFML host;
- CFScript;
- CFQuery;
- JavaScript script region;
- malformed injection;
- dynamic query name.

## Frozen Golden Eval

Each case stores:

```json
{
  "id": "ts-symbol-001",
  "file": "fixtures/typescript/basic.ts",
  "operation": "symbol",
  "selector": {
    "name": "calculateTotal"
  },
  "expected": {
    "kind": "function",
    "startLine": 10,
    "endLine": 14
  }
}
```

The candidate implementation must not redefine expected results after seeing failures without versioning/reviewing the evaluator.

**Implementation note (deviation):** the current test suite (`test/unit/*.test.ts`,
`node:test`) covers every layer above — unit, grammar load, per-language
certification (outline/symbol/line/range/nested/ambiguous/malformed/fake-syntax/
Unicode), and CFML mixed-language (host/CFScript/CFQuery/malformed
injection/dynamic query name) — but as TypeScript assertions against `src/core`,
not as declarative `{id, file, operation, selector, expected}` JSON cases run
through a separate evaluator. No such case-file format or runner exists yet.
The one documented exception not yet covered: a JavaScript `<script>` region
inside CFML (see `docs/LANGUAGE_SUPPORT_MATRIX.md` "Known limitations" — that
embedding isn't wired up at all yet, so there's nothing to certify). Building
the declarative runner this section describes remains open work.

## Metrics

### Exact target accuracy

Correct requested unit selected.

Target before V1.0: define from baseline; do not publish arbitrary percentages as facts before the suite exists.

### Boundary accuracy

Correct start/end line and byte range.

### Ambiguity precision

Ambiguous cases must not become guessed successes.

### Invented-symbol rate

Required: `0`.

### Context reduction

Compare returned code bytes/lines/tokens against full source.

### Parser warning integrity

Malformed fixtures must surface expected warning/error state.

### Schema validity

Every CLI/MCP JSON result validates against the published schema.

## Benchmark cohorts

At minimum:

- 5 KB;
- 50 KB;
- 500 KB;
- 1 MB where realistic.

Measure separately:

- cold grammar startup;
- warm parse;
- outline;
- symbol resolution.

## Cross-platform

Before stable release:

- Windows;
- macOS;
- Linux.

Record Node versions, architecture, and package version.

## Agent E2E

A separate suite tests real coding agents.

Example journey:

1. give the agent a large fixture;
2. ask for one symbol;
3. verify it invokes Code Slice where configured;
4. verify correct slice;
5. verify no unexpected write;
6. compare context/tool output against baseline.

Do not judge agent behavior and parser correctness as one metric. Separate them.

## Regression rule

Every parser defect fixed must preserve the original failing fixture.

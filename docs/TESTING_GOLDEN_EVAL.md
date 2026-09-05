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
- JavaScript `<script>` region;
- CSS `<style>` region;
- SQL-level CFQuery clauses/functions;
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

## Current declarative runner

The repository now runs frozen case files from `test/golden/cases/*.json` through
the public Core API. Run the evaluator directly with:

```bash
npm run test:golden
```

The same cases are also exercised by `npm test` through
`test/unit/golden-eval.test.ts`. Case files are loaded in deterministic filename
order and then evaluated in `id` order. A case failure reports its case ID and
does not rewrite or regenerate the expected result. Every actual envelope is
validated against `schemas/code-slice-result-v1.schema.json` before its case
assertions run.

The runner accepts the four delivery-level operations below. `symbol`, `line`,
and `range` are mapped to the corresponding Core `slice()` selector; `outline`
calls Core `outline()`.

```json
{
  "id": "ts-symbol-001",
  "file": "test/fixtures/typescript/basic.ts",
  "operation": "symbol",
  "selector": {
    "name": "calculateTotal"
  },
  "expected": {
    "kind": "function",
    "name": "calculateTotal",
    "startLine": 10,
    "endLine": 12,
    "codeIncludes": ["export function calculateTotal"]
  }
}
```

Success cases may assert `kind`, `name`, `embeddedLanguage`, `signature`, any
range fields, exact `code`, `codeIncludes`, envelope `warningCodes`, or an
outline's exact `symbols`/`symbolCount`. Failure cases set `"ok": false` and
assert `errorCode`, with optional `recoverable`, `candidateCount`, and
`warningCodes`. Files must be repository-relative and stay inside the
repository; malformed case definitions fail closed before execution.

The checked-in cases cover all current adapters, all four selector operations,
exact range text, CFML JavaScript/CSS embedding, SQL-level CFQuery symbols,
ambiguity, not-found behavior, and malformed-source warnings. Explicitly
unsupported/dynamic HTML region types are covered by the CFML unit fixture and
are skipped rather than guessed.

### Cross-platform evidence

CI run
[33888822744](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33888822744)
passed the then-current 12 cases on Windows, macOS, and Ubuntu with Node 20 and
Node 22. The run also passed the then-current 39-test unit suite, grammar
integrity check, CLI smoke test, and `npm pack --dry-run` step. The checked-in
set now has 16 cases and the unit suite has 47 tests. The latest CI run
[33936169516](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33936169516)
passed the current 16 cases, 47-test suite, grammar integrity check, CLI smoke
test, and `npm pack --dry-run` on all nine Windows/macOS/Ubuntu × Node 18.18.0/20/22
jobs. This covers the new CFML embedded JS/CSS/SQL paths and the declared Node
floor. Release CI run
[33937790994](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33937790994)
also passed the core checks and completed registry installation plus CFML
embedding verification on Windows, macOS, and Ubuntu with Node 20.

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

Every CLI result and future serverless JSON result validates against the
published schema.

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

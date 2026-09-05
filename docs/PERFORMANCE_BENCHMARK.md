# Performance Benchmark

Status: the reproducible benchmark runner is implemented. The checked-in
report is a local macOS evidence set; the CI workflow runs the same cohort on
Ubuntu, Windows, and macOS with Node 20 and uploads one artifact per job. Do
not treat the local report or a single CI artifact as a universal latency
promise. Regenerate via:

```bash
npm run benchmark:fixtures && npm run build && npm run --silent benchmark
```

The runner covers every current host adapter (JavaScript, TypeScript, TSX,
Python, and CFML), all four documented sizes, grammar/fixture hashes, cold
CLI and warm API paths, engine phases, output/context reduction, and a
post-operation RSS observation.

## Question

Is `web-tree-sitter` WASM fast enough for interactive single-file AI agent navigation?

## Compare

- Agent Code Slice WASM engine;
- optional native prototype if created;
- raw full-file read as context baseline;
- structural navigation competitor(s) such as ast-grep where comparable.

## Inputs

Per initial language:

- small ~5 KB;
- medium ~50 KB;
- large ~500 KB;
- stress ~1 MB.

Use fixed fixtures and publish fixture hashes.

## Measurements

- process startup;
- Tree-sitter initialization;
- grammar load;
- parse;
- outline extraction;
- exact symbol extraction;
- peak memory where practical;
- output bytes/lines;
- context-reduction ratio.

The benchmark has a correctness gate before it emits a report: every fixture
must parse without a recovery error, `fn0` must be present, CLI JSON and stderr
must be clean, and cold/warm result envelopes must be byte-for-byte equal.

## Cold vs warm

Report both:

- cold first invocation;
- warm same-process invocation.

Do not mix them into one average.

## Acceptance

Do not invent a latency threshold before baseline measurement.

V0.1 gate should be evidence-driven:

- no pathological hangs on supported fixture sizes;
- interactive latency is documented;
- any unsupported size is bounded by explicit max input policy;
- WASM/native tradeoff is reported honestly.

## Reproducibility

Benchmark output should record:

- OS;
- architecture;
- Node version;
- package commit/version;
- grammar hashes;
- fixture hashes;
- repetitions;
- command.

Cold samples run through `test/benchmark/cold-worker.mjs`. Each worker starts a
fresh CLI process for every repetition, while keeping the long-lived report
process from accumulating WASM child-process teardown state. On Node 23 and
later the benchmark adds the recorded `--no-maglev` runtime flag because the
current macOS 26 host can otherwise leave repeated WASM CLI children in V8's
background compilation queue. This is a benchmark-harness safeguard for that
runtime, not a product runtime flag; supported CI Node 20 jobs use no extra
flag.

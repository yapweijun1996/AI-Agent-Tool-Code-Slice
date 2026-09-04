# Performance Benchmark Plan

Status: benchmark design, with an initial single-machine JavaScript result
set — see [PERFORMANCE_BENCHMARK_RESULTS.md](PERFORMANCE_BENCHMARK_RESULTS.md).
That pass covers only the JavaScript adapter, one OS/arch, and three of the
four cohort sizes (no ~1 MB stress case yet); it is evidence toward this
plan, not a completed cross-platform benchmark. Regenerate via `npm run
benchmark:fixtures && npm run benchmark`.

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

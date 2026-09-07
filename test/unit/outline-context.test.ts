import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outline } from "../../src/core/index.js";
import { DEFAULT_COMPACT_OUTLINE_SYMBOLS } from "../../src/core/limits.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const benchmarkTs = path.join(repoRoot, "test", "fixtures", "benchmark", "typescript", "50kb.ts");

function resultOf(envelope: Awaited<ReturnType<typeof outline>>) {
  if (!envelope.ok) assert.fail(`expected success, got ${envelope.error.code}: ${envelope.error.message}`);
  return envelope.result as {
    symbols: Array<Record<string, unknown>>;
    page: {
      total: number;
      returned: number;
      offset: number;
      limit: number;
      truncated: boolean;
      hasMore: boolean;
      nextOffset?: number;
    };
  };
}

test("compact outline is discovery-only and bounded below source context by default", async () => {
  const sourceBytes = readFileSync(benchmarkTs).byteLength;
  const full = await outline({ file: benchmarkTs });
  const compact = await outline({ file: benchmarkTs, compact: true });
  const fullResult = resultOf(full);
  const compactResult = resultOf(compact);

  const fullBytes = Buffer.byteLength(JSON.stringify(full), "utf8");
  const compactBytes = Buffer.byteLength(JSON.stringify(compact), "utf8");
  assert.ok(fullBytes > sourceBytes, "fixture should reproduce full-outline context amplification");
  assert.ok(compactBytes < sourceBytes, "default compact page should stay smaller than the source fixture");
  assert.ok(compactBytes < fullBytes / 2, "compact discovery should materially reduce full-outline context");

  assert.equal(compactResult.page.limit, DEFAULT_COMPACT_OUTLINE_SYMBOLS);
  assert.equal(compactResult.page.returned, DEFAULT_COMPACT_OUTLINE_SYMBOLS);
  assert.equal(compactResult.page.offset, 0);
  assert.equal(compactResult.page.hasMore, true);
  assert.equal(compactResult.page.nextOffset, DEFAULT_COMPACT_OUTLINE_SYMBOLS);
  assert.equal(compactResult.page.truncated, true);
  assert.equal(fullResult.page.offset, 0);

  const first = compactResult.symbols[0]!;
  assert.equal(typeof first.kind, "string");
  assert.ok("name" in first);
  assert.equal("nativeKind" in first, false);
  assert.equal("signature" in first, false);
  const range = first.range as Record<string, unknown>;
  assert.deepEqual(Object.keys(range).sort(), ["endLine", "startLine"]);
});

test("compact outline pagination is deterministic and exposes structured page metadata", async () => {
  const first = resultOf(await outline({ file: benchmarkTs, compact: true, maxSymbols: 25, offset: 0 }));
  assert.deepEqual(first.page, {
    total: first.page.total,
    returned: 25,
    offset: 0,
    limit: 25,
    truncated: true,
    hasMore: true,
    nextOffset: 25,
  });

  const second = resultOf(
    await outline({ file: benchmarkTs, compact: true, maxSymbols: 25, offset: first.page.nextOffset }),
  );
  assert.equal(second.page.offset, 25);
  assert.equal(second.page.returned, 25);
  assert.equal(second.page.total, first.page.total);
  assert.equal(second.page.nextOffset, 50);

  const firstEnd = (first.symbols.at(-1)!.range as { endLine: number }).endLine;
  const secondStart = (second.symbols[0]!.range as { startLine: number }).startLine;
  assert.ok(secondStart >= firstEnd, "pages must preserve the stable source-order traversal");
  assert.notDeepEqual(second.symbols, first.symbols);
});

test("outline offset is applied after filters and fails closed when malformed", async () => {
  const first = resultOf(await outline({ file: benchmarkTs, kind: "function", compact: true, maxSymbols: 5, offset: 0 }));
  const next = resultOf(await outline({ file: benchmarkTs, kind: "function", compact: true, maxSymbols: 5, offset: 5 }));
  assert.equal(first.page.total, next.page.total);
  assert.equal(first.page.returned, 5);
  assert.equal(next.page.returned, 5);
  assert.ok(first.symbols.every((symbol) => symbol.kind === "function"));
  assert.ok(next.symbols.every((symbol) => symbol.kind === "function"));


  const zeroPage = resultOf(await outline({ file: benchmarkTs, compact: true, maxSymbols: 0, offset: 0 }));
  assert.equal(zeroPage.page.returned, 0);
  assert.equal(zeroPage.page.hasMore, true);
  assert.equal(zeroPage.page.truncated, true);
  assert.equal(zeroPage.page.nextOffset, undefined, "zero-sized pages must not expose a non-progressing cursor");

  const invalid = await outline({ file: benchmarkTs, compact: true, offset: -1 });
  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.equal(invalid.error.code, "INVALID_ARGUMENT");
});

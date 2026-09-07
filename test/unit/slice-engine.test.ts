import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSymbolSelector } from "../../src/core/slice-engine.js";
import type { CodeSymbol } from "../../src/schema/types.js";

function symbol(name: string, startByte: number, parentName: string | null = null): CodeSymbol {
  return {
    kind: "variable",
    nativeKind: "test",
    name,
    language: "test",
    range: {
      startLine: 1,
      startColumn: startByte + 1,
      endLine: 1,
      endColumn: startByte + 2,
      startByte,
      endByte: startByte + 1,
    },
    parent: parentName
      ? {
          kind: "class",
          name: parentName,
          range: {
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 100,
            startByte: 0,
            endByte: 99,
          },
        }
      : null,
  };
}

test("literal dotted symbol names take precedence over Owner.member fallback", () => {
  const literal = symbol("variables.cache", 10);
  const qualifiedMember = symbol("cache", 20, "variables");
  const resolved = resolveSymbolSelector(
    [literal, qualifiedMember],
    { type: "symbol", name: "variables.cache" },
  );
  assert.equal(resolved, literal);
});

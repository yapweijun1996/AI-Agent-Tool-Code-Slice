import { test } from "node:test";
import assert from "node:assert/strict";
import { WasmEngine } from "../../src/engine/wasm-engine.js";

test("withParse releases the native tree after the visitor settles", async () => {
  const engine = new WasmEngine();
  const loaded = await engine.loadLanguage("javascript");
  let tree: { readonly rootNode: { readonly type: string } | null } | undefined;

  const rootType = await engine.withParse("function example() {}", loaded, ({ tree: parsedTree }) => {
    tree = parsedTree;
    return parsedTree.rootNode.type;
  });

  assert.equal(rootType, "program");
  assert.ok(tree);
  assert.throws(() => tree!.rootNode!.type);
});

test("withParse releases the native tree when the visitor throws", async () => {
  const engine = new WasmEngine();
  const loaded = await engine.loadLanguage("javascript");
  let tree: { readonly rootNode: { readonly type: string } | null } | undefined;

  await assert.rejects(
    engine.withParse("function failingVisitor() {}", loaded, ({ tree: parsedTree }) => {
      tree = parsedTree;
      throw new Error("visitor failed");
    }),
    /visitor failed/,
  );

  assert.ok(tree);
  assert.throws(() => tree!.rootNode!.type);
});

test("concurrent first grammar loads resolve to one cached language identity", async () => {
  const engine = new WasmEngine();
  const loaded = await Promise.all(
    Array.from({ length: 8 }, () => engine.loadLanguage("javascript")),
  );
  assert.deepEqual(
    loaded.map((language) => ({ id: language.id, version: language.version })),
    Array.from({ length: 8 }, () => ({ id: "javascript", version: "0.25.0" })),
  );
});

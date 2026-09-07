import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGoldenCases, loadGoldenCases, parseGoldenCase } from "../golden/evaluator.js";

test("declarative Golden Eval cases pass through the public Core API", async () => {
  const cases = loadGoldenCases();
  assert.equal(cases.length, 23);
  assert.deepEqual(cases.map((goldenCase) => goldenCase.id), [...cases].map((goldenCase) => goldenCase.id).sort());

  const result = await evaluateGoldenCases(cases);
  assert.deepEqual(result.failures, []);
  assert.equal(result.passed, result.total);
});

test("Golden Eval case parsing fails closed for unsupported operations", () => {
  assert.throws(
    () =>
      parseGoldenCase({
        id: "invalid-operation",
        file: "test/fixtures/javascript/basic.js",
        operation: "search",
        expected: { kind: "function" },
      }),
    /operation must be one of: outline, symbol, line, range/,
  );
});

test("Golden Eval case parsing rejects escaped files and error-only success fields", () => {
  assert.throws(
    () =>
      parseGoldenCase({
        id: "escaped-file",
        file: "../outside.js",
        operation: "outline",
        expected: { symbolCount: 0 },
      }),
    /case file must stay inside the repository/,
  );
  assert.throws(
    () =>
      parseGoldenCase({
        id: "invalid-success-fields",
        file: "test/fixtures/javascript/basic.js",
        operation: "outline",
        expected: { symbolCount: 0, candidateCount: 1 },
      }),
    /successful cases may not declare recoverable or candidateCount/,
  );
});

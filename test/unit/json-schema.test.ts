import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { capabilities, outline, slice } from "../../src/core/index.js";
import { buildCliErrorEnvelope } from "../../src/schema/envelope.js";
import { CodeSliceError } from "../../src/schema/errors.js";
import { finalizeResultEnvelope, MIN_OUTPUT_BYTES } from "../../src/core/limits.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, "schemas", "code-slice-result-v1.schema.json"), "utf8"),
);

// The schema declares "$schema": ".../draft/2020-12/schema", which ajv's
// default export does not bundle a meta-schema for — the dedicated 2020-12
// entry point does.
const ajv = new Ajv2020({ strict: false });
const validate = ajv.compile(schema);
const cliSchema = JSON.parse(
  readFileSync(path.join(repoRoot, "schemas", "code-slice-result-v1.1.schema.json"), "utf8"),
);
const validateCli = ajv.compile(cliSchema);

function assertValidEnvelope(envelope: unknown, label: string): void {
  const valid = validate(envelope);
  assert.ok(valid, `${label} did not validate against schemas/code-slice-result-v1.schema.json: ${ajv.errorsText(validate.errors)}`);
}

const jsFixture = path.join(repoRoot, "test", "fixtures", "javascript", "basic.js");

test("capabilities envelope validates against the v1 schema", async () => {
  assertValidEnvelope(await capabilities(), "capabilities");
});

test("outline success envelope validates against the v1 schema", async () => {
  assertValidEnvelope(await outline({ file: jsFixture }), "outline success");
});

test("slice success envelope validates against the v1 schema", async () => {
  assertValidEnvelope(
    await slice({ file: jsFixture, selector: { type: "symbol", name: "calculateTotal" } }),
    "slice success",
  );
});

test("slice ambiguous-error envelope validates against the v1 schema", async () => {
  const envelope = await slice({ file: jsFixture, selector: { type: "symbol", name: "save" } });
  assert.equal(envelope.ok, false);
  assertValidEnvelope(envelope, "slice ambiguous error");
});

test("slice not-found-error envelope validates against the v1 schema", async () => {
  const envelope = await slice({ file: jsFixture, selector: { type: "symbol", name: "nope" } });
  assert.equal(envelope.ok, false);
  assertValidEnvelope(envelope, "slice not-found error");
});

test("file-not-found error envelope validates against the v1 schema", async () => {
  const envelope = await outline({ file: path.join(repoRoot, "test", "fixtures", "javascript", "does-not-exist.js") });
  assert.equal(envelope.ok, false);
  assertValidEnvelope(envelope, "file-not-found error");
});

test("the checked-in example fixtures all validate against the v1 schema", () => {
  for (const name of ["success-symbol.json", "error-symbol-ambiguous.json", "cfml-query-slice.json"]) {
    const example = JSON.parse(readFileSync(path.join(repoRoot, "examples", name), "utf8"));
    assertValidEnvelope(example, `examples/${name}`);
  }
});

test("CLI usage error envelope validates against the additive v1.1 schema", () => {
  const envelope = buildCliErrorEnvelope(new CodeSliceError("INVALID_ARGUMENT", "Unknown flag --typo"));
  assert.equal(validateCli(envelope), true, ajv.errorsText(validateCli.errors));
});

test("bounded output-limit fallback validates against the v1 schema", () => {
  const oversized = buildErrorEnvelopeForTest();
  const envelope = finalizeResultEnvelope(oversized, MIN_OUTPUT_BYTES);
  assert.equal(envelope.ok, false);
  assertValidEnvelope(envelope, "bounded output-limit fallback");
  assert.ok(Buffer.byteLength(JSON.stringify(envelope), "utf8") <= MIN_OUTPUT_BYTES);
});

function buildErrorEnvelopeForTest() {
  return {
    schemaVersion: "1.0" as const,
    ok: false as const,
    operation: "slice" as const,
    file: "x".repeat(10_000),
    error: {
      code: "SYMBOL_AMBIGUOUS",
      message: "x".repeat(10_000),
      recoverable: true,
      candidates: [{ name: "y".repeat(10_000) }],
    },
    warnings: [],
  };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadFile } from "../../src/core/file-loader.js";
import { CodeSliceError } from "../../src/schema/errors.js";

function tempRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), "agent-code-slice-loader-"));
}

function assertErrorCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => error instanceof CodeSliceError && error.code === code);
}

test("root containment rejects lexical escapes before filesystem probing", () => {
  const root = tempRoot();
  const sibling = `${root}-outside`;
  mkdirSync(sibling);
  try {
    const missingOutsideFile = path.join(path.dirname(root), path.basename(sibling), "missing.js");
    assertErrorCode(() => loadFile(missingOutsideFile, { root }), "FILE_OUTSIDE_ROOT");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(sibling, { recursive: true, force: true });
  }
});

test("root containment rejects a symlink or junction that resolves outside the root", () => {
  const workspace = tempRoot();
  const root = path.join(workspace, "allowed");
  const outside = path.join(workspace, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  const outsideFile = path.join(outside, "secret.js");
  const link = path.join(root, "linked");
  writeFileSync(outsideFile, "export const secret = true;\n", "utf8");

  try {
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    assertErrorCode(() => loadFile(path.join(link, "secret.js"), { root }), "FILE_OUTSIDE_ROOT");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("file loading enforces byte limits, rejects invalid UTF-8, and stays read-only", () => {
  const root = tempRoot();
  const validFile = path.join(root, "valid.js");
  const invalidFile = path.join(root, "invalid.js");
  const source = "export const value = 1;\n";
  writeFileSync(validFile, source, "utf8");
  writeFileSync(invalidFile, Buffer.from([0xff, 0xfe, 0xfd]));

  try {
    const before = readFileSync(validFile);
    const loaded = loadFile(validFile, { root, maxBytes: Buffer.byteLength(source) });
    assert.equal(loaded.source, source);
    assert.deepEqual(readFileSync(validFile), before);
    assertErrorCode(() => loadFile(validFile, { root, maxBytes: 1 }), "FILE_TOO_LARGE");
    assertErrorCode(() => loadFile(invalidFile, { root }), "ENCODING_UNSUPPORTED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("file loading preserves a leading UTF-8 BOM for byte-accurate coordinates", () => {
  const filePath = path.join(process.cwd(), "test", "fixtures", "javascript", "utf8-bom.js");
  const raw = readFileSync(filePath);
  const loaded = loadFile(filePath);

  assert.deepEqual(raw.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]));
  assert.equal(loaded.source.charCodeAt(0), 0xfeff);
});

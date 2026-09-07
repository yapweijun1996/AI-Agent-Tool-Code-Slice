# JSON Schema Contract

Status: Implemented: Core envelopes use v1.0; CLI usage errors use additive
v1.1. Hardening commit `1712f17` passed cross-platform CI run
[33972164494](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33972164494).

Canonical machine output is versioned independently from package internals.

Schema:

```text
schemas/code-slice-result-v1.schema.json
schemas/code-slice-result-v1.1.schema.json
```

## Success envelope

```json
{
  "schemaVersion": "1.0",
  "ok": true,
  "operation": "slice",
  "file": "src/app.ts",
  "language": "typescript",
  "result": {
    "kind": "function",
    "nativeKind": "function_declaration",
    "name": "calculateTotal",
    "range": {
      "startLine": 42,
      "startColumn": 1,
      "endLine": 87,
      "endColumn": 2,
      "startByte": 921,
      "endByte": 1820
    },
    "signature": "calculateTotal(qty: number, price: number)",
    "code": "..."
  },
  "warnings": [],
  "meta": {
    "engine": "web-tree-sitter",
    "parserMs": 12
  }
}
```

## Error envelope

```json
{
  "schemaVersion": "1.0",
  "ok": false,
  "operation": "slice",
  "file": "src/app.ts",
  "error": {
    "code": "SYMBOL_AMBIGUOUS",
    "message": "Symbol 'save' matched multiple supported symbols.",
    "recoverable": true,
    "candidates": [
      {
        "kind": "method",
        "name": "save",
        "range": {
          "startLine": 42,
          "endLine": 55
        }
      }
    ]
  },
  "warnings": []
}
```

## Structured recovery details

Errors may include an optional `error.details` object. It is additive metadata
for machine recovery and does not replace the stable `error.code`. For example,
a range that overlaps the file but ends past EOF can return:

```json
{
  "code": "RANGE_INVALID",
  "recoverable": true,
  "details": {
    "requested": { "startLine": 10, "endLine": 90 },
    "available": { "startLine": 1, "endLine": 89 },
    "suggestion": { "startLine": 10, "endLine": 89 }
  }
}
```

`OUTPUT_LIMIT_EXCEEDED` from `maxLines` may similarly include the requested
line budget, resolved line count, and resolved range. Consumers should branch
on `error.code` first and treat `details` as optional recovery metadata.

## Error codes

Current stable codes:

- `FILE_NOT_FOUND`
- `INVALID_ARGUMENT`
- `FILE_OUTSIDE_ROOT`
- `FILE_TOO_LARGE`
- `ENCODING_UNSUPPORTED`
- `LANGUAGE_UNSUPPORTED`
- `LANGUAGE_AMBIGUOUS`
- `GRAMMAR_LOAD_FAILED`
- `PARSE_FAILED`
- `SYMBOL_NOT_FOUND`
- `SYMBOL_AMBIGUOUS`
- `LINE_OUT_OF_RANGE`
- `RANGE_INVALID`
- `OUTPUT_LIMIT_EXCEEDED`
- `INTERNAL_ERROR`

## Serialized output budget

Core uses an 8 MiB default serialized JSON envelope limit. A caller may narrow
`maxOutputBytes` to any value from 256 bytes through 8 MiB. The limit applies
to both success and error envelopes, and is measured on `JSON.stringify()`
output in UTF-8; the CLI's final newline is a transport delimiter and is not
part of the envelope budget.

When a valid operation cannot fit its requested budget, the complete result is
replaced by a compact v1 `OUTPUT_LIMIT_EXCEEDED` error envelope. It omits
`file`, `candidates`, and other dynamic fields so the fallback itself fits
within the minimum budget. Fields are never silently truncated. If the budget
value is below 256 bytes or otherwise malformed, the request returns
`INVALID_ARGUMENT` using the process-wide hard ceiling for that validation
error.

## Lines and columns

Recommended public convention:

- lines are 1-based;
- columns are 1-based;
- byte offsets are 0-based UTF-8 byte offsets.

This convention is frozen and covered by unit, Golden Eval, and agent-facing
contract tests.

## Diagnostics

Warnings represent evidence such as:

- recoverable parse errors;
- dynamic symbol names;
- partial mixed-language injection;
- truncated outline;
- an explicitly clamped EOF range (`RANGE_CLAMPED`).

Warnings must not silently convert a failed selector into a guessed success.

## Compatibility

Adding optional fields is backward-compatible only when consumers can safely ignore them.

Renaming/removing fields or changing index conventions requires a schema-version decision.

CLI usage errors are the only current v1.1 delivery envelope. They use
`schemaVersion: "1.1"`, `operation: "cli"`, `ok: false`, and the same stable
error shape as v1.0. Core/API validation errors remain v1.0 envelopes with
their operation (`outline` or `slice`). Consumers that invoke the CLI should
accept both schema versions and branch on `operation` before reading the
operation-specific result payload.

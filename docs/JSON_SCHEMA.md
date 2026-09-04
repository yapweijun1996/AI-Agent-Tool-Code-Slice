# JSON Schema Contract

Status: Planned V0.1.

Canonical machine output is versioned independently from package internals.

Schema:

```text
schemas/code-slice-result-v1.schema.json
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

## Error codes

Stable V0.1 target:

- `FILE_NOT_FOUND`
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

## Lines and columns

Recommended public convention:

- lines are 1-based;
- columns are 1-based;
- byte offsets are 0-based UTF-8 byte offsets.

This convention must be frozen in tests before package publication.

## Diagnostics

Warnings represent evidence such as:

- recoverable parse errors;
- dynamic symbol names;
- partial mixed-language injection;
- truncated outline.

Warnings must not silently convert a failed selector into a guessed success.

## Compatibility

Adding optional fields is backward-compatible only when consumers can safely ignore them.

Renaming/removing fields or changing index conventions requires a schema-version decision.

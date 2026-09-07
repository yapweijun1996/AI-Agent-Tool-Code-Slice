# Examples

These examples illustrate planned contracts. They are not evidence that the package is implemented.

## TypeScript symbol

Input:

```bash
code-slice symbol src/math.ts calculateTotal --json
```

Expected shape:

```json
{
  "schemaVersion": "1.0",
  "ok": true,
  "operation": "slice",
  "file": "src/math.ts",
  "language": "typescript",
  "result": {
    "kind": "function",
    "name": "calculateTotal",
    "code": "export function calculateTotal(qty: number, price: number) {\n  return qty * price;\n}"
  },
  "warnings": []
}
```

## Python line

```bash
code-slice line app.py 73 --json
```

The result should identify the minimal supported enclosing function/class rather than return an arbitrary fixed line window.

## Ambiguous method

```bash
code-slice symbol UserService.java save --json
```

Expected error concept:

```json
{
  "ok": false,
  "error": {
    "code": "SYMBOL_AMBIGUOUS",
    "recoverable": true,
    "candidates": []
  }
}
```

No automatic first match.

## CFML query

```bash
code-slice symbol invoice.cfm qInvoice --kind query --json
```

Expected result records host and embedded language.

## Agent workflow

```text
1. Agent sees a 4000-line source file.
2. Agent runs `code-slice outline file --compact --json` and follows `result.page.nextOffset` only if needed.
3. Agent identifies the relevant symbol.
4. Agent runs `code-slice symbol file symbol --json`.
5. Agent reasons over the returned exact slice.
6. Agent falls back to normal file reads if unsupported or ambiguous.
```

Code Slice reduces navigation context. It does not replace broader investigation when surrounding code is required.

# CLI Contract

Status: Implemented for the current CLI; hardening commit `1712f17` passed
cross-platform CI run
[33972164494](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33972164494).
Registry installation remains separately evidenced for published releases.

Executable:

```text
code-slice
```

Package working name:

```text
agent-code-slice
```

The package is published as `agent-code-slice`; `code-slice` is its installed
executable name.

## Commands

### capabilities

```bash
code-slice capabilities --json
```

Returns supported operations, languages, extensions, parser engine, and schema versions.

### outline

```bash
code-slice outline <file> [--json]
```

Options:

```text
--kind <kind>
--max-symbols <n>
--language <id>
--root <path>
--max-bytes <n>
--max-output-bytes <n>
--json
```

`--max-symbols` is a safe integer from `0` through `50,000`; the default
outline result is limited to `10,000` entries and reports `OUTLINE_TRUNCATED`
when more symbols were found. `--max-bytes` defaults to `5,000,000` and may
not exceed `10,000,000`. `--max-output-bytes` defaults to `8 MiB` and may only
narrow that ceiling to a minimum of 256 bytes. Invalid values fail closed with
`INVALID_ARGUMENT`.

### symbol

```bash
code-slice symbol <file> <name> [--kind <kind>] [--json]
```

If multiple candidates match and no deterministic disambiguator exists:

- return `SYMBOL_AMBIGUOUS`;
- include bounded candidate metadata;
- do not choose the first result.

### line

```bash
code-slice line <file> <line> [--json]
```

Returns the minimal supported enclosing code unit.

### range

```bash
code-slice range <file> <start:end> [--expand] [--json]
```

Without `--expand`, returns the exact requested text. With `--expand`, returns
the minimal supported enclosing container.

## Global flags

```text
--json
--language <id>
--root <path>
--max-bytes <n>
--max-output-bytes <n>
--debug
--version
--help
```

## Machine output

When `--json` is active:

```text
stdout = exactly one JSON document
stderr = diagnostics only
```

Do not emit:

- logos;
- update notices;
- progress messages;
- debug logs;
- color sequences;

to stdout.

Core operation results use the v1.0 schema. CLI argument-shape failures (for
example unknown flags, missing values, or extra positional arguments) use the
additive v1.1 envelope with `operation: "cli"`; it has the same stable error
object and an empty warnings array. This keeps malformed CLI requests JSON
clean without changing the Core API's v1.0 operation envelopes.

The output budget applies to the complete Core JSON envelope, including error
envelopes. If a valid operation or its diagnostics exceed the requested
budget, the CLI returns a compact `OUTPUT_LIMIT_EXCEEDED` envelope without
truncating fields. The final stdout newline is a transport delimiter and does
not count toward `--max-output-bytes`. CLI usage errors use the default 8 MiB
safety ceiling because no valid operation budget exists yet.

`--help` and `--version` are human-readable flags and cannot be combined with
`--json`; the combination returns the v1.1 `INVALID_ARGUMENT` envelope so
stdout remains JSON-clean.

## Exit codes

Current:

| Exit | Meaning |
|---:|---|
| 0 | successful operation |
| 2 | invalid CLI arguments |
| 3 | file/root/input error |
| 4 | unsupported/ambiguous language |
| 5 | parse/grammar error |
| 6 | selector not found |
| 7 | selector ambiguous |
| 8 | output/resource limit |
| 1 | unexpected internal failure |

The JSON error code remains the primary machine semantic; numeric exit codes are stable coarse classes.

## File paths

- output should preserve the input path string and may additionally expose a normalized path;
- public JSON must not unexpectedly convert all paths to absolute paths unless the contract explicitly requests it;
- `--root` constrains readable paths.

## No implicit writes

CLI commands must not format, rewrite, or modify source files.

## Examples

```bash
code-slice symbol app.py calculate_total --json
code-slice symbol invoice.cfm qInvoice --kind query --json
code-slice line src/service.ts 382 --json
code-slice outline src/service.ts --max-symbols 500 --max-output-bytes 2000000 --json
```

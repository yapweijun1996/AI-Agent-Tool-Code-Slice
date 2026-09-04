# CLI Contract

Status: Planned V0.1 public contract.

Executable:

```text
code-slice
```

Package working name:

```text
agent-code-slice
```

Names remain provisional until npm/GitHub availability is confirmed.

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

Options planned:

```text
--kind <kind>
--max-symbols <n>
--language <id>
--json
```

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

Without `--expand`, range behavior should remain explicitly defined before implementation. Recommended V0.1: return exact text plus recognized containers; with `--expand`, return the minimal common supported container.

## Global flags

Planned:

```text
--json
--language <id>
--root <path>
--max-bytes <n>
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

## Exit codes

Proposed:

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
```

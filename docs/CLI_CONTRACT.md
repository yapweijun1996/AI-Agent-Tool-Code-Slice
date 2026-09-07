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
code-slice outline <file> [--top-level] [--include-locals] [--json]
```

Options:

```text
--kind <kind>
--max-symbols <n>
--language <id>
--root <path>
--max-bytes <n>
--max-output-bytes <n>
--top-level
--include-locals
--json
```

By default, `outline` suppresses local variable/function declarations nested
inside functions or methods so the structural inventory stays useful to an
agent. Class methods, CFML queries, and other non-local structural symbols are
not hidden. `--include-locals` restores those callable-local declarations.
`--top-level` returns only symbols whose normalized `parent` is null.

`--max-symbols` is a safe integer from `0` through `50,000`; the default
outline result is limited to `10,000` entries and reports `OUTLINE_TRUNCATED`
when more symbols were found. `--max-bytes` defaults to `5,000,000` and may
not exceed `10,000,000`. `--max-output-bytes` defaults to `8 MiB` and may only
narrow that ceiling to a minimum of 256 bytes. Invalid values fail closed with
`INVALID_ARGUMENT`.

### symbol

```bash
code-slice symbol <file> <name|Owner.member> [--kind <kind>] [--max-lines <n>] [--json]
```

A one-level qualified name such as `OwnerOAuthProvider.commit` is an additive
fallback: an exact literal symbol name wins first; otherwise the selector
filters a member by its normalized parent name before ambiguity resolution. It
does not guess a member when multiple matches still make the result ambiguous.

If multiple candidates match and no deterministic disambiguator exists:

- return `SYMBOL_AMBIGUOUS`;
- include bounded candidate metadata;
- do not choose the first result.

### line

```bash
code-slice line <file> <line> [--max-lines <n>] [--json]
```

Returns the minimal supported enclosing code unit.

### range

```bash
code-slice range <file> <start:end> [--expand|--smallest] [--clamp] [--max-lines <n>] [--json]
```

Without `--expand` or `--smallest`, returns the exact requested text. With
`--expand`, returns the minimal enclosing normalized symbol/container. With
`--smallest`, returns the smallest named Tree-sitter syntax node containing
the meaningful requested content; the result uses `kind: "block"` and exposes
the current parser node type in `nativeKind`. `nativeKind` is informational
and may change with a pinned grammar upgrade; stable consumers should branch
on normalized `kind` and use `range`/`code`. `--expand` and `--smallest` are
mutually exclusive.

If an overlapping range ends beyond EOF, the default remains fail-closed with
`RANGE_INVALID`. The error includes structured `details.requested`,
`details.available`, and (when safe) `details.suggestion`. `--clamp` applies
that safe EOF-end suggestion and emits `RANGE_CLAMPED`; it does not invent a
range when the requested start is itself outside the file.

For `symbol`, `line`, and `range`, `--max-lines <n>` fails closed with
`OUTPUT_LIMIT_EXCEEDED` when the resolved slice would exceed the line budget.
It never truncates source text or returns a syntactically partial symbol.

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
code-slice symbol src/oauth.ts OwnerOAuthProvider.commit --max-lines 120 --json
code-slice symbol invoice.cfm qInvoice --kind query --json
code-slice line src/service.ts 382 --max-lines 80 --json
code-slice range src/oauth.ts 920:940 --smallest --max-lines 120 --json
code-slice outline src/service.ts --top-level --max-symbols 500 --max-output-bytes 2000000 --json
```

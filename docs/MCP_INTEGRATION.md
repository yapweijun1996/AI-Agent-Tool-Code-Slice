# MCP Integration

Status: Planned for V0.2 unless pulled forward after Core/CLI proof.

## Principle

MCP is an adapter, not the product core.

```text
MCP call
  |
  v
MCP adapter
  |
  v
Core API
  |
  v
language adapter / parser
```

No parser or selector logic may live only in MCP.

## Transport

Primary local integration:

```text
stdio
```

Proposed command:

```bash
npx -y agent-code-slice mcp
```

No hosted MCP endpoint is required.

## Tool surface

Keep the tool count small:

### code_slice_capabilities

Returns supported languages, operations, schema version, and limits.

### code_slice_outline

Input:

```json
{
  "file": "src/app.ts",
  "language": "typescript"
}
```

### code_slice_get

Input uses a selector union:

```json
{
  "file": "src/app.ts",
  "selector": {
    "type": "symbol",
    "name": "calculateTotal"
  }
}
```

or:

```json
{
  "file": "src/app.ts",
  "selector": {
    "type": "line",
    "line": 382
  }
}
```

## Safety metadata

The server is intended to be:

- read-only;
- non-destructive;
- idempotent;
- local filesystem scoped.

MCP descriptions must not claim edit/build/test capabilities.

## Workspace boundary

MCP configuration should permit an allowed root/workspace. Requests outside it must fail closed.

## Output

MCP uses the same versioned JSON/result structures as Core where practical.

Do not invent a second incompatible response model.

## Context cost

Do not expose one MCP tool per language, selector kind, or symbol kind.

Bad:

```text
slice_js_function
slice_python_function
slice_cfml_query
slice_line
slice_method
...
```

Good:

```text
capabilities
outline
get
```

## Verification

An MCP integration is not Verified until:

- tool discovery passes;
- happy path passes;
- invalid inputs pass;
- ambiguity passes;
- root boundary passes;
- no-write behavior is confirmed;
- outputs match Core/CLI for the same frozen fixture.

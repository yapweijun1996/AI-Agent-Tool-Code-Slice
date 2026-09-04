# Security and Privacy Design

## Objective

Make the default Core safe to use on private source code without sending code to a hosted service.

## Local-first boundary

Normal slicing should require only:

- local Node.js runtime;
- local package files;
- local WASM grammars;
- the explicitly requested source file.

No normal slice should require:

- cloud inference;
- telemetry backend;
- database;
- account;
- API key;
- external source upload.

## Read-only boundary

V0.x should never:

- rewrite source;
- apply patches;
- run project code;
- run build/test commands;
- invoke package-manager scripts;
- evaluate dynamic CFML/JS/Python expressions;
- resolve runtime values by executing code.

## File-access boundary

Threats:

- `../` traversal;
- absolute paths;
- symlink escape;
- root confusion;
- overly broad MCP host filesystem.

Recommended:

- optional required root in managed-agent integrations;
- canonicalize path;
- validate requested target remains within root;
- define symlink policy explicitly;
- reject on uncertainty.

## Untrusted source

Source code is data, not instructions.

Do not:

- execute parser directives from source;
- interpret comments as tool instructions;
- fetch referenced URLs;
- load arbitrary dynamic grammars named by source content.

## Grammar supply chain

- pin grammar versions/revisions;
- record hashes;
- verify WASM integrity at release;
- avoid runtime downloading of grammars by default;
- keep grammar provenance in release manifest.

## Output safety

An agent may treat tool output as trusted evidence. Therefore:

- preserve exact code text;
- separate structured metadata from source text;
- never let source text inject extra top-level JSON fields;
- serialize JSON with a real serializer;
- bound candidate/output size;
- clearly mark truncation.

## Logging

Default diagnostics should not log source text.

Safe operational fields may include:

- language;
- file size;
- duration;
- result count;
- warning code;
- grammar hash/version.

Avoid logging absolute private paths by default in telemetry-like output.

## Network policy

Runtime should be able to function offline once installed.

Any future network feature requires a new design review and must not silently change the local-only privacy promise.

## MCP security

MCP remains read-only. A host's permissions do not grant Code Slice permission to become a write tool.

## Privacy claim wording

Good:

> Source parsing runs locally and the core product does not require source-code upload.

Avoid stronger absolute claims until package dependencies and telemetry behavior are audited.

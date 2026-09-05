# Serverless Integration

Status: Planned for V0.2; provider and deployment target are not selected.

## Boundary decision

Agent Code Slice will not provide an MCP server, an MCP/stdio transport, or a
long-running resident daemon. The current integration surfaces remain the
CLI and JavaScript API.

A future serverless adapter may expose the same Core operations as a
stateless request/response function. It must be a thin delivery wrapper and
must not duplicate language detection, parsing, symbol resolution, or slice
logic.

## Request model

A cloud function cannot safely resolve a caller's local filesystem path by
default. Before implementation, the adapter must choose and document one
explicit source model:

- source text plus a logical file name in the request; or
- an authenticated, explicitly scoped storage reference.

Uploading source code is a separate privacy and authorization decision. It is
not part of the local Core contract and must never be enabled implicitly by a
serverless wrapper.

## Required properties

- stateless per-request execution;
- same `capabilities`, `outline`, and `slice` contract as Core;
- same JSON envelope and stable error codes;
- read-only and bounded input/output;
- no project-code execution or arbitrary command execution;
- no source-code logging by default;
- no grammar downloads during a request;
- Core behavior remains usable offline and locally without the wrapper.

## Open decisions

- provider and deployment target;
- HTTP versus provider-native function events;
- source input and retention policy;
- authentication, authorization, quotas, and rate limits;
- file-size, timeout, and concurrency limits;
- cold-start and warm-instance performance targets;
- logging, regionality, and source-data deletion guarantees.

## Verification gate

The adapter is not Verified until it has:

- output parity with Core on the frozen fixtures;
- malformed, ambiguity, no-match, and boundary tests;
- package/grammar resolution tests in the target provider runtime;
- explicit source-data handling and no-log evidence;
- documented failure, timeout, and quota behavior.

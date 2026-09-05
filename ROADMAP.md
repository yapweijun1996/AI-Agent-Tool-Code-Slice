# Roadmap

Status: Design / pre-implementation.

## V0.1 — Core Slice Contract

Goal: prove precise local slicing with one stable multi-language contract.

Current evidence note: the declarative Golden Eval runner is implemented under
`test/golden/` with 16 frozen JSON cases and passes locally via
`npm run test:golden`. The latest CI run
[33936169516](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33936169516)
passed all 47 unit tests and 16 Golden cases on the Windows/macOS/Ubuntu ×
Node 18.18.0/20/22 matrix, including the CFML embedded JS/CSS/SQL paths. The
declared Node floor is now covered by CI. The earlier
run [33888822744](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33888822744)
remains the historical evidence for the original 12-case Golden set.
Release CI run
[33937790994](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33937790994)
also verified public-registry installation of `0.2.0` on Windows, macOS, and
Ubuntu with Node 20.

Planned:

- `web-tree-sitter` WASM engine;
- grammar registry and integrity metadata;
- JavaScript;
- TypeScript / TSX;
- Python;
- CFML / CFScript / CFQuery;
- `capabilities`;
- `outline`;
- symbol slice;
- line slice;
- range expansion;
- stable JSON schema v1;
- stable error codes;
- JS API;
- CLI;
- Golden Eval;
- Windows/macOS/Linux smoke.

Explicitly out:

- repository indexing;
- semantic search;
- LLM;
- edits;
- call graph;
- remote server requirement in Core;
- MCP server or MCP transport.

## V0.2 — Serverless Integration Layer

Planned:

- provider-neutral stateless serverless adapter over the Core API;
- explicit source-input, authentication, privacy, size, timeout, and logging contract;
- deployment target selection (provider TBD);
- Codex Skill pack;
- Claude Code setup guide;
- real Codex and Claude E2E compatibility evidence;
- Java / C# / Go / Rust / PHP adapters as evidence permits.

## V0.3 — Additional Integrations

Planned:

- Gemini CLI Extension;
- OpenCode custom tool;
- verified Gemini/OpenCode E2E;
- mixed-language expansion;
- parser cache/startup optimization;
- benchmark comparison with raw reads and structural navigation tools.

## V1.0 — Stable Compatibility Release

Candidate gates:

- stable CLI/JSON/API/serverless contract;
- frozen language certification suite;
- verified compatibility matrix;
- documented cross-platform installation;
- reproducible grammar build;
- package integrity checks;
- bounded performance targets based on measured baselines;
- security review;
- explicit license.

## Future / research

- optional native Tree-sitter engine;
- browser build;
- Vue/Svelte/PHP/JSP/Razor mixed-language adapters;
- related-test locator integration;
- symbol references/callers only if they can be made precise without turning the project into a repository intelligence platform.

No roadmap item is a compatibility claim until marked Verified with evidence.

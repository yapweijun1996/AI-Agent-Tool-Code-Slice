# Roadmap

Status: Design / pre-implementation.

## V0.1 — Core Slice Contract

Goal: prove precise local slicing with one stable multi-language contract.

Current evidence note: the declarative Golden Eval runner is implemented under
`test/golden/` with 12 frozen JSON cases and passes locally via
`npm run test:golden`. CI run
[33888822744](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/33888822744)
passed that command on the existing Windows/macOS/Linux × Node 20/22 matrix;
the additional evidence is now cross-platform recorded without changing any
language status label.

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
- remote server requirement;
- MCP production claim.

## V0.2 — Agent Integration Layer

Planned:

- local stdio MCP;
- 3-tool MCP surface;
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

- stable CLI/JSON/API/MCP contract;
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

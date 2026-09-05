# Release Checklist

Use for every package release.

## Repository

- [ ] Worktree clean or intentional release changes documented.
- [ ] Version updated consistently.
- [ ] CHANGELOG updated.
- [ ] README status/compatibility claims match evidence.
- [ ] License present and compatible with bundled grammars/dependencies.

## Dependencies

- [ ] Lockfile current.
- [ ] Dependency audit reviewed.
- [ ] No unexpected postinstall/native build introduced.
- [ ] `web-tree-sitter` version pinned as intended.

## Grammars

- [ ] Source revision/version recorded.
- [ ] WASM hashes recorded.
- [ ] Load smoke passed.
- [ ] Golden fixtures passed per language.
- [ ] npm tarball contains required WASM files.

## Contracts

- [ ] CLI snapshot/golden tests passed.
- [ ] JSON schema tests passed.
- [ ] JS public API tests passed.
- [ ] Error-code compatibility reviewed.
- [ ] Serverless contract tested if included in this release.

## Security/privacy

- [ ] Root/path traversal tests passed.
- [ ] Symlink policy tested.
- [ ] Read-only invariant tested.
- [ ] Runtime network not required for core slice tests.
- [ ] Logs do not include source content by default.

## Quality

- [ ] Unit tests passed.
- [ ] Language certification passed.
- [ ] Malformed fixtures passed.
- [ ] Ambiguity fixtures passed.
- [ ] Benchmark rerun if parser/grammar changed.

## Platform

- [ ] Windows smoke.
- [ ] macOS smoke.
- [ ] Linux smoke.
- [ ] Supported Node range documented.

## npm artifact

- [ ] `npm pack --dry-run` reviewed.
- [ ] Installed tarball tested in a clean temporary directory.
- [ ] `npx` invocation tested.
- [ ] package size reviewed.

## Agent compatibility

Only mark an integration Verified after its real E2E.

- [ ] Codex evidence (if claimed).
- [ ] Claude Code evidence (if claimed).
- [ ] Gemini CLI evidence (if claimed).
- [ ] OpenCode evidence (if claimed).

## Final

- [ ] Release notes factual.
- [ ] No "supports all agents/languages" overclaim.
- [ ] Tag and publish only after gates are green.

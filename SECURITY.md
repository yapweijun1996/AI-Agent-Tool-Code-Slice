# Security Policy

## Current security model

Agent Code Slice is a local, read-only code observation tool.

The core product should not require:

- a hosted backend;
- an account;
- an API key;
- source-code upload;
- outbound network access during normal slicing.

## In-scope security concerns

Please report privately if you identify:

- path traversal outside an allowed workspace;
- symlink escapes;
- unintended source-file disclosure;
- arbitrary code execution caused by parsing;
- unsafe WASM/grammar packaging;
- malicious source causing denial-of-service beyond documented limits;
- JSON/output injection that can mislead an agent consumer;
- future serverless behavior that uploads, logs, writes, or executes beyond its
  explicitly documented contract;
- dependency/supply-chain integrity problems.

## Out of scope for V0.x

Agent Code Slice is not a sandbox for executing project code and does not claim to secure arbitrary shell execution by an AI agent.

## Reporting

Until a dedicated security contact is published, repository owners should configure GitHub Private Vulnerability Reporting before public release.

Do not include secrets, private source code, or customer data in public vulnerability reports.

## Disclosure

A security fix is not complete until:

- a regression test exists;
- affected versions are identified;
- documentation is corrected;
- release artifacts are rebuilt;
- public claims remain accurate.

#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { capabilities, outline, slice } from "../core/index.js";
import type { ResultEnvelope, SymbolKind, Selector } from "../core/index.js";
import type { ErrorCode } from "../schema/errors.js";
import { SYMBOL_KINDS } from "../schema/types.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * docs/CLI_CONTRACT.md "Exit codes". The JSON error.code is the primary
 * machine semantic; these are the stable coarse classes.
 */
const EXIT_CODE_BY_ERROR: Partial<Record<ErrorCode, number>> = {
  FILE_NOT_FOUND: 3,
  FILE_OUTSIDE_ROOT: 3,
  FILE_TOO_LARGE: 3,
  ENCODING_UNSUPPORTED: 3,
  LANGUAGE_UNSUPPORTED: 4,
  LANGUAGE_AMBIGUOUS: 4,
  GRAMMAR_LOAD_FAILED: 5,
  PARSE_FAILED: 5,
  SYMBOL_NOT_FOUND: 6,
  LINE_OUT_OF_RANGE: 6,
  RANGE_INVALID: 6,
  SYMBOL_AMBIGUOUS: 7,
  OUTPUT_LIMIT_EXCEEDED: 8,
  INTERNAL_ERROR: 1,
};

const EXIT_ARGS_INVALID = 2;

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const booleanFlags = new Set(["json", "expand", "debug", "version", "help"]);
      if (booleanFlags.has(name)) {
        flags[name] = true;
      } else {
        const value = argv[++i];
        if (value === undefined) {
          throw new CliUsageError(`Flag --${name} requires a value`);
        }
        flags[name] = value;
      }
      continue;
    }
    if (command === undefined) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

class CliUsageError extends Error {}

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

const HELP_TEXT = `code-slice — precise, language-aware code context for AI coding agents.

Usage:
  code-slice capabilities [--json]
  code-slice outline <file> [--kind <kind>] [--max-symbols <n>] [--language <id>] [--json]
  code-slice symbol <file> <name> [--kind <kind>] [--json]
  code-slice line <file> <line> [--json]
  code-slice range <file> <start:end> [--expand] [--json]

Global flags:
  --json            Emit exactly one JSON document to stdout; diagnostics go to stderr.
  --language <id>   Force a language adapter instead of detecting from extension.
  --root <path>     Constrain readable paths to this root.
  --max-bytes <n>   Reject files larger than <n> bytes.
  --debug           Reserved; currently a no-op.
  --version         Print the package version and exit.
  --help            Print this help and exit.
`;

function printEnvelope(envelope: ResultEnvelope, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
    return;
  }
  if (!envelope.ok) {
    process.stderr.write(`error: ${envelope.error.code}: ${envelope.error.message}\n`);
    if (envelope.error.candidates) {
      process.stderr.write(JSON.stringify(envelope.error.candidates, null, 2) + "\n");
    }
    return;
  }
  process.stdout.write(JSON.stringify(envelope.result, null, 2) + "\n");
  for (const w of envelope.warnings) {
    process.stderr.write(`warning: ${w.code}: ${w.message}\n`);
  }
}

function exitCodeFor(envelope: ResultEnvelope): number {
  if (envelope.ok) return 0;
  const code = envelope.error.code as ErrorCode;
  return EXIT_CODE_BY_ERROR[code] ?? 1;
}

function parseRange(spec: string): { startLine: number; endLine: number } {
  const match = /^(\d+):(\d+)$/.exec(spec);
  if (!match) {
    throw new CliUsageError(`Invalid range "${spec}"; expected <start>:<end>, e.g. 380:390`);
  }
  return { startLine: Number(match[1]), endLine: Number(match[2]) };
}

function parseKindArg(value: string | boolean | undefined): SymbolKind | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(SYMBOL_KINDS as readonly string[]).includes(value)) {
    throw new CliUsageError(`--kind must be one of: ${SYMBOL_KINDS.join(", ")} (got "${value}")`);
  }
  return value as SymbolKind;
}

function parseIntArg(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new CliUsageError(`--${name} must be an integer, got "${value}"`);
  }
  return n;
}

async function run(): Promise<number> {
  const argv = process.argv.slice(2);
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return EXIT_ARGS_INVALID;
  }

  const json = Boolean(parsed.flags.json);

  if (parsed.flags.version) {
    process.stdout.write(readVersion() + "\n");
    return 0;
  }
  if (parsed.flags.help || parsed.command === undefined) {
    process.stdout.write(HELP_TEXT);
    return parsed.command === undefined ? EXIT_ARGS_INVALID : 0;
  }

  try {
    const root = typeof parsed.flags.root === "string" ? parsed.flags.root : undefined;
    const language = typeof parsed.flags.language === "string" ? parsed.flags.language : undefined;
    const maxBytes =
      typeof parsed.flags["max-bytes"] === "string" ? parseIntArg("max-bytes", parsed.flags["max-bytes"]) : undefined;
    const kind = parseKindArg(parsed.flags.kind);

    switch (parsed.command) {
      case "capabilities": {
        const envelope = await capabilities();
        printEnvelope(envelope, json);
        return exitCodeFor(envelope);
      }
      case "outline": {
        const [file] = parsed.positional;
        if (!file) throw new CliUsageError("outline requires <file>");
        const maxSymbols =
          typeof parsed.flags["max-symbols"] === "string" ? parseIntArg("max-symbols", parsed.flags["max-symbols"]) : undefined;
        const envelope = await outline({ file, root, language, maxBytes, kind, maxSymbols });
        printEnvelope(envelope, json);
        return exitCodeFor(envelope);
      }
      case "symbol": {
        const [file, name] = parsed.positional;
        if (!file || !name) throw new CliUsageError("symbol requires <file> <name>");
        const selector: Selector = { type: "symbol", name, ...(kind ? { kind } : {}) };
        const envelope = await slice({ file, root, language, maxBytes, selector });
        printEnvelope(envelope, json);
        return exitCodeFor(envelope);
      }
      case "line": {
        const [file, lineStr] = parsed.positional;
        if (!file || !lineStr) throw new CliUsageError("line requires <file> <line>");
        const selector: Selector = { type: "line", line: parseIntArg("line", lineStr) };
        const envelope = await slice({ file, root, language, maxBytes, selector });
        printEnvelope(envelope, json);
        return exitCodeFor(envelope);
      }
      case "range": {
        const [file, rangeStr] = parsed.positional;
        if (!file || !rangeStr) throw new CliUsageError("range requires <file> <start:end>");
        const { startLine, endLine } = parseRange(rangeStr);
        const selector: Selector = { type: "range", startLine, endLine, expand: Boolean(parsed.flags.expand) };
        const envelope = await slice({ file, root, language, maxBytes, selector });
        printEnvelope(envelope, json);
        return exitCodeFor(envelope);
      }
      default:
        process.stderr.write(`error: unknown command "${parsed.command}"\n\n${HELP_TEXT}`);
        return EXIT_ARGS_INVALID;
    }
  } catch (err) {
    if (err instanceof CliUsageError) {
      process.stderr.write(`error: ${err.message}\n`);
      return EXIT_ARGS_INVALID;
    }
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

run().then((code) => {
  process.exitCode = code;
});

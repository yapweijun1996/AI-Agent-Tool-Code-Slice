import { existsSync, realpathSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { CodeSliceError } from "../schema/errors.js";
import { DEFAULT_MAX_BYTES, normalizeMaxBytes } from "./limits.js";

export { DEFAULT_MAX_BYTES } from "./limits.js";

export interface LoadFileOptions {
  /** Constrains readable paths (docs/CLI_CONTRACT.md `--root`). Resolved+realpath'd to block symlink escapes. */
  root?: string;
  maxBytes?: number;
}

export interface LoadedFile {
  /** The path as given, preserved verbatim (docs/CLI_CONTRACT.md "File paths"). */
  requestedPath: string;
  resolvedPath: string;
  source: string;
}

/**
 * The file-loading boundary (docs/ARCHITECTURE.md "File loading boundary").
 * Read-only. Never follows a symlink outside an allowed root (AGENTS.md
 * Security). Fails closed on any ambiguity rather than guessing.
 */
function escapesRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

export function loadFile(requestedPath: string, options: LoadFileOptions = {}): LoadedFile {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    throw new CodeSliceError("INVALID_ARGUMENT", "file must be a non-empty string");
  }
  if (options.root !== undefined && (typeof options.root !== "string" || options.root.length === 0)) {
    throw new CodeSliceError("INVALID_ARGUMENT", "root must be a non-empty string");
  }
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  const cwd = process.cwd();
  const absolutePath = path.isAbsolute(requestedPath) ? requestedPath : path.resolve(cwd, requestedPath);

  // Lexical containment check first, before touching the filesystem at all:
  // a path outside --root must fail the same way (FILE_OUTSIDE_ROOT)
  // whether or not it happens to exist, so existence can't be probed across
  // the root boundary by an OUTSIDE_ROOT vs NOT_FOUND response difference.
  const lexicalRoot =
    options.root !== undefined
      ? path.isAbsolute(options.root)
        ? options.root
        : path.resolve(cwd, options.root)
      : undefined;
  if (lexicalRoot !== undefined && escapesRoot(lexicalRoot, absolutePath)) {
    throw new CodeSliceError("FILE_OUTSIDE_ROOT", `File "${requestedPath}" resolves outside root "${options.root}"`);
  }

  if (!existsSync(absolutePath)) {
    throw new CodeSliceError("FILE_NOT_FOUND", `File not found: ${requestedPath}`);
  }

  let realPath: string;
  try {
    realPath = realpathSync(absolutePath);
  } catch (err) {
    throw new CodeSliceError("FILE_NOT_FOUND", `Could not resolve file: ${requestedPath} (${(err as Error).message})`);
  }

  // Re-check after realpath: a symlink that lexically sat inside root can
  // still resolve to a target outside it.
  if (lexicalRoot !== undefined) {
    let realRoot: string;
    try {
      realRoot = realpathSync(lexicalRoot);
    } catch (err) {
      throw new CodeSliceError(
        "FILE_NOT_FOUND",
        `Could not resolve root "${options.root}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (escapesRoot(realRoot, realPath)) {
      throw new CodeSliceError("FILE_OUTSIDE_ROOT", `File "${requestedPath}" resolves outside root "${options.root}"`);
    }
  }

  const stat = statSync(realPath);
  if (!stat.isFile()) {
    throw new CodeSliceError("FILE_NOT_FOUND", `Not a regular file: ${requestedPath}`);
  }
  if (stat.size > maxBytes) {
    throw new CodeSliceError(
      "FILE_TOO_LARGE",
      `File "${requestedPath}" is ${stat.size} bytes, exceeding the ${maxBytes}-byte limit`,
    );
  }

  const buffer = readFileSync(realPath);
  let source: string;
  try {
    // Keep a leading UTF-8 BOM in the decoded source. Public byte ranges are
    // measured against the original file, so dropping these three bytes here
    // would shift every later range and break byte-for-byte extraction.
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new CodeSliceError("ENCODING_UNSUPPORTED", `File "${requestedPath}" is not valid UTF-8`);
  }

  return { requestedPath, resolvedPath: realPath, source };
}

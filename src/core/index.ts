import { WasmEngine } from "../engine/wasm-engine.js";
import { detectAdapter, getAdapterById } from "../languages/registry.js";
import { SourceIndex } from "../schema/coordinates.js";
import { CodeSliceError } from "../schema/errors.js";
import { buildErrorEnvelope, buildSuccessEnvelope, type ResultEnvelope } from "../schema/envelope.js";
import type { CodeSymbol, Diagnostic, Selector, SymbolKind } from "../schema/types.js";
import { loadFile } from "./file-loader.js";
import {
  createSymbolBudget,
  DEFAULT_COMPACT_OUTLINE_SYMBOLS,
  finalizeResultEnvelope,
  MAX_OUTPUT_BYTES,
  normalizeMaxOutputBytes,
  normalizeMaxSymbols,
  requestedMaxOutputBytesOrDefault,
} from "./limits.js";
import {
  normalizeRangeSelectorBounds,
  resolveLineSelector,
  resolveRangeSelector,
  resolveSmallestSyntaxSelector,
  resolveSymbolSelector,
} from "./slice-engine.js";
import { buildCapabilities } from "./capabilities.js";
import { fileForError, validateOutlineParams, validateSliceParams } from "./validation.js";
import type { Operation } from "../schema/envelope.js";

export type { Selector, CodeSymbol, SymbolKind, Capabilities } from "../schema/types.js";
export type { ResultEnvelope, SuccessEnvelope, ErrorEnvelope } from "../schema/envelope.js";
export { ERROR_CODES, type ErrorCode } from "../schema/errors.js";

// One engine per process: loaded grammars are cached across calls (docs/ARCHITECTURE.md "Caching").
const engine = new WasmEngine();

export interface FileParams {
  file: string;
  root?: string;
  maxBytes?: number;
  maxOutputBytes?: number;
  /** Skip extension-based detection and force a specific adapter id. */
  language?: string;
}

export interface OutlineParams extends FileParams {
  kind?: SymbolKind;
  /** Page size after filtering/sorting. Retains the existing maxSymbols contract. */
  maxSymbols?: number;
  /** Zero-based page offset after filtering/sorting. */
  offset?: number;
  /** Emit a smaller agent-navigation shape instead of full symbol coordinates/native kinds. */
  compact?: boolean;
  /** Return only symbols without a normalized parent. */
  topLevel?: boolean;
  /** Include symbols nested inside functions/methods; defaults to false for agent-focused outlines. */
  includeLocals?: boolean;
}

export interface SliceParams extends FileParams {
  selector: Selector;
  /** Fail closed when the resolved slice spans more than this many lines. */
  maxLines?: number;
}

/** `result` payload for a single resolved symbol: the CodeSymbol fields (minus `language`, reported at the envelope's top level) plus the exact code text. */
function slicePayload(symbol: CodeSymbol, sourceIndex: SourceIndex) {
  const { language, ...rest } = symbol;
  void language;
  return { ...rest, code: sourceIndex.textForRange(symbol.range) };
}

/** Full outline entry: the CodeSymbol fields without source text or the envelope-level host language. */
function outlinePayload(symbol: CodeSymbol) {
  const { language, ...rest } = symbol;
  void language;
  return rest;
}

/**
 * Compact outline entry for agent discovery. Keep only fields needed to choose
 * a later symbol/range slice; byte/column/native-kind detail remains available
 * from the full outline and exact slice operations.
 */
function compactOutlinePayload(symbol: CodeSymbol) {
  const payload: Record<string, unknown> = {
    kind: symbol.kind,
    name: symbol.name,
    range: { startLine: symbol.range.startLine, endLine: symbol.range.endLine },
  };
  if (symbol.parent) payload.parent = { kind: symbol.parent.kind, name: symbol.parent.name };
  if (symbol.embeddedLanguage !== undefined) payload.embeddedLanguage = symbol.embeddedLanguage;
  if (symbol.dynamicName) payload.dynamicName = true;
  if (symbol.warnings?.length) payload.warningCodes = [...new Set(symbol.warnings.map((warning) => warning.code))];
  return payload;
}

async function loadAndExtract(
  params: FileParams,
  smallestSelector?: Extract<Selector, { type: "range" }>,
) {
  const loaded = loadFile(params.file, { root: params.root, maxBytes: params.maxBytes });
  const adapter = params.language ? getAdapterById(params.language) : detectAdapter(loaded.requestedPath);
  if (!adapter) {
    throw new CodeSliceError("LANGUAGE_UNSUPPORTED", `No language adapter registered for id "${params.language}"`);
  }

  const loadedLanguage = await engine.loadLanguage(adapter.grammarId);
  return engine.withParse(loaded.source, loadedLanguage, async ({ tree, hadError }) => {
    const sourceIndex = new SourceIndex(loaded.source);
    const symbols = await adapter.extractSymbols({
      tree,
      source: loaded.source,
      sourceIndex,
      filePath: loaded.requestedPath,
      engine,
      symbolBudget: createSymbolBudget(),
    });
    const smallestSyntax = smallestSelector
      ? resolveSmallestSyntaxSelector(tree.rootNode, smallestSelector, sourceIndex, adapter.id)
      : undefined;

    const warnings: Diagnostic[] = hadError
      ? [
          {
            code: "PARSE_ERROR_RECOVERED",
            message: "The parser recovered from one or more syntax errors; results may be incomplete.",
            severity: "warning",
          },
        ]
      : [];

    return { adapter, symbols, sourceIndex, warnings, loaded, smallestSyntax };
  });
}

export async function capabilities(): Promise<ResultEnvelope> {
  try {
    return finalizeResultEnvelope(
      buildSuccessEnvelope({ operation: "capabilities", result: buildCapabilities() }),
      MAX_OUTPUT_BYTES,
    );
  } catch (err) {
    return toErrorEnvelope("capabilities", undefined, err, MAX_OUTPUT_BYTES);
  }
}

function symbolRefKey(symbol: Pick<CodeSymbol, "kind" | "name" | "range">): string {
  return `${symbol.kind}:${symbol.name ?? ""}:${symbol.range.startByte}:${symbol.range.endByte}`;
}

function buildSymbolLookup(symbols: CodeSymbol[]): Map<string, CodeSymbol> {
  return new Map(symbols.map((symbol) => [symbolRefKey(symbol), symbol]));
}

function isLocalSymbol(symbol: CodeSymbol, byRef: ReadonlyMap<string, CodeSymbol>): boolean {
  // Only declaration-like symbols are suppressed. Structural symbols such as
  // CFML queries remain visible even when they live inside a function.
  if (symbol.kind !== "variable" && symbol.kind !== "function" && symbol.kind !== "method") return false;

  let parent = symbol.parent ?? null;
  const visited = new Set<string>();
  while (parent) {
    if (parent.kind === "function" || parent.kind === "method") return true;
    const key = symbolRefKey(parent);
    if (visited.has(key)) break;
    visited.add(key);
    parent = byRef.get(key)?.parent ?? null;
  }
  return false;
}

export async function outline(params: OutlineParams): Promise<ResultEnvelope> {
  const outputBudget = requestedMaxOutputBytesOrDefault(params);
  try {
    const validated = validateOutlineParams(params);
    const maxSymbols =
      validated.compact && validated.maxSymbols === undefined
        ? DEFAULT_COMPACT_OUTLINE_SYMBOLS
        : normalizeMaxSymbols(validated.maxSymbols);
    const maxOutputBytes = normalizeMaxOutputBytes(validated.maxOutputBytes);
    const offset = validated.offset ?? 0;
    const { adapter, symbols, warnings, loaded } = await loadAndExtract(validated);
    const byRef = buildSymbolLookup(symbols);
    let filtered = validated.includeLocals ? symbols : symbols.filter((s) => !isLocalSymbol(s, byRef));
    if (validated.topLevel) filtered = filtered.filter((s) => s.parent == null);
    if (validated.kind) filtered = filtered.filter((s) => s.kind === validated.kind);
    filtered = [...filtered].sort((a, b) => a.range.startByte - b.range.startByte);

    const total = filtered.length;
    const pageSymbols = filtered.slice(offset, offset + maxSymbols);
    const returned = pageSymbols.length;
    const candidateNextOffset = offset + returned;
    const hasMore = candidateNextOffset < total;
    const nextOffset = hasMore && returned > 0 ? candidateNextOffset : undefined;
    const truncated = offset > 0 || hasMore;
    const page = {
      total,
      returned,
      offset,
      limit: maxSymbols,
      truncated,
      hasMore,
      ...(nextOffset !== undefined ? { nextOffset } : {}),
    };

    const allWarnings = hasMore
      ? [
          ...warnings,
          {
            code: "OUTLINE_TRUNCATED",
            message: `Outline page returned ${returned} symbol(s) at offset ${offset} of ${total}; more results are available.`,
            severity: "warning" as const,
          },
        ]
      : warnings;

    const mapper = validated.compact ? compactOutlinePayload : outlinePayload;
    const envelope = buildSuccessEnvelope({
      operation: "outline",
      file: loaded.requestedPath,
      language: adapter.id,
      result: { symbols: pageSymbols.map(mapper), page },
      warnings: allWarnings,
    });
    return finalizeResultEnvelope(envelope, maxOutputBytes);
  } catch (err) {
    return toErrorEnvelope("outline", fileForError(params), err, outputBudget);
  }
}

export async function slice(params: SliceParams): Promise<ResultEnvelope> {
  const outputBudget = requestedMaxOutputBytesOrDefault(params);
  try {
    const validated = validateSliceParams(params);
    const maxOutputBytes = normalizeMaxOutputBytes(validated.maxOutputBytes);
    const smallestSelector =
      validated.selector.type === "range" && validated.selector.smallest ? validated.selector : undefined;
    const { adapter, symbols, sourceIndex, warnings, loaded, smallestSyntax } = await loadAndExtract(
      validated,
      smallestSelector,
    );

    let resolved: CodeSymbol;
    switch (validated.selector.type) {
      case "symbol":
        resolved = resolveSymbolSelector(symbols, validated.selector);
        break;
      case "line":
        resolved = resolveLineSelector(symbols, validated.selector, sourceIndex, adapter.id);
        break;
      case "range":
        resolved = validated.selector.smallest
          ? (smallestSyntax ?? resolveRangeSelector(symbols, validated.selector, sourceIndex, adapter.id))
          : resolveRangeSelector(symbols, validated.selector, sourceIndex, adapter.id);
        break;
      default:
        throw new CodeSliceError("INVALID_ARGUMENT", "selector.type is unsupported");
    }

    if (validated.maxLines !== undefined) {
      const lineCount = resolved.range.endLine - resolved.range.startLine + 1;
      if (lineCount > validated.maxLines) {
        throw new CodeSliceError(
          "OUTPUT_LIMIT_EXCEEDED",
          `Resolved slice spans ${lineCount} line(s), exceeding maxLines=${validated.maxLines}.`,
          {
            recoverable: true,
            details: {
              maxLines: validated.maxLines,
              resolvedLines: lineCount,
              range: resolved.range,
            },
          },
        );
      }
    }

    const allWarnings = [...warnings];
    if (validated.selector.type === "range" && validated.selector.clamp) {
      const bounds = normalizeRangeSelectorBounds(validated.selector, sourceIndex);
      if (bounds.clamped) {
        allWarnings.push({
          code: "RANGE_CLAMPED",
          message: `Requested range ${validated.selector.startLine}:${validated.selector.endLine} was clamped to ${bounds.startLine}:${bounds.endLine}.`,
          severity: "warning",
        });
      }
    }

    const envelope = buildSuccessEnvelope({
      operation: "slice",
      file: loaded.requestedPath,
      language: adapter.id,
      result: slicePayload(resolved, sourceIndex),
      warnings: allWarnings,
    });
    return finalizeResultEnvelope(envelope, maxOutputBytes);
  } catch (err) {
    return toErrorEnvelope("slice", fileForError(params), err, outputBudget);
  }
}

function toErrorEnvelope(
  operation: Operation,
  file: string | undefined,
  err: unknown,
  maxOutputBytes: number,
): ResultEnvelope {
  let envelope: ResultEnvelope;
  if (err instanceof CodeSliceError) {
    envelope = buildErrorEnvelope({ operation, file, error: err });
  } else {
    const message = err instanceof Error ? err.message : String(err);
    envelope = buildErrorEnvelope({
      operation,
      file,
      error: new CodeSliceError("INTERNAL_ERROR", message),
    });
  }
  return finalizeResultEnvelope(envelope, maxOutputBytes);
}

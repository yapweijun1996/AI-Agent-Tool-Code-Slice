import { WasmEngine } from "../engine/wasm-engine.js";
import { detectAdapter, getAdapterById } from "../languages/registry.js";
import { SourceIndex } from "../schema/coordinates.js";
import { CodeSliceError } from "../schema/errors.js";
import { buildErrorEnvelope, buildSuccessEnvelope, type ResultEnvelope } from "../schema/envelope.js";
import type { CodeSymbol, Diagnostic, Selector, SymbolKind } from "../schema/types.js";
import { loadFile } from "./file-loader.js";
import {
  createSymbolBudget,
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
  maxSymbols?: number;
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

/** `result` payload for one outline entry: the CodeSymbol fields, no code text (outline is a bounded structural inventory, not a bundle of full slices). */
function outlinePayload(symbol: CodeSymbol) {
  const { language, ...rest } = symbol;
  void language;
  return rest;
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

function isLocalSymbol(symbol: CodeSymbol): boolean {
  const nestedInCallable = symbol.parent?.kind === "function" || symbol.parent?.kind === "method";
  return nestedInCallable && (symbol.kind === "variable" || symbol.kind === "function");
}

export async function outline(params: OutlineParams): Promise<ResultEnvelope> {
  const outputBudget = requestedMaxOutputBytesOrDefault(params);
  try {
    const validated = validateOutlineParams(params);
    const maxSymbols = normalizeMaxSymbols(validated.maxSymbols);
    const maxOutputBytes = normalizeMaxOutputBytes(validated.maxOutputBytes);
    const { adapter, symbols, warnings, loaded } = await loadAndExtract(validated);
    let filtered = validated.includeLocals ? symbols : symbols.filter((s) => !isLocalSymbol(s));
    if (validated.topLevel) filtered = filtered.filter((s) => s.parent == null);
    if (validated.kind) filtered = filtered.filter((s) => s.kind === validated.kind);
    filtered = [...filtered].sort((a, b) => a.range.startByte - b.range.startByte);

    const truncated = filtered.length > maxSymbols;
    const total = filtered.length;
    if (truncated) filtered = filtered.slice(0, maxSymbols);

    const allWarnings = truncated
      ? [
          ...warnings,
          {
            code: "OUTLINE_TRUNCATED",
            message: `Outline truncated to ${maxSymbols} of ${total} symbol(s).`,
            severity: "warning" as const,
          },
        ]
      : warnings;

    const envelope = buildSuccessEnvelope({
      operation: "outline",
      file: loaded.requestedPath,
      language: adapter.id,
      result: { symbols: filtered.map(outlinePayload) },
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

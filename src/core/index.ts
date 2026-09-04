import { WasmEngine } from "../engine/wasm-engine.js";
import { detectAdapter, getAdapterById } from "../languages/registry.js";
import { SourceIndex } from "../schema/coordinates.js";
import { CodeSliceError } from "../schema/errors.js";
import { buildErrorEnvelope, buildSuccessEnvelope, type ResultEnvelope } from "../schema/envelope.js";
import type { CodeSymbol, Diagnostic, Selector, SymbolKind } from "../schema/types.js";
import { loadFile, DEFAULT_MAX_BYTES } from "./file-loader.js";
import { resolveLineSelector, resolveRangeSelector, resolveSymbolSelector } from "./slice-engine.js";
import { buildCapabilities } from "./capabilities.js";

export type { Selector, CodeSymbol, SymbolKind, Capabilities } from "../schema/types.js";
export type { ResultEnvelope, SuccessEnvelope, ErrorEnvelope } from "../schema/envelope.js";
export { ERROR_CODES, type ErrorCode } from "../schema/errors.js";

// One engine per process: loaded grammars are cached across calls (docs/ARCHITECTURE.md "Caching").
const engine = new WasmEngine();

export interface FileParams {
  file: string;
  root?: string;
  maxBytes?: number;
  /** Skip extension-based detection and force a specific adapter id. */
  language?: string;
}

export interface OutlineParams extends FileParams {
  kind?: SymbolKind;
  maxSymbols?: number;
}

export interface SliceParams extends FileParams {
  selector: Selector;
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

async function loadAndExtract(params: FileParams) {
  const loaded = loadFile(params.file, { root: params.root, maxBytes: params.maxBytes ?? DEFAULT_MAX_BYTES });
  const adapter = params.language ? getAdapterById(params.language) : detectAdapter(loaded.requestedPath);
  if (!adapter) {
    throw new CodeSliceError("LANGUAGE_UNSUPPORTED", `No language adapter registered for id "${params.language}"`);
  }

  const loadedLanguage = await engine.loadLanguage(adapter.grammarId);
  const { tree, hadError } = await engine.parse(loaded.source, loadedLanguage);
  const sourceIndex = new SourceIndex(loaded.source);

  const symbols = await adapter.extractSymbols({
    tree,
    source: loaded.source,
    sourceIndex,
    filePath: loaded.requestedPath,
    engine,
  });

  const warnings: Diagnostic[] = hadError
    ? [
        {
          code: "PARSE_ERROR_RECOVERED",
          message: "The parser recovered from one or more syntax errors; results may be incomplete.",
          severity: "warning",
        },
      ]
    : [];

  return { adapter, symbols, sourceIndex, warnings, loaded };
}

export async function capabilities(): Promise<ResultEnvelope> {
  return buildSuccessEnvelope({ operation: "capabilities", result: buildCapabilities() });
}

export async function outline(params: OutlineParams): Promise<ResultEnvelope> {
  try {
    const { adapter, symbols, warnings, loaded } = await loadAndExtract(params);
    let filtered = params.kind ? symbols.filter((s) => s.kind === params.kind) : symbols;
    filtered = [...filtered].sort((a, b) => a.range.startByte - b.range.startByte);

    const truncated = params.maxSymbols !== undefined && filtered.length > params.maxSymbols;
    const total = filtered.length;
    if (truncated) filtered = filtered.slice(0, params.maxSymbols);

    const allWarnings = truncated
      ? [
          ...warnings,
          {
            code: "OUTLINE_TRUNCATED",
            message: `Outline truncated to ${params.maxSymbols} of ${total} symbol(s).`,
            severity: "warning" as const,
          },
        ]
      : warnings;

    return buildSuccessEnvelope({
      operation: "outline",
      file: loaded.requestedPath,
      language: adapter.id,
      result: { symbols: filtered.map(outlinePayload) },
      warnings: allWarnings,
    });
  } catch (err) {
    return toErrorEnvelope("outline", params.file, err);
  }
}

export async function slice(params: SliceParams): Promise<ResultEnvelope> {
  try {
    const { adapter, symbols, sourceIndex, warnings, loaded } = await loadAndExtract(params);

    let resolved: CodeSymbol;
    switch (params.selector.type) {
      case "symbol":
        resolved = resolveSymbolSelector(symbols, params.selector);
        break;
      case "line":
        resolved = resolveLineSelector(symbols, params.selector, sourceIndex, adapter.id);
        break;
      case "range":
        resolved = resolveRangeSelector(symbols, params.selector, sourceIndex, adapter.id);
        break;
    }

    return buildSuccessEnvelope({
      operation: "slice",
      file: loaded.requestedPath,
      language: adapter.id,
      result: slicePayload(resolved, sourceIndex),
      warnings,
    });
  } catch (err) {
    return toErrorEnvelope("slice", params.file, err);
  }
}

function toErrorEnvelope(operation: "outline" | "slice", file: string, err: unknown): ResultEnvelope {
  if (err instanceof CodeSliceError) {
    return buildErrorEnvelope({ operation, file, error: err });
  }
  const message = err instanceof Error ? err.message : String(err);
  return buildErrorEnvelope({ operation, file, error: new CodeSliceError("INTERNAL_ERROR", message) });
}

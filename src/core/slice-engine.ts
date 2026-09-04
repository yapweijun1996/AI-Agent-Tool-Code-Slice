import type { SourceIndex } from "../schema/coordinates.js";
import type { CodeSymbol, Selector } from "../schema/types.js";
import { CodeSliceError } from "../schema/errors.js";

const MAX_AMBIGUOUS_CANDIDATES = 20;

/**
 * Selector resolution over an already-normalized CodeSymbol[] list. This is
 * the only place ambiguity is decided (docs/ARCHITECTURE.md: "occurrence
 * should not be used to hide ambiguity by default"). It is intentionally
 * generic — no adapter, no language id — so every language fails closed the
 * same way instead of four adapters each getting it subtly different.
 */

function candidateOf(symbol: CodeSymbol) {
  return { kind: symbol.kind, name: symbol.name, range: symbol.range };
}

export function resolveSymbolSelector(
  symbols: CodeSymbol[],
  selector: Extract<Selector, { type: "symbol" }>,
): CodeSymbol {
  const matches = symbols
    .filter((s) => s.name === selector.name)
    .filter((s) => (selector.kind ? s.kind === selector.kind : true))
    .sort((a, b) => a.range.startByte - b.range.startByte);

  if (matches.length === 0) {
    throw new CodeSliceError("SYMBOL_NOT_FOUND", `No symbol named "${selector.name}" was found.`);
  }

  if (selector.occurrence !== undefined) {
    const picked = matches[selector.occurrence - 1];
    if (!picked) {
      throw new CodeSliceError(
        "SYMBOL_NOT_FOUND",
        `Symbol "${selector.name}" has only ${matches.length} occurrence(s); occurrence ${selector.occurrence} does not exist.`,
      );
    }
    return picked;
  }

  if (matches.length > 1) {
    throw new CodeSliceError(
      "SYMBOL_AMBIGUOUS",
      `Symbol "${selector.name}" matched ${matches.length} supported symbols.`,
      { recoverable: true, candidates: matches.slice(0, MAX_AMBIGUOUS_CANDIDATES).map(candidateOf) },
    );
  }

  return matches[0]!;
}

function wholeFileContainer(sourceIndex: SourceIndex, language: string): CodeSymbol {
  return {
    kind: "module",
    nativeKind: "file",
    name: null,
    language,
    range: sourceIndex.lineRange(1, sourceIndex.lineCount),
    parent: null,
  };
}

function smallestContaining(symbols: CodeSymbol[], startByte: number, endByte: number): CodeSymbol | undefined {
  let best: CodeSymbol | undefined;
  for (const symbol of symbols) {
    const r = symbol.range;
    if (r.startByte <= startByte && r.endByte >= endByte) {
      if (!best || r.endByte - r.startByte < best.range.endByte - best.range.startByte) {
        best = symbol;
      }
    }
  }
  return best;
}

export function resolveLineSelector(
  symbols: CodeSymbol[],
  selector: Extract<Selector, { type: "line" }>,
  sourceIndex: SourceIndex,
  language: string,
): CodeSymbol {
  if (selector.line < 1 || selector.line > sourceIndex.lineCount) {
    throw new CodeSliceError(
      "LINE_OUT_OF_RANGE",
      `Line ${selector.line} is out of range (file has ${sourceIndex.lineCount} line(s)).`,
    );
  }

  const pointRange = sourceIndex.lineRange(selector.line, selector.line);
  const pool = [...symbols, wholeFileContainer(sourceIndex, language)];
  const best = smallestContaining(pool, pointRange.startByte, pointRange.endByte);
  return best ?? wholeFileContainer(sourceIndex, language);
}

export function resolveRangeSelector(
  symbols: CodeSymbol[],
  selector: Extract<Selector, { type: "range" }>,
  sourceIndex: SourceIndex,
  language: string,
): CodeSymbol {
  const { startLine, endLine } = selector;
  if (
    startLine < 1 ||
    endLine < 1 ||
    startLine > sourceIndex.lineCount ||
    endLine > sourceIndex.lineCount ||
    startLine > endLine
  ) {
    throw new CodeSliceError(
      "RANGE_INVALID",
      `Range ${startLine}:${endLine} is invalid for a file with ${sourceIndex.lineCount} line(s).`,
    );
  }

  const range = sourceIndex.lineRange(startLine, endLine);

  if (!selector.expand) {
    return {
      kind: "block",
      nativeKind: "range",
      name: null,
      language,
      range,
      parent: null,
    };
  }

  const pool = [...symbols, wholeFileContainer(sourceIndex, language)];
  const best = smallestContaining(pool, range.startByte, range.endByte);
  return best ?? wholeFileContainer(sourceIndex, language);
}

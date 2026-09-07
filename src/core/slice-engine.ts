import type { Node } from "web-tree-sitter";
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
  return {
    kind: symbol.kind,
    name: symbol.name,
    range: symbol.range,
    ...(symbol.parent ? { parent: symbol.parent } : {}),
  };
}

function splitQualifiedName(name: string): { owner: string; member: string } | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot >= name.length - 1) return undefined;
  return { owner: name.slice(0, dot), member: name.slice(dot + 1) };
}

export function resolveSymbolSelector(
  symbols: CodeSymbol[],
  selector: Extract<Selector, { type: "symbol" }>,
): CodeSymbol {
  const eligible = symbols.filter((s) => (selector.kind ? s.kind === selector.kind : true));
  const exactMatches = eligible.filter((s) => s.name === selector.name);
  const qualified = exactMatches.length === 0 ? splitQualifiedName(selector.name) : undefined;
  const matches = (qualified
    ? eligible.filter((s) => s.name === qualified.member && s.parent?.name === qualified.owner)
    : exactMatches
  ).sort((a, b) => a.range.startByte - b.range.startByte);

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

  const pointRange = sourceIndex.contentByteRangeForLines(selector.line, selector.line);
  const pool = [...symbols, wholeFileContainer(sourceIndex, language)];
  const best = smallestContaining(pool, pointRange.startByte, pointRange.endByte);
  return best ?? wholeFileContainer(sourceIndex, language);
}

export interface NormalizedRangeBounds {
  startLine: number;
  endLine: number;
  clamped: boolean;
}

export function normalizeRangeSelectorBounds(
  selector: Extract<Selector, { type: "range" }>,
  sourceIndex: SourceIndex,
): NormalizedRangeBounds {
  const { startLine, endLine } = selector;
  const available = { startLine: 1, endLine: sourceIndex.lineCount };

  if (startLine < 1 || endLine < 1 || startLine > endLine || startLine > sourceIndex.lineCount) {
    const suggestion =
      startLine >= 1 && startLine <= sourceIndex.lineCount
        ? { startLine, endLine: Math.min(Math.max(endLine, startLine), sourceIndex.lineCount) }
        : undefined;
    throw new CodeSliceError(
      "RANGE_INVALID",
      `Range ${startLine}:${endLine} is invalid for a file with ${sourceIndex.lineCount} line(s).`,
      {
        recoverable: suggestion !== undefined,
        details: {
          requested: { startLine, endLine },
          available,
          ...(suggestion ? { suggestion } : {}),
        },
      },
    );
  }

  if (endLine > sourceIndex.lineCount) {
    const suggestion = { startLine, endLine: sourceIndex.lineCount };
    if (selector.clamp) {
      return { ...suggestion, clamped: true };
    }
    throw new CodeSliceError(
      "RANGE_INVALID",
      `Range ${startLine}:${endLine} is invalid for a file with ${sourceIndex.lineCount} line(s).`,
      {
        recoverable: true,
        details: {
          requested: { startLine, endLine },
          available,
          suggestion,
        },
      },
    );
  }

  return { startLine, endLine, clamped: false };
}

export function resolveRangeSelector(
  symbols: CodeSymbol[],
  selector: Extract<Selector, { type: "range" }>,
  sourceIndex: SourceIndex,
  language: string,
): CodeSymbol {
  const { startLine, endLine } = normalizeRangeSelectorBounds(selector, sourceIndex);
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

  const contentRange = sourceIndex.contentByteRangeForLines(startLine, endLine);
  const pool = [...symbols, wholeFileContainer(sourceIndex, language)];
  const best = smallestContaining(pool, contentRange.startByte, contentRange.endByte);
  return best ?? wholeFileContainer(sourceIndex, language);
}

/**
 * Finds the smallest named Tree-sitter node that contains the meaningful
 * content of a requested line range. Unlike --expand, this is syntax-node
 * navigation rather than normalized-symbol navigation, so it can return a
 * statement/block inside a large method or class without inventing a symbol.
 */
export function resolveSmallestSyntaxSelector(
  root: Node,
  selector: Extract<Selector, { type: "range" }>,
  sourceIndex: SourceIndex,
  language: string,
): CodeSymbol {
  const { startLine, endLine } = normalizeRangeSelectorBounds(selector, sourceIndex);
  const target = sourceIndex.contentByteRangeForLines(startLine, endLine);
  let best: Node | undefined;
  let bestSize = Number.POSITIVE_INFINITY;

  function visit(node: Node): void {
    for (const child of node.namedChildren) {
      if (!child) continue;
      const range = sourceIndex.toSourceRange(child);
      if (range.startByte <= target.startByte && range.endByte >= target.endByte) {
        const size = range.endByte - range.startByte;
        if (size < bestSize) {
          best = child;
          bestSize = size;
        }
        visit(child);
      }
    }
  }

  visit(root);
  if (!best) return wholeFileContainer(sourceIndex, language);

  return {
    kind: "block",
    nativeKind: best.type,
    name: null,
    language,
    range: sourceIndex.toSourceRange(best),
    parent: null,
  };
}

import type { CodeSymbol, SymbolRef } from "../../schema/types.js";

/**
 * Assigns `parent` on every symbol by pure byte-range containment: the
 * smallest other symbol that strictly contains it.
 *
 * JS/Python get correct parents for free from tree structure during the walk
 * (src/languages/shared/walk.ts). CFML does not: its grammar represents a
 * component's open/close tags as flat siblings rather than one wrapping node
 * (confirmed empirically — see src/languages/cfml.ts), so nesting there has
 * to be recovered from ranges after the fact. This is intentionally generic
 * rather than CFML-specific in case a future adapter has the same shape.
 */
export function assignContainmentParents(symbols: CodeSymbol[]): void {
  const bySize = [...symbols].sort((a, b) => rangeSize(a) - rangeSize(b));

  for (const symbol of symbols) {
    let best: CodeSymbol | null = null;
    for (const candidate of bySize) {
      if (candidate === symbol) continue;
      if (strictlyContains(candidate, symbol)) {
        best = candidate;
        break;
      }
    }
    symbol.parent = best ? toRef(best) : null;
  }
}

function rangeSize(symbol: CodeSymbol): number {
  return symbol.range.endByte - symbol.range.startByte;
}

function strictlyContains(outer: CodeSymbol, inner: CodeSymbol): boolean {
  const a = outer.range;
  const b = inner.range;
  const notSameRange = a.startByte !== b.startByte || a.endByte !== b.endByte;
  return a.startByte <= b.startByte && a.endByte >= b.endByte && notSameRange;
}

function toRef(symbol: CodeSymbol): SymbolRef {
  return { kind: symbol.kind, name: symbol.name, range: symbol.range };
}

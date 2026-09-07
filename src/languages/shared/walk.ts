import type { Node } from "web-tree-sitter";
import type { SourceIndex } from "../../schema/coordinates.js";
import type { CodeSymbol, SymbolKind, SymbolRef } from "../../schema/types.js";
import type { SymbolBudget } from "../types.js";

export interface ExtractedName {
  name: string | null;
  dynamic?: boolean;
}

export interface SymbolRule {
  /** Native Tree-sitter node type(s) this rule matches. */
  nodeTypes: string[];
  /**
   * Static kind, or computed from the node and its enclosing matched symbol
   * (e.g. a JS variable_declarator is "function" only when its value is a
   * function/arrow expression; a Python function_definition is "method"
   * rather than "function" when its immediate container is a "class").
   */
  kind: SymbolKind | ((node: Node, parent: SymbolRef | null) => SymbolKind);
  /** Optional structural predicate for node types that should only surface in selected shapes. */
  matches?: (node: Node) => boolean;
  extractName(node: Node): ExtractedName;
  extractSignature?: (node: Node, source: string) => string | null;
}

export interface WalkConfig {
  language: string;
  rules: SymbolRule[];
  sourceIndex: SourceIndex;
  source: string;
  symbolBudget: SymbolBudget;
  /**
   * Optional language-specific "wrapper" node type (e.g. JS/TS `export_statement`)
   * whose range should be used instead of the inner declaration's range, so the
   * returned code slice includes the wrapping keyword. Only JS-family adapters
   * configure this; it stays here (rather than as an `if (language === ...)`
   * branch) so the walker itself remains language-agnostic.
   */
  wrapper?: {
    nodeType: string;
    declarationField: string;
    /** Kind/name to use when the wrapper has no matched inner declaration (e.g. `export { a, b }`). */
    fallbackKind: SymbolKind;
  };
}

function findRule(rules: SymbolRule[], node: Node): SymbolRule | undefined {
  return rules.find((r) => r.nodeTypes.includes(node.type) && (r.matches?.(node) ?? true));
}

/**
 * A wrapper's declaration field doesn't always point straight at a matchable
 * node — `export const x = 1;`'s declaration is a `lexical_declaration`,
 * which itself has no rule; the real `variable_declarator` is one level
 * down. Checks the node itself first, then (only if that misses) its direct
 * children — deliberately shallow, not a full re-walk, since anything deeper
 * belongs to the normal recursive visit once we descend into it.
 */
function findWrappedMatches(rules: SymbolRule[], node: Node): Array<{ node: Node; rule: SymbolRule }> {
  const direct = findRule(rules, node);
  if (direct) return [{ node, rule: direct }];

  const nested: Array<{ node: Node; rule: SymbolRule }> = [];
  for (const child of node.namedChildren) {
    if (!child) continue;
    const rule = findRule(rules, child);
    if (rule) nested.push({ node: child, rule });
  }
  return nested;
}

export function walkSymbols(root: Node, config: WalkConfig): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];

  function addSymbol(symbol: CodeSymbol): void {
    config.symbolBudget.consume();
    symbols.push(symbol);
  }

  function buildSymbol(
    declNode: Node,
    rangeNode: Node,
    rule: SymbolRule,
    parent: SymbolRef | null,
  ): CodeSymbol {
    const { name, dynamic } = rule.extractName(declNode);
    const kind = typeof rule.kind === "function" ? rule.kind(declNode, parent) : rule.kind;
    const range = config.sourceIndex.toSourceRange(rangeNode);
    const symbol: CodeSymbol = {
      kind,
      nativeKind: declNode.type,
      name,
      language: config.language,
      range,
      parent,
    };
    const signature = rule.extractSignature?.(declNode, config.source) ?? null;
    if (signature !== null) symbol.signature = signature;
    if (dynamic) {
      symbol.dynamicName = true;
      symbol.warnings = [
        {
          code: "DYNAMIC_NAME",
          message: `Symbol name for a ${kind} could not be statically resolved.`,
          severity: "warning",
        },
      ];
    }
    return symbol;
  }

  function visit(node: Node, parent: SymbolRef | null): void {
    for (const child of node.namedChildren) {
      if (!child) continue;

      if (config.wrapper && child.type === config.wrapper.nodeType) {
        const declaration = child.childForFieldName(config.wrapper.declarationField);
        const matches = declaration ? findWrappedMatches(config.rules, declaration) : [];

        if (matches.length > 0) {
          // A single declarator (the common `export const x = ...` case) widens
          // all the way to the export keyword. Multiple declarators sharing one
          // `export const a = 1, b = 2;` statement widen only to the
          // declaration (still past `const`/`let`), since attributing the full
          // "export" prefix identically to each sibling would be misleading.
          const rangeNode = matches.length === 1 ? child : declaration!;
          for (const { node: matchNode, rule } of matches) {
            const symbol = buildSymbol(matchNode, rangeNode, rule, parent);
            addSymbol(symbol);
            visit(matchNode, { kind: symbol.kind, name: symbol.name, range: symbol.range });
          }
        } else {
          const range = config.sourceIndex.toSourceRange(child);
          addSymbol({
            kind: config.wrapper.fallbackKind,
            nativeKind: child.type,
            name: null,
            language: config.language,
            range,
            parent,
          });
        }
        continue;
      }

      const rule = findRule(config.rules, child);
      if (rule) {
        const symbol = buildSymbol(child, child, rule, parent);
        addSymbol(symbol);
        visit(child, { kind: symbol.kind, name: symbol.name, range: symbol.range });
        continue;
      }

      visit(child, parent);
    }
  }

  visit(root, null);
  return symbols;
}

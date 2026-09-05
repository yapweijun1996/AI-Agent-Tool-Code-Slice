import type { Tree } from "web-tree-sitter";

/**
 * Contract every parser backend must satisfy (docs/ARCHITECTURE.md Layer 1).
 * The engine returns syntax trees; it never decides product-level symbol
 * kinds — that is the language adapter's job (Layer 2).
 */
export interface LoadedLanguage {
  /** Grammar id, e.g. "javascript", "typescript", "cfml". Matches grammars/wasm/manifest.json. */
  readonly id: string;
  readonly version: string;
}

export interface ParseResult {
  readonly tree: Tree;
  readonly hadError: boolean;
}

export interface ParserEngine {
  loadLanguage(grammarId: string): Promise<LoadedLanguage>;
  /**
   * Parses a source string and keeps the native Tree-sitter tree scoped to the
   * visitor. Implementations must release the tree after the visitor settles.
   */
  withParse<T>(
    source: string,
    language: LoadedLanguage,
    visitor: (result: ParseResult) => Promise<T> | T,
  ): Promise<T>;
}

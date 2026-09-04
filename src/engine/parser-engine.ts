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
  parse(source: string, language: LoadedLanguage): Promise<ParseResult>;
}

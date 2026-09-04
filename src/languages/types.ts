import type { Tree } from "web-tree-sitter";
import type { SourceIndex } from "../schema/coordinates.js";
import type { CodeSymbol } from "../schema/types.js";
import type { ParserEngine } from "../engine/parser-engine.js";

export interface AdapterContext {
  tree: Tree;
  source: string;
  sourceIndex: SourceIndex;
  filePath: string;
  /** For adapters that parse embedded regions with a different grammar (e.g. CFML -> cfscript/cfquery). */
  engine: ParserEngine;
}

/**
 * Owns everything language-specific (docs/ARCHITECTURE.md Layer 2): extension
 * detection, which grammar to load, and how to turn a parsed tree into the
 * normalized CodeSymbol[] list. Core (src/core) must never branch on adapter id.
 */
export interface LanguageAdapter {
  readonly id: string;
  readonly extensions: string[];
  /** Grammar id to load via ParserEngine.loadLanguage(), matches grammars/wasm/manifest.json. */
  readonly grammarId: string;
  extractSymbols(ctx: AdapterContext): CodeSymbol[] | Promise<CodeSymbol[]>;
}

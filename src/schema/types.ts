/**
 * Normalized IR types. See docs/ARCHITECTURE.md (Layer 3) and docs/JSON_SCHEMA.md.
 * This is the one place the public symbol shape is defined; adapters and the
 * slice engine both depend on it, never the other way around.
 */

export const SYMBOL_KINDS = [
  "function",
  "method",
  "class",
  "interface",
  "type",
  "module",
  "query",
  "block",
  "variable",
  "property",
  "import",
  "export",
  "unknown",
] as const;

export type SymbolKind = (typeof SYMBOL_KINDS)[number];

/**
 * Lines/columns are 1-based. Byte offsets are 0-based UTF-8 byte offsets
 * (docs/JSON_SCHEMA.md "Lines and columns"). web-tree-sitter reports rows,
 * columns, and indices in UTF-16 code units, so startByte/endByte are always
 * derived through src/schema/coordinates.ts — never computed ad hoc.
 */
export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  startByte: number;
  endByte: number;
}

export type DiagnosticSeverity = "warning" | "error";

export interface Diagnostic {
  code: string;
  message: string;
  severity?: DiagnosticSeverity;
}

export interface SymbolRef {
  kind: SymbolKind;
  name: string | null;
  range: SourceRange;
}

export interface CodeSymbol {
  kind: SymbolKind;
  /** Raw Tree-sitter node type, e.g. "function_declaration". Not part of the public kind contract. */
  nativeKind: string;
  name: string | null;
  language: string;
  embeddedLanguage?: string;
  range: SourceRange;
  parent?: SymbolRef | null;
  signature?: string | null;
  dynamicName?: boolean;
  warnings?: Diagnostic[];
}

export type Selector =
  | { type: "symbol"; name: string; kind?: SymbolKind; occurrence?: number }
  | { type: "line"; line: number }
  | { type: "range"; startLine: number; endLine: number; expand?: boolean };

export interface LanguageCapability {
  id: string;
  extensions: string[];
  grammarId: string;
  grammarVersion: string;
  embeddedLanguages?: string[];
}

export interface Capabilities {
  schemaVersion: string;
  engine: string;
  operations: Array<"capabilities" | "outline" | "symbol" | "line" | "range">;
  languages: LanguageCapability[];
}

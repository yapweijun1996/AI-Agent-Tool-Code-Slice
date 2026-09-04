import { Parser, Language } from "web-tree-sitter";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CodeSliceError } from "../schema/errors.js";
import type { LoadedLanguage, ParseResult, ParserEngine } from "./parser-engine.js";

interface ManifestGrammar {
  language: string;
  wasmFile: string;
  sha256: string;
  sourcePackage: string;
  sourceVersion: string;
}

interface Manifest {
  schemaVersion: string;
  grammars: ManifestGrammar[];
}

// dist/engine/wasm-engine.js -> package root is two levels up.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const wasmDir = path.join(packageRoot, "grammars", "wasm");

let manifestCache: Manifest | null = null;
function readManifest(): Manifest {
  if (manifestCache) return manifestCache;
  const manifestPath = path.join(wasmDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new CodeSliceError(
      "GRAMMAR_LOAD_FAILED",
      `Grammar manifest not found at ${manifestPath}. Run "npm run grammars:build".`,
    );
  }
  manifestCache = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  return manifestCache;
}

let parserInitPromise: Promise<void> | null = null;
function ensureParserInit(): Promise<void> {
  if (!parserInitPromise) {
    parserInitPromise = Parser.init();
  }
  return parserInitPromise;
}

/**
 * Default V0.1 parser backend: web-tree-sitter + pinned WASM grammars
 * (ADR 0001). Loaded languages are cached for the lifetime of the process.
 */
export class WasmEngine implements ParserEngine {
  private readonly loadedLanguages = new Map<string, { language: Language; version: string }>();

  async loadLanguage(grammarId: string): Promise<LoadedLanguage> {
    const cached = this.loadedLanguages.get(grammarId);
    if (cached) {
      return { id: grammarId, version: cached.version };
    }

    const manifest = readManifest();
    const entry = manifest.grammars.find((g) => g.language === grammarId);
    if (!entry) {
      throw new CodeSliceError(
        "LANGUAGE_UNSUPPORTED",
        `No grammar registered for "${grammarId}" in grammars/wasm/manifest.json`,
      );
    }

    const wasmPath = path.join(wasmDir, entry.wasmFile);
    if (!existsSync(wasmPath)) {
      throw new CodeSliceError("GRAMMAR_LOAD_FAILED", `Grammar WASM file missing: ${wasmPath}`);
    }

    await ensureParserInit();

    let language: Language;
    try {
      language = await Language.load(wasmPath);
    } catch (err) {
      throw new CodeSliceError(
        "GRAMMAR_LOAD_FAILED",
        `Failed to load grammar "${grammarId}" from ${wasmPath}: ${(err as Error).message}`,
      );
    }

    this.loadedLanguages.set(grammarId, { language, version: entry.sourceVersion });
    return { id: grammarId, version: entry.sourceVersion };
  }

  async parse(source: string, loaded: LoadedLanguage): Promise<ParseResult> {
    const cached = this.loadedLanguages.get(loaded.id);
    if (!cached) {
      throw new CodeSliceError("INTERNAL_ERROR", `parse() called before loadLanguage("${loaded.id}")`);
    }

    await ensureParserInit();
    const parser = new Parser();
    try {
      parser.setLanguage(cached.language);
      const tree = parser.parse(source);
      if (!tree) {
        throw new CodeSliceError("PARSE_FAILED", `Parser returned no tree for language "${loaded.id}"`);
      }
      return { tree, hadError: tree.rootNode.hasError };
    } finally {
      parser.delete();
    }
  }
}

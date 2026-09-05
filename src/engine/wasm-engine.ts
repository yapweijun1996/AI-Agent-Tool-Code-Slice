import { Parser, Language } from "web-tree-sitter";
import type { Tree } from "web-tree-sitter";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CodeSliceError } from "../schema/errors.js";
import type { LoadedLanguage, ParseResult, ParserEngine } from "./parser-engine.js";

interface ManifestGrammar {
  language: string;
  wasmFile: string;
  sha256: string;
  sizeBytes?: number;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(value: unknown): Manifest {
  if (!isRecord(value) || value.schemaVersion !== "1.0" || !Array.isArray(value.grammars)) {
    throw new CodeSliceError("GRAMMAR_LOAD_FAILED", "Grammar manifest has an unsupported or invalid shape");
  }

  const grammars: ManifestGrammar[] = [];
  const ids = new Set<string>();
  for (const candidate of value.grammars) {
    if (!isRecord(candidate)) {
      throw new CodeSliceError("GRAMMAR_LOAD_FAILED", "Grammar manifest contains an invalid grammar entry");
    }
    const { language, wasmFile, sha256, sourcePackage, sourceVersion, sizeBytes } = candidate;
    if (
      typeof language !== "string" ||
      language.length === 0 ||
      typeof wasmFile !== "string" ||
      wasmFile.length === 0 ||
      wasmFile.includes("/") ||
      wasmFile.includes("\\") ||
      typeof sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(sha256) ||
      typeof sourcePackage !== "string" ||
      sourcePackage.length === 0 ||
      typeof sourceVersion !== "string" ||
      sourceVersion.length === 0 ||
      (sizeBytes !== undefined &&
        (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0))
    ) {
      throw new CodeSliceError("GRAMMAR_LOAD_FAILED", `Grammar manifest entry for "${String(language)}" is invalid`);
    }
    if (ids.has(language)) {
      throw new CodeSliceError("GRAMMAR_LOAD_FAILED", `Grammar manifest contains duplicate language "${language}"`);
    }
    ids.add(language);
    grammars.push({
      language,
      wasmFile,
      sha256,
      sourcePackage,
      sourceVersion,
      ...(typeof sizeBytes === "number" ? { sizeBytes } : {}),
    });
  }

  return { schemaVersion: "1.0", grammars };
}

function readManifest(): Manifest {
  if (manifestCache) return manifestCache;
  const manifestPath = path.join(wasmDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new CodeSliceError(
      "GRAMMAR_LOAD_FAILED",
      `Grammar manifest not found at ${manifestPath}. Run "npm run grammars:build".`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  } catch (err) {
    throw new CodeSliceError(
      "GRAMMAR_LOAD_FAILED",
      `Grammar manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  manifestCache = parseManifest(value);
  return manifestCache;
}

let parserInitPromise: Promise<void> | null = null;
function ensureParserInit(): Promise<void> {
  if (!parserInitPromise) {
    parserInitPromise = Parser.init().catch((err: unknown) => {
      parserInitPromise = null;
      throw new CodeSliceError(
        "GRAMMAR_LOAD_FAILED",
        `Failed to initialize web-tree-sitter: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
  return parserInitPromise;
}

/**
 * Default V0.1 parser backend: web-tree-sitter + pinned WASM grammars
 * (ADR 0001). Loaded languages are cached for the lifetime of the process.
 */
export class WasmEngine implements ParserEngine {
  private readonly loadedLanguages = new Map<string, { language: Language; version: string }>();
  private readonly loadingLanguages = new Map<string, Promise<LoadedLanguage>>();

  async loadLanguage(grammarId: string): Promise<LoadedLanguage> {
    const cached = this.loadedLanguages.get(grammarId);
    if (cached) {
      return { id: grammarId, version: cached.version };
    }

    const inFlight = this.loadingLanguages.get(grammarId);
    if (inFlight) return inFlight;

    const loading = this.loadLanguageUncached(grammarId);
    this.loadingLanguages.set(grammarId, loading);
    try {
      return await loading;
    } finally {
      if (this.loadingLanguages.get(grammarId) === loading) this.loadingLanguages.delete(grammarId);
    }
  }

  private async loadLanguageUncached(grammarId: string): Promise<LoadedLanguage> {

    const manifest = readManifest();
    const entry = manifest.grammars.find((g) => g.language === grammarId);
    if (!entry) {
      throw new CodeSliceError(
        "LANGUAGE_UNSUPPORTED",
        `No grammar registered for "${grammarId}" in grammars/wasm/manifest.json`,
      );
    }

    const wasmPath = path.resolve(wasmDir, entry.wasmFile);
    const relativeWasmPath = path.relative(wasmDir, wasmPath);
    if (relativeWasmPath.startsWith("..") || path.isAbsolute(relativeWasmPath)) {
      throw new CodeSliceError("GRAMMAR_LOAD_FAILED", `Grammar WASM path escapes the packaged grammar directory`);
    }
    if (!existsSync(wasmPath)) {
      throw new CodeSliceError("GRAMMAR_LOAD_FAILED", `Grammar WASM file missing: ${wasmPath}`);
    }
    let wasmStat;
    try {
      wasmStat = statSync(wasmPath);
    } catch (err) {
      throw new CodeSliceError(
        "GRAMMAR_LOAD_FAILED",
        `Could not inspect grammar WASM file ${wasmPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!wasmStat.isFile()) {
      throw new CodeSliceError("GRAMMAR_LOAD_FAILED", `Grammar WASM path is not a regular file: ${wasmPath}`);
    }
    if (entry.sizeBytes !== undefined && wasmStat.size !== entry.sizeBytes) {
      throw new CodeSliceError(
        "GRAMMAR_LOAD_FAILED",
        `Grammar WASM size mismatch for "${grammarId}" (manifest=${entry.sizeBytes} actual=${wasmStat.size})`,
      );
    }

    await ensureParserInit();

    let language: Language;
    try {
      language = await Language.load(wasmPath);
    } catch (err) {
      throw new CodeSliceError(
        "GRAMMAR_LOAD_FAILED",
        `Failed to load grammar "${grammarId}" from ${wasmPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.loadedLanguages.set(grammarId, { language, version: entry.sourceVersion });
    return { id: grammarId, version: entry.sourceVersion };
  }

  async withParse<T>(
    source: string,
    loaded: LoadedLanguage,
    visitor: (result: ParseResult) => Promise<T> | T,
  ): Promise<T> {
    const cached = this.loadedLanguages.get(loaded.id);
    if (!cached) {
      throw new CodeSliceError("INTERNAL_ERROR", `withParse() called before loadLanguage("${loaded.id}")`);
    }

    await ensureParserInit();
    const parser = new Parser();
    let tree: Tree | undefined;
    try {
      try {
        parser.setLanguage(cached.language);
        tree = parser.parse(source) ?? undefined;
        if (!tree) {
          throw new CodeSliceError("PARSE_FAILED", `Parser returned no tree for language "${loaded.id}"`);
        }
      } catch (err) {
        if (err instanceof CodeSliceError) throw err;
        throw new CodeSliceError(
          "PARSE_FAILED",
          `Failed to parse source with grammar "${loaded.id}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      return await visitor({ tree, hadError: tree.rootNode.hasError });
    } finally {
      tree?.delete();
      parser.delete();
    }
  }
}

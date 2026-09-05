import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { listAdapters } from "../languages/registry.js";
import { CodeSliceError } from "../schema/errors.js";
import type { Capabilities, LanguageCapability } from "../schema/types.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifestPath = path.join(packageRoot, "grammars", "wasm", "manifest.json");

interface ManifestGrammar {
  language: string;
  sourceVersion: string;
}

let manifestCache: { grammars: ManifestGrammar[] } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readManifest(): { grammars: ManifestGrammar[] } {
  if (manifestCache) return manifestCache;
  if (!existsSync(manifestPath)) {
    throw new CodeSliceError("GRAMMAR_LOAD_FAILED", `Grammar manifest not found at ${manifestPath}`);
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
  if (!isRecord(value) || !Array.isArray(value.grammars)) {
    throw new CodeSliceError("GRAMMAR_LOAD_FAILED", "Grammar manifest has an invalid capabilities shape");
  }

  const grammars: ManifestGrammar[] = [];
  for (const candidate of value.grammars) {
    if (
      !isRecord(candidate) ||
      typeof candidate.language !== "string" ||
      candidate.language.length === 0 ||
      typeof candidate.sourceVersion !== "string" ||
      candidate.sourceVersion.length === 0
    ) {
      throw new CodeSliceError("GRAMMAR_LOAD_FAILED", "Grammar manifest contains an invalid capabilities entry");
    }
    grammars.push({ language: candidate.language, sourceVersion: candidate.sourceVersion });
  }
  manifestCache = { grammars };
  return manifestCache;
}

function grammarVersion(grammarId: string): string {
  return readManifest().grammars.find((g) => g.language === grammarId)?.sourceVersion ?? "unknown";
}

export function buildCapabilities(): Capabilities {
  const languages: LanguageCapability[] = listAdapters().map((adapter) => {
    const cap: LanguageCapability = {
      id: adapter.id,
      extensions: [...adapter.extensions],
      grammarId: adapter.grammarId,
      grammarVersion: grammarVersion(adapter.grammarId),
    };
    if (adapter.embeddedLanguages) cap.embeddedLanguages = [...adapter.embeddedLanguages];
    return cap;
  });

  return {
    schemaVersion: "1.0",
    engine: "web-tree-sitter",
    operations: ["capabilities", "outline", "symbol", "line", "range"],
    languages,
  };
}

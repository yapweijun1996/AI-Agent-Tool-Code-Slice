import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { listAdapters } from "../languages/registry.js";
import type { Capabilities, LanguageCapability } from "../schema/types.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifestPath = path.join(packageRoot, "grammars", "wasm", "manifest.json");

interface ManifestGrammar {
  language: string;
  sourceVersion: string;
}

function grammarVersion(grammarId: string): string {
  if (!existsSync(manifestPath)) return "unknown";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { grammars: ManifestGrammar[] };
  return manifest.grammars.find((g) => g.language === grammarId)?.sourceVersion ?? "unknown";
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

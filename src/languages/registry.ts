import type { LanguageAdapter } from "./types.js";
import { javascriptAdapter } from "./javascript.js";
import { typescriptAdapter, tsxAdapter } from "./typescript.js";
import { pythonAdapter } from "./python.js";
import { cfmlAdapter } from "./cfml.js";
import { CodeSliceError } from "../schema/errors.js";

/**
 * The only place language adapters are registered. Core must never branch on
 * language id directly (AGENTS.md) — it goes through this registry instead.
 */
const adapters: LanguageAdapter[] = [javascriptAdapter, typescriptAdapter, tsxAdapter, pythonAdapter, cfmlAdapter];

export function listAdapters(): readonly LanguageAdapter[] {
  return adapters;
}

export function getAdapterById(id: string): LanguageAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

/**
 * Resolves a language adapter purely from file extension. Multiple adapters
 * claiming the same extension, or none matching, both fail closed rather
 * than guessing (AGENTS.md "never guess a symbol, language, or code boundary").
 */
export function detectAdapter(filePath: string): LanguageAdapter {
  const lower = filePath.toLowerCase();
  const matches = adapters.filter((a) => a.extensions.some((ext) => lower.endsWith(ext)));

  if (matches.length === 0) {
    throw new CodeSliceError(
      "LANGUAGE_UNSUPPORTED",
      `No language adapter registered for file extension of "${filePath}"`,
    );
  }
  if (matches.length > 1) {
    throw new CodeSliceError(
      "LANGUAGE_AMBIGUOUS",
      `Multiple language adapters match "${filePath}": ${matches.map((a) => a.id).join(", ")}`,
      { recoverable: true, candidates: matches.map((a) => ({ language: a.id })) },
    );
  }
  return matches[0]!;
}

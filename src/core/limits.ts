import { CodeSliceError } from "../schema/errors.js";
import type { SymbolBudget } from "../languages/types.js";

/** The default maximum source size accepted by the public Core API. */
export const DEFAULT_MAX_BYTES = 5_000_000;

/** A caller may narrow the input budget, but never raise it above this ceiling. */
export const MAX_MAX_BYTES = 10_000_000;

/** The default number of outline entries returned before an explicit warning. */
export const DEFAULT_MAX_SYMBOLS = 10_000;

/** Protects extraction from materializing an unbounded symbol inventory. */
export const MAX_EXTRACTED_SYMBOLS = 50_000;

/** Maximum serialized success envelope size accepted by Core. */
export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function normalizeBoundedInteger(
  name: string,
  value: unknown,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new CodeSliceError("INVALID_ARGUMENT", `${name} must be a safe integer`);
  }
  if (value < minimum || value > maximum) {
    throw new CodeSliceError(
      "INVALID_ARGUMENT",
      `${name} must be between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

export function normalizeMaxBytes(value: unknown): number {
  return normalizeBoundedInteger("maxBytes", value, DEFAULT_MAX_BYTES, 0, MAX_MAX_BYTES);
}

export function normalizeMaxSymbols(value: unknown): number {
  return normalizeBoundedInteger("maxSymbols", value, DEFAULT_MAX_SYMBOLS, 0, MAX_EXTRACTED_SYMBOLS);
}

export function normalizeMaxOutputBytes(value: unknown): number {
  return normalizeBoundedInteger("maxOutputBytes", value, MAX_OUTPUT_BYTES, 1, MAX_OUTPUT_BYTES);
}

export function createSymbolBudget(maxSymbols = MAX_EXTRACTED_SYMBOLS): SymbolBudget {
  const boundedMaxSymbols = normalizeBoundedInteger(
    "maxSymbols",
    maxSymbols,
    MAX_EXTRACTED_SYMBOLS,
    0,
    MAX_EXTRACTED_SYMBOLS,
  );
  let count = 0;

  return {
    maxSymbols: boundedMaxSymbols,
    consume(amount = 1) {
      if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new CodeSliceError("INTERNAL_ERROR", "Symbol budget received an invalid increment");
      }
      if (count + amount > boundedMaxSymbols) {
        throw new CodeSliceError(
          "OUTPUT_LIMIT_EXCEEDED",
          `Symbol extraction exceeded the ${boundedMaxSymbols}-symbol safety limit`,
        );
      }
      count += amount;
    },
  };
}

export function assertSerializedOutputWithinLimit(value: unknown, maxBytes: number): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new CodeSliceError("OUTPUT_LIMIT_EXCEEDED", "Result could not be serialized as JSON");
  }
  const actualBytes = Buffer.byteLength(serialized, "utf8");
  if (actualBytes > maxBytes) {
    throw new CodeSliceError(
      "OUTPUT_LIMIT_EXCEEDED",
      `Serialized result is ${actualBytes} bytes, exceeding the ${maxBytes}-byte output limit`,
    );
  }
}

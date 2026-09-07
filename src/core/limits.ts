import { CodeSliceError } from "../schema/errors.js";
import { buildCliErrorEnvelope, buildErrorEnvelope } from "../schema/envelope.js";
import type { CliErrorEnvelope, ResultEnvelope } from "../schema/envelope.js";
import type { SymbolBudget } from "../languages/types.js";

/** The default maximum source size accepted by the public Core API. */
export const DEFAULT_MAX_BYTES = 5_000_000;

/** A caller may narrow the input budget, but never raise it above this ceiling. */
export const MAX_MAX_BYTES = 10_000_000;

/** The default number of full-outline entries returned before an explicit warning. */
export const DEFAULT_MAX_SYMBOLS = 10_000;

/** Agent-focused compact outlines default to a small page rather than a near-unbounded inventory. */
export const DEFAULT_COMPACT_OUTLINE_SYMBOLS = 200;

/** Protects extraction from materializing an unbounded symbol inventory. */
export const MAX_EXTRACTED_SYMBOLS = 50_000;

/** Maximum serialized result or error envelope size accepted by Core. */
export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Smallest budget that can carry a complete machine-readable error envelope. */
export const MIN_OUTPUT_BYTES = 256;

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
  return normalizeBoundedInteger(
    "maxOutputBytes",
    value,
    MAX_OUTPUT_BYTES,
    MIN_OUTPUT_BYTES,
    MAX_OUTPUT_BYTES,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a caller's output budget before full request validation. Invalid
 * requests use the process-wide hard ceiling so the validation error itself
 * can still be delivered safely.
 */
export function requestedMaxOutputBytesOrDefault(value: unknown): number {
  try {
    return normalizeMaxOutputBytes(isRecord(value) ? value.maxOutputBytes : undefined);
  } catch {
    return MAX_OUTPUT_BYTES;
  }
}

function serializedByteLength(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? undefined : Buffer.byteLength(serialized, "utf8");
  } catch {
    return undefined;
  }
}

function fitsOutputBudget(value: unknown, maxBytes: number): boolean {
  const byteLength = serializedByteLength(value);
  return byteLength !== undefined && byteLength <= maxBytes;
}

/**
 * Finalizes every Core envelope at the delivery boundary. A result is either
 * returned intact or replaced by a compact, schema-valid limit error; it is
 * never silently truncated.
 */
export function finalizeResultEnvelope(envelope: ResultEnvelope, maxBytes: number): ResultEnvelope {
  if (fitsOutputBudget(envelope, maxBytes)) return envelope;

  return buildErrorEnvelope({
    operation: envelope.operation,
    error: new CodeSliceError(
      "OUTPUT_LIMIT_EXCEEDED",
      "Output exceeds the requested maxOutputBytes.",
    ),
  });
}

/** Bounds CLI usage errors by the process-wide hard ceiling. */
export function finalizeCliErrorEnvelope(envelope: CliErrorEnvelope): CliErrorEnvelope {
  if (fitsOutputBudget(envelope, MAX_OUTPUT_BYTES)) return envelope;

  return buildCliErrorEnvelope(
    new CodeSliceError("OUTPUT_LIMIT_EXCEEDED", "CLI error exceeds the output safety limit."),
  );
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
  const byteLength = serializedByteLength(value);
  if (byteLength === undefined) {
    throw new CodeSliceError("OUTPUT_LIMIT_EXCEEDED", "Result could not be serialized as JSON");
  }
  if (byteLength > maxBytes) {
    throw new CodeSliceError(
      "OUTPUT_LIMIT_EXCEEDED",
      `Serialized result is ${byteLength} bytes, exceeding the ${maxBytes}-byte output limit`,
    );
  }
}

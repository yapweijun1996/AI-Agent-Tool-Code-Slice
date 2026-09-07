import { SYMBOL_KINDS, type Selector, type SymbolKind } from "../schema/types.js";
import { CodeSliceError } from "../schema/errors.js";
import type { FileParams, OutlineParams, SliceParams } from "./index.js";
import {
  MAX_EXTRACTED_SYMBOLS,
  normalizeBoundedInteger,
  normalizeMaxBytes,
  normalizeMaxOutputBytes,
  normalizeMaxSymbols,
} from "./limits.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new CodeSliceError("INVALID_ARGUMENT", `${label} must be an object`);
  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CodeSliceError("INVALID_ARGUMENT", `${label} must be a non-empty string`);
  }
  return value;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireNonEmptyString(value, label);
}

function optionalKind(value: unknown, label: string): SymbolKind | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(SYMBOL_KINDS as readonly string[]).includes(value)) {
    throw new CodeSliceError("INVALID_ARGUMENT", `${label} must be one of: ${SYMBOL_KINDS.join(", ")}`);
  }
  return value as SymbolKind;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new CodeSliceError("INVALID_ARGUMENT", `${label} must be a boolean`);
  }
  return value;
}

function optionalBoundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  return normalizeBoundedInteger(label, value, 0, minimum, maximum);
}

function validateBaseParams(value: unknown): FileParams {
  const record = requireRecord(value, "request");
  const file = requireNonEmptyString(record.file, "file");
  const root = optionalNonEmptyString(record.root, "root");
  const language = optionalNonEmptyString(record.language, "language");
  const maxBytes = record.maxBytes === undefined ? undefined : normalizeMaxBytes(record.maxBytes);
  const maxOutputBytes =
    record.maxOutputBytes === undefined ? undefined : normalizeMaxOutputBytes(record.maxOutputBytes);

  return {
    file,
    ...(root !== undefined ? { root } : {}),
    ...(language !== undefined ? { language } : {}),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    ...(maxOutputBytes !== undefined ? { maxOutputBytes } : {}),
  };
}

export function validateOutlineParams(value: unknown): OutlineParams {
  const record = requireRecord(value, "request");
  const base = validateBaseParams(value);
  const kind = optionalKind(record.kind, "kind");
  const maxSymbols = record.maxSymbols === undefined ? undefined : normalizeMaxSymbols(record.maxSymbols);
  const topLevel = optionalBoolean(record.topLevel, "topLevel");
  const includeLocals = optionalBoolean(record.includeLocals, "includeLocals");
  return {
    ...base,
    ...(kind !== undefined ? { kind } : {}),
    ...(maxSymbols !== undefined ? { maxSymbols } : {}),
    ...(topLevel !== undefined ? { topLevel } : {}),
    ...(includeLocals !== undefined ? { includeLocals } : {}),
  };
}

function validateSelector(value: unknown): Selector {
  const record = requireRecord(value, "selector");
  const type = record.type;
  if (type === "symbol") {
    const name = requireNonEmptyString(record.name, "selector.name");
    const kind = optionalKind(record.kind, "selector.kind");
    const occurrence = optionalBoundedInteger(record.occurrence, "selector.occurrence", 1, MAX_EXTRACTED_SYMBOLS);
    return {
      type,
      name,
      ...(kind !== undefined ? { kind } : {}),
      ...(occurrence !== undefined ? { occurrence } : {}),
    };
  }

  if (type === "line") {
    const line = optionalBoundedInteger(record.line, "selector.line", 1, Number.MAX_SAFE_INTEGER);
    if (line === undefined) throw new CodeSliceError("INVALID_ARGUMENT", "selector.line is required");
    return { type, line };
  }

  if (type === "range") {
    const startLine = optionalBoundedInteger(record.startLine, "selector.startLine", 1, Number.MAX_SAFE_INTEGER);
    const endLine = optionalBoundedInteger(record.endLine, "selector.endLine", 1, Number.MAX_SAFE_INTEGER);
    if (startLine === undefined || endLine === undefined) {
      throw new CodeSliceError("INVALID_ARGUMENT", "selector.startLine and selector.endLine are required");
    }
    if (startLine > endLine) {
      throw new CodeSliceError("RANGE_INVALID", "selector.startLine must be less than or equal to selector.endLine");
    }
    const expand = optionalBoolean(record.expand, "selector.expand");
    const smallest = optionalBoolean(record.smallest, "selector.smallest");
    const clamp = optionalBoolean(record.clamp, "selector.clamp");
    if (expand && smallest) {
      throw new CodeSliceError("INVALID_ARGUMENT", "selector.expand and selector.smallest are mutually exclusive");
    }
    return {
      type,
      startLine,
      endLine,
      ...(expand !== undefined ? { expand } : {}),
      ...(smallest !== undefined ? { smallest } : {}),
      ...(clamp !== undefined ? { clamp } : {}),
    };
  }

  throw new CodeSliceError("INVALID_ARGUMENT", "selector.type must be one of: symbol, line, range");
}

export function validateSliceParams(value: unknown): SliceParams {
  const record = requireRecord(value, "request");
  const base = validateBaseParams(value);
  const maxLines = optionalBoundedInteger(record.maxLines, "maxLines", 1, Number.MAX_SAFE_INTEGER);
  return {
    ...base,
    selector: validateSelector(record.selector),
    ...(maxLines !== undefined ? { maxLines } : {}),
  };
}

export function fileForError(value: unknown): string | undefined {
  return isRecord(value) && typeof value.file === "string" ? value.file : undefined;
}

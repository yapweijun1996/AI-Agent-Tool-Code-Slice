import type { Diagnostic } from "./types.js";
import type { CodeSliceError } from "./errors.js";

export type Operation = "capabilities" | "outline" | "slice";

export interface EnvelopeMeta {
  engine?: string;
  parserMs?: number;
  [key: string]: unknown;
}

export interface SuccessEnvelope<TResult = unknown> {
  schemaVersion: "1.0";
  ok: true;
  operation: Operation;
  file?: string;
  language?: string | null;
  result: TResult;
  warnings: Diagnostic[];
  meta?: EnvelopeMeta;
}

export interface ErrorEnvelope {
  schemaVersion: "1.0";
  ok: false;
  operation: Operation;
  file?: string;
  language?: string | null;
  error: {
    code: string;
    message: string;
    recoverable: boolean;
    candidates?: unknown[];
  };
  warnings: Diagnostic[];
}

export type ResultEnvelope<TResult = unknown> = SuccessEnvelope<TResult> | ErrorEnvelope;

export function buildSuccessEnvelope<TResult>(params: {
  operation: Operation;
  file?: string;
  language?: string | null;
  result: TResult;
  warnings?: Diagnostic[];
  meta?: EnvelopeMeta;
}): SuccessEnvelope<TResult> {
  const envelope: SuccessEnvelope<TResult> = {
    schemaVersion: "1.0",
    ok: true,
    operation: params.operation,
    result: params.result,
    warnings: params.warnings ?? [],
  };
  if (params.file !== undefined) envelope.file = params.file;
  if (params.language !== undefined) envelope.language = params.language;
  if (params.meta !== undefined) envelope.meta = params.meta;
  return envelope;
}

export function buildErrorEnvelope(params: {
  operation: Operation;
  file?: string;
  language?: string | null;
  error: CodeSliceError;
  warnings?: Diagnostic[];
}): ErrorEnvelope {
  const envelope: ErrorEnvelope = {
    schemaVersion: "1.0",
    ok: false,
    operation: params.operation,
    error: {
      code: params.error.code,
      message: params.error.message,
      recoverable: params.error.recoverable,
      ...(params.error.candidates !== undefined ? { candidates: params.error.candidates } : {}),
    },
    warnings: params.warnings ?? [],
  };
  if (params.file !== undefined) envelope.file = params.file;
  if (params.language !== undefined) envelope.language = params.language;
  return envelope;
}

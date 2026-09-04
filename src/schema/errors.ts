/**
 * Stable V0.1 error codes. See docs/JSON_SCHEMA.md "Error codes".
 * Reuse these; do not invent new codes without a contract-doc update.
 */
export const ERROR_CODES = [
  "FILE_NOT_FOUND",
  "FILE_OUTSIDE_ROOT",
  "FILE_TOO_LARGE",
  "ENCODING_UNSUPPORTED",
  "LANGUAGE_UNSUPPORTED",
  "LANGUAGE_AMBIGUOUS",
  "GRAMMAR_LOAD_FAILED",
  "PARSE_FAILED",
  "SYMBOL_NOT_FOUND",
  "SYMBOL_AMBIGUOUS",
  "LINE_OUT_OF_RANGE",
  "RANGE_INVALID",
  "OUTPUT_LIMIT_EXCEEDED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface CodeSliceErrorOptions {
  recoverable?: boolean;
  candidates?: unknown[];
}

/**
 * Thrown by Core/engine/adapter code and caught exactly once at the delivery
 * boundary (CLI, JS API entry point) to build the JSON error envelope.
 * Never guess past this: ambiguity and malformed input surface as one of
 * these, with explicit candidates when recoverable, per AGENTS.md "fail closed".
 */
export class CodeSliceError extends Error {
  readonly code: ErrorCode;
  readonly recoverable: boolean;
  readonly candidates?: unknown[];

  constructor(code: ErrorCode, message: string, options: CodeSliceErrorOptions = {}) {
    super(message);
    this.name = "CodeSliceError";
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.candidates = options.candidates;
  }
}

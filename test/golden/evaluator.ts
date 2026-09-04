import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { outline, slice, type ResultEnvelope, type Selector } from "../../src/core/index.js";
import { SYMBOL_KINDS, type SymbolKind } from "../../src/schema/types.js";

export const GOLDEN_OPERATIONS = ["outline", "symbol", "line", "range"] as const;
export type GoldenOperation = (typeof GOLDEN_OPERATIONS)[number];

export interface GoldenSymbolSelector {
  name: string;
  kind?: SymbolKind;
  occurrence?: number;
}

export interface GoldenLineSelector {
  line: number;
}

export interface GoldenRangeSelector {
  startLine: number;
  endLine: number;
  expand?: boolean;
}

export type GoldenSelector = GoldenSymbolSelector | GoldenLineSelector | GoldenRangeSelector;

interface RangeExpectation {
  startLine?: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
  startByte?: number;
  endByte?: number;
}

export interface GoldenExpectedSymbol extends RangeExpectation {
  kind?: string;
  name?: string | null;
  embeddedLanguage?: string;
  signature?: string | null;
}

export interface GoldenExpected extends RangeExpectation {
  ok?: boolean;
  errorCode?: string;
  recoverable?: boolean;
  candidateCount?: number;
  kind?: string;
  name?: string | null;
  embeddedLanguage?: string;
  signature?: string | null;
  code?: string;
  codeIncludes?: string[];
  warningCodes?: string[];
  symbolCount?: number;
  symbols?: GoldenExpectedSymbol[];
}

export interface GoldenCase {
  id: string;
  file: string;
  operation: GoldenOperation;
  selector?: GoldenSelector;
  expected: GoldenExpected;
}

export interface GoldenFailure {
  id: string;
  file: string;
  message: string;
}

export interface GoldenRunResult {
  total: number;
  passed: number;
  failures: GoldenFailure[];
}

const goldenDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(goldenDir, "..", "..");
const casesDir = path.join(goldenDir, "cases");
const schema = JSON.parse(readFileSync(path.join(repoRoot, "schemas", "code-slice-result-v1.schema.json"), "utf8")) as object;
const schemaValidator = new Ajv2020({ strict: false }).compile(schema);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, label);
}

function requireInteger(value: unknown, label: string, minimum = 1): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return value as number;
}

function optionalInteger(value: unknown, label: string, minimum = 1): number | undefined {
  if (value === undefined) return undefined;
  return requireInteger(value, label, minimum);
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function optionalNullableString(value: unknown, label: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  return requireString(value, label);
}

function parseWarningCodes(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((code) => typeof code !== "string" || code.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return [...value] as string[];
}

function parseCodeIncludes(value: unknown): string[] | undefined {
  return parseWarningCodes(value, "expected.codeIncludes");
}

function parseExpectedSymbol(value: unknown, index: number): GoldenExpectedSymbol {
  const record = requireRecord(value, `expected.symbols[${index}]`);
  const kind = optionalString(record.kind, `expected.symbols[${index}].kind`);
  const name = optionalNullableString(record.name, `expected.symbols[${index}].name`);
  const embeddedLanguage = optionalString(record.embeddedLanguage, `expected.symbols[${index}].embeddedLanguage`);
  const startLine = optionalInteger(record.startLine, `expected.symbols[${index}].startLine`);
  const endLine = optionalInteger(record.endLine, `expected.symbols[${index}].endLine`);
  const startColumn = optionalInteger(record.startColumn, `expected.symbols[${index}].startColumn`);
  const endColumn = optionalInteger(record.endColumn, `expected.symbols[${index}].endColumn`);
  const startByte = optionalInteger(record.startByte, `expected.symbols[${index}].startByte`, 0);
  const endByte = optionalInteger(record.endByte, `expected.symbols[${index}].endByte`, 0);
  const signature = optionalNullableString(record.signature, `expected.symbols[${index}].signature`);

  if (kind === undefined && name === undefined && startLine === undefined && endLine === undefined) {
    throw new Error(`expected.symbols[${index}] must assert kind, name, startLine, or endLine`);
  }

  return { kind, name, embeddedLanguage, startLine, endLine, startColumn, endColumn, startByte, endByte, signature };
}

function parseExpected(value: unknown): GoldenExpected {
  const record = requireRecord(value, "expected");
  const ok = record.ok;
  if (ok !== undefined && typeof ok !== "boolean") throw new Error("expected.ok must be a boolean");

  const errorCode = optionalString(record.errorCode, "expected.errorCode");
  const recoverable = record.recoverable;
  if (recoverable !== undefined && typeof recoverable !== "boolean") {
    throw new Error("expected.recoverable must be a boolean");
  }
  const candidateCount = optionalInteger(record.candidateCount, "expected.candidateCount", 0);
  const kind = optionalString(record.kind, "expected.kind");
  const name = optionalNullableString(record.name, "expected.name");
  const embeddedLanguage = optionalString(record.embeddedLanguage, "expected.embeddedLanguage");
  const signature = optionalNullableString(record.signature, "expected.signature");
  const startLine = optionalInteger(record.startLine, "expected.startLine");
  const endLine = optionalInteger(record.endLine, "expected.endLine");
  const startColumn = optionalInteger(record.startColumn, "expected.startColumn");
  const endColumn = optionalInteger(record.endColumn, "expected.endColumn");
  const startByte = optionalInteger(record.startByte, "expected.startByte", 0);
  const endByte = optionalInteger(record.endByte, "expected.endByte", 0);
  const code = record.code;
  if (code !== undefined && typeof code !== "string") throw new Error("expected.code must be a string");
  const codeIncludes = parseCodeIncludes(record.codeIncludes);
  const warningCodes = parseWarningCodes(record.warningCodes, "expected.warningCodes");
  const symbolCount = optionalInteger(record.symbolCount, "expected.symbolCount", 0);
  const symbolsValue = record.symbols;
  if (symbolsValue !== undefined && !Array.isArray(symbolsValue)) throw new Error("expected.symbols must be an array");
  const symbols = symbolsValue?.map(parseExpectedSymbol);

  if (ok === false) {
    if (errorCode === undefined) throw new Error("failed cases must declare expected.errorCode");
    if (
      kind !== undefined ||
      name !== undefined ||
      embeddedLanguage !== undefined ||
      signature !== undefined ||
      startLine !== undefined ||
      endLine !== undefined ||
      startColumn !== undefined ||
      endColumn !== undefined ||
      startByte !== undefined ||
      endByte !== undefined ||
      code !== undefined ||
      codeIncludes !== undefined ||
      symbolCount !== undefined ||
      symbols !== undefined
    ) {
      throw new Error("failed cases may only assert errorCode, recoverable, candidateCount, and warningCodes");
    }
  } else {
    if (errorCode !== undefined) throw new Error("successful cases must not declare expected.errorCode");
    if (recoverable !== undefined || candidateCount !== undefined) {
      throw new Error("successful cases may not declare recoverable or candidateCount");
    }
  }

  const hasSuccessAssertion =
    kind !== undefined ||
    name !== undefined ||
    embeddedLanguage !== undefined ||
    signature !== undefined ||
    startLine !== undefined ||
    endLine !== undefined ||
    startColumn !== undefined ||
    endColumn !== undefined ||
    startByte !== undefined ||
    endByte !== undefined ||
    code !== undefined ||
    codeIncludes !== undefined ||
    warningCodes !== undefined ||
    symbolCount !== undefined ||
    symbols !== undefined;
  if (ok !== false && !hasSuccessAssertion) throw new Error("successful cases must assert at least one result field");

  return {
    ok,
    errorCode,
    recoverable,
    candidateCount,
    kind,
    name,
    embeddedLanguage,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn,
    startByte,
    endByte,
    code,
    codeIncludes,
    warningCodes,
    symbolCount,
    symbols,
  };
}

function parseSelector(operation: GoldenOperation, value: unknown): GoldenSelector | undefined {
  if (operation === "outline") {
    if (value !== undefined) throw new Error("outline cases must not declare selector");
    return undefined;
  }

  const record = requireRecord(value, `${operation} selector`);
  if (operation === "symbol") {
    const name = requireString(record.name, "symbol selector.name");
    const kindValue = record.kind;
    let kind: SymbolKind | undefined;
    if (kindValue !== undefined) {
      if (typeof kindValue !== "string" || !(SYMBOL_KINDS as readonly string[]).includes(kindValue)) {
        throw new Error(`symbol selector.kind must be one of: ${SYMBOL_KINDS.join(", ")}`);
      }
      kind = kindValue as SymbolKind;
    }
    const occurrence = optionalInteger(record.occurrence, "symbol selector.occurrence");
    return { name, ...(kind !== undefined ? { kind } : {}), ...(occurrence !== undefined ? { occurrence } : {}) };
  }

  if (operation === "line") {
    return { line: requireInteger(record.line, "line selector.line") };
  }

  const startLine = requireInteger(record.startLine, "range selector.startLine");
  const endLine = requireInteger(record.endLine, "range selector.endLine");
  if (startLine > endLine) throw new Error("range selector.startLine must be <= endLine");
  const expand = optionalBoolean(record.expand, "range selector.expand");
  return { startLine, endLine, ...(expand !== undefined ? { expand } : {}) };
}

function resolveCaseFile(file: string): string {
  const resolved = path.resolve(repoRoot, file);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`case file must stay inside the repository: ${file}`);
  }
  return resolved;
}

export function parseGoldenCase(value: unknown, sourceName = "case"): GoldenCase {
  const record = requireRecord(value, sourceName);
  const id = requireString(record.id, `${sourceName}.id`);
  const file = requireString(record.file, `${sourceName}.file`);
  if (path.isAbsolute(file) || path.win32.isAbsolute(file)) {
    throw new Error(`${sourceName}.file must be repository-relative`);
  }
  resolveCaseFile(file);

  const operationValue = requireString(record.operation, `${sourceName}.operation`);
  if (!(GOLDEN_OPERATIONS as readonly string[]).includes(operationValue)) {
    throw new Error(`${sourceName}.operation must be one of: ${GOLDEN_OPERATIONS.join(", ")}`);
  }
  const operation = operationValue as GoldenOperation;
  const selector = parseSelector(operation, record.selector);
  const expected = parseExpected(record.expected);

  if (operation !== "outline" && expected.symbols !== undefined) {
    throw new Error(`${sourceName}: expected.symbols is only valid for outline cases`);
  }

  return { id, file, operation, selector, expected };
}

export function loadGoldenCases(directory = casesDir): GoldenCase[] {
  if (!existsSync(directory)) throw new Error(`Golden Eval cases directory not found: ${directory}`);
  const caseFiles = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  if (caseFiles.length === 0) throw new Error(`No Golden Eval case files found in ${directory}`);

  const cases = caseFiles.map((name) => {
    const casePath = path.join(directory, name);
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(casePath, "utf8")) as unknown;
    } catch (error) {
      throw new Error(`Could not parse ${casePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseGoldenCase(value, path.relative(repoRoot, casePath));
  });

  const ids = new Set<string>();
  for (const goldenCase of cases) {
    if (ids.has(goldenCase.id)) throw new Error(`Duplicate Golden Eval case id: ${goldenCase.id}`);
    ids.add(goldenCase.id);
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

function selectorFor(goldenCase: GoldenCase): Selector | undefined {
  if (goldenCase.operation === "outline") return undefined;
  if (!goldenCase.selector) throw new Error(`${goldenCase.id}: selector is required for ${goldenCase.operation}`);
  switch (goldenCase.operation) {
    case "symbol": {
      if (!("name" in goldenCase.selector)) throw new Error(`${goldenCase.id}: invalid symbol selector`);
      return {
        type: "symbol",
        name: goldenCase.selector.name,
        ...(goldenCase.selector.kind !== undefined ? { kind: goldenCase.selector.kind } : {}),
        ...(goldenCase.selector.occurrence !== undefined ? { occurrence: goldenCase.selector.occurrence } : {}),
      };
    }
    case "line": {
      if (!("line" in goldenCase.selector)) throw new Error(`${goldenCase.id}: invalid line selector`);
      return { type: "line", line: goldenCase.selector.line };
    }
    case "range": {
      if (!("startLine" in goldenCase.selector) || !("endLine" in goldenCase.selector)) {
        throw new Error(`${goldenCase.id}: invalid range selector`);
      }
      return {
        type: "range",
        startLine: goldenCase.selector.startLine,
        endLine: goldenCase.selector.endLine,
        ...(goldenCase.selector.expand !== undefined ? { expand: goldenCase.selector.expand } : {}),
      };
    }
  }
}

async function executeCase(goldenCase: GoldenCase): Promise<ResultEnvelope> {
  const file = resolveCaseFile(goldenCase.file);
  if (goldenCase.operation === "outline") return outline({ file, root: repoRoot });
  return slice({ file, root: repoRoot, selector: selectorFor(goldenCase)! });
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function expectEqual(label: string, actual: unknown, expected: unknown): void {
  if (stringify(actual) !== stringify(expected)) {
    throw new Error(`${label}: expected ${stringify(expected)}, got ${stringify(actual)}`);
  }
}

function expectIncludes(label: string, actual: string, expected: string): void {
  if (!actual.includes(expected)) throw new Error(`${label}: expected code to include ${JSON.stringify(expected)}`);
}

function assertRange(result: Record<string, unknown>, expected: RangeExpectation, label: string): void {
  const range = requireRecord(result.range, `${label}.range`);
  const fields: Array<keyof RangeExpectation> = [
    "startLine",
    "endLine",
    "startColumn",
    "endColumn",
    "startByte",
    "endByte",
  ];
  for (const field of fields) {
    const value = expected[field];
    if (value !== undefined) expectEqual(`${label}.range.${field}`, range[field], value);
  }
}

function assertSymbolFields(actual: unknown, expected: GoldenExpected | GoldenExpectedSymbol, label: string): void {
  const result = requireRecord(actual, label);
  if (expected.kind !== undefined) expectEqual(`${label}.kind`, result.kind, expected.kind);
  if (expected.name !== undefined) expectEqual(`${label}.name`, result.name, expected.name);
  if (expected.embeddedLanguage !== undefined) {
    expectEqual(`${label}.embeddedLanguage`, result.embeddedLanguage, expected.embeddedLanguage);
  }
  if (expected.signature !== undefined) expectEqual(`${label}.signature`, result.signature, expected.signature);
  if (
    expected.startLine !== undefined ||
    expected.endLine !== undefined ||
    expected.startColumn !== undefined ||
    expected.endColumn !== undefined ||
    expected.startByte !== undefined ||
    expected.endByte !== undefined
  ) {
    assertRange(result, expected, label);
  }
}

function assertSuccess(envelope: ResultEnvelope, goldenCase: GoldenCase): void {
  const expected = goldenCase.expected;
  if (!envelope.ok) throw new Error(`expected success, got error ${envelope.error.code}`);
  const result = requireRecord(envelope.result, `${goldenCase.id}.result`);

  assertSymbolFields(result, expected, goldenCase.id);

  if (expected.code !== undefined) expectEqual(`${goldenCase.id}.code`, result.code, expected.code);
  if (expected.codeIncludes !== undefined) {
    const code = result.code;
    if (typeof code !== "string") throw new Error(`${goldenCase.id}.result.code must be a string`);
    for (const fragment of expected.codeIncludes) expectIncludes(`${goldenCase.id}.code`, code, fragment);
  }
  if (expected.warningCodes !== undefined) {
    expectEqual(
      `${goldenCase.id}.warningCodes`,
      envelope.warnings.map((warning) => warning.code),
      expected.warningCodes,
    );
  }

  if (expected.symbolCount !== undefined || expected.symbols !== undefined) {
    if (goldenCase.operation !== "outline") throw new Error("expected.symbolCount/symbols require operation outline");
    const symbols = result.symbols;
    if (!Array.isArray(symbols)) throw new Error(`${goldenCase.id}.result.symbols must be an array`);
    if (expected.symbolCount !== undefined) expectEqual(`${goldenCase.id}.symbolCount`, symbols.length, expected.symbolCount);
    if (expected.symbols !== undefined) {
      expectEqual(`${goldenCase.id}.symbols.length`, symbols.length, expected.symbols.length);
      expected.symbols.forEach((symbol, index) => assertSymbolFields(symbols[index], symbol, `${goldenCase.id}.symbols[${index}]`));
    }
  }
}

function assertSchema(envelope: ResultEnvelope, goldenCase: GoldenCase): void {
  if (!schemaValidator(envelope)) {
    const ajv = schemaValidator.errors ? JSON.stringify(schemaValidator.errors) : "unknown schema error";
    throw new Error(`${goldenCase.id}: result does not validate against the v1 JSON Schema: ${ajv}`);
  }
}

function assertFailure(envelope: ResultEnvelope, goldenCase: GoldenCase): void {
  const expected = goldenCase.expected;
  if (envelope.ok) throw new Error(`expected error ${expected.errorCode}, got success`);
  expectEqual(`${goldenCase.id}.errorCode`, envelope.error.code, expected.errorCode);
  if (expected.recoverable !== undefined) expectEqual(`${goldenCase.id}.recoverable`, envelope.error.recoverable, expected.recoverable);
  if (expected.candidateCount !== undefined) {
    expectEqual(`${goldenCase.id}.candidateCount`, envelope.error.candidates?.length ?? 0, expected.candidateCount);
  }
  if (expected.warningCodes !== undefined) {
    expectEqual(
      `${goldenCase.id}.warningCodes`,
      envelope.warnings.map((warning) => warning.code),
      expected.warningCodes,
    );
  }
}

export async function evaluateGoldenCases(goldenCases = loadGoldenCases()): Promise<GoldenRunResult> {
  const failures: GoldenFailure[] = [];
  for (const goldenCase of goldenCases) {
    try {
      const envelope = await executeCase(goldenCase);
      assertSchema(envelope, goldenCase);
      if (goldenCase.expected.ok === false) assertFailure(envelope, goldenCase);
      else assertSuccess(envelope, goldenCase);
    } catch (error) {
      failures.push({
        id: goldenCase.id,
        file: goldenCase.file,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { total: goldenCases.length, passed: goldenCases.length - failures.length, failures };
}

import type { SourceRange } from "./types.js";

/**
 * The one place coordinate systems get converted. Do not compute startByte/
 * endByte anywhere else.
 *
 * Empirically verified (see grammars build spike): when web-tree-sitter parses
 * a JS string, `node.startIndex`/`endIndex` AND `node.startPosition.column` /
 * `node.endPosition.column` are all UTF-16 code-unit offsets — the same units
 * as JS string indexing — not UTF-8 byte offsets. `row` is a plain 0-based
 * line count, unaffected by encoding.
 *
 * The public JSON contract (docs/JSON_SCHEMA.md) requires 1-based line/column
 * and 0-based UTF-8 *byte* offsets. So:
 *  - line/column: take tree-sitter's row/column directly and add 1.
 *  - startByte/endByte: re-encode the UTF-16 prefix up to that position as
 *    UTF-8 and measure its length. Done once per row via a precomputed
 *    line-start byte-offset table so it stays O(line length) per node
 *    instead of O(file length).
 *  - extracted `code` text: always sliced from the source string using the
 *    raw (UTF-16 code-unit) startIndex/endIndex, since that is what JS
 *    string slicing expects — never re-derived from startByte/endByte.
 */

interface TSPoint {
  row: number;
  column: number;
}

interface TSNodeLike {
  startPosition: TSPoint;
  endPosition: TSPoint;
  startIndex: number;
  endIndex: number;
}

export class SourceIndex {
  private readonly lines: string[];
  private readonly lineStartByteOffsets: number[];

  constructor(private readonly source: string) {
    this.lines = source.split("\n");
    this.lineStartByteOffsets = new Array(this.lines.length);
    let offset = 0;
    for (let i = 0; i < this.lines.length; i++) {
      this.lineStartByteOffsets[i] = offset;
      const line = this.lines[i] ?? "";
      offset += Buffer.byteLength(line, "utf8") + 1; // +1 for the '\n' this split() consumed
    }
  }

  private byteOffsetAt(position: TSPoint): number {
    const lineStart = this.lineStartByteOffsets[position.row] ?? 0;
    const line = this.lines[position.row] ?? "";
    const withinLine = Buffer.byteLength(line.slice(0, position.column), "utf8");
    return lineStart + withinLine;
  }

  toSourceRange(node: TSNodeLike): SourceRange {
    return {
      startLine: node.startPosition.row + 1,
      startColumn: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      startByte: this.byteOffsetAt(node.startPosition),
      endByte: this.byteOffsetAt(node.endPosition),
    };
  }

  /** Total 1-based line count, used for LINE_OUT_OF_RANGE bounds checking. */
  get lineCount(): number {
    return this.lines.length;
  }

  textOf(node: TSNodeLike): string {
    return this.source.slice(node.startIndex, node.endIndex);
  }

  /**
   * Builds a SourceRange for a raw 1-based [startLine, endLine] span (used by
   * the `line`/`range` selectors, which name lines rather than tree nodes).
   * endColumn is one-past-the-last-character of endLine, matching tree-sitter's
   * own end-position convention.
   */
  lineRange(startLine: number, endLine: number): SourceRange {
    const startPoint: TSPoint = { row: startLine - 1, column: 0 };
    const endLineText = this.lines[endLine - 1] ?? "";
    const endPoint: TSPoint = { row: endLine - 1, column: endLineText.length };
    return {
      startLine,
      startColumn: 1,
      endLine,
      endColumn: endLineText.length + 1,
      startByte: this.byteOffsetAt(startPoint),
      endByte: this.byteOffsetAt(endPoint),
    };
  }

  /**
   * Returns the byte span of the meaningful content at the edges of a line
   * selection. Leading/trailing whitespace and blank boundary lines are
   * ignored only for container resolution; the public selected range remains
   * the exact requested line span.
   */
  contentByteRangeForLines(startLine: number, endLine: number): Pick<SourceRange, "startByte" | "endByte"> {
    let startPoint: TSPoint | undefined;
    for (let row = startLine - 1; row < endLine; row += 1) {
      const line = this.lines[row] ?? "";
      const firstContentColumn = line.search(/\S/);
      if (firstContentColumn >= 0) {
        startPoint = { row, column: firstContentColumn };
        break;
      }
    }

    let endPoint: TSPoint | undefined;
    for (let row = endLine - 1; row >= startLine - 1; row -= 1) {
      const line = this.lines[row] ?? "";
      const content = line.trimEnd();
      if (content.length > 0) {
        endPoint = { row, column: content.length };
        break;
      }
    }

    if (!startPoint || !endPoint) {
      const fallback = this.lineRange(startLine, endLine);
      return { startByte: fallback.startByte, endByte: fallback.endByte };
    }

    return {
      startByte: this.byteOffsetAt(startPoint),
      endByte: this.byteOffsetAt(endPoint),
    };
  }

  /** Exact source text for a raw 1-based [startLine, endLine] span, newline-joined. */
  textForLines(startLine: number, endLine: number): string {
    return this.lines.slice(startLine - 1, endLine).join("\n");
  }

  /**
   * Exact source text for any public SourceRange, using only its 1-based
   * line/column fields (which are UTF-16 code units — see module docs above
   * — exactly what JS string slicing needs). This works uniformly for every
   * CodeSymbol regardless of how its range was built (a real Tree-sitter
   * node, an offset-rebased embedded-region node, or a synthetic line span),
   * so callers never need to special-case origin to get `code` right.
   */
  textForRange(range: SourceRange): string {
    if (range.startLine === range.endLine) {
      const line = this.lines[range.startLine - 1] ?? "";
      return line.slice(range.startColumn - 1, range.endColumn - 1);
    }
    const firstLine = (this.lines[range.startLine - 1] ?? "").slice(range.startColumn - 1);
    const middleLines = this.lines.slice(range.startLine, range.endLine - 1);
    const lastLine = (this.lines[range.endLine - 1] ?? "").slice(0, range.endColumn - 1);
    return [firstLine, ...middleLines, lastLine].join("\n");
  }
}

/**
 * Re-bases a SourceRange computed against an embedded-region substring (e.g.
 * the text inside a CFML `<cfscript>` block, re-parsed on its own with the
 * cfscript grammar) into the coordinate space of the original host file.
 *
 * `origin` is the host-file SourceRange of the substring's own start, as
 * returned by SourceIndex.toSourceRange() for the substring's containing
 * node. Only positions on the substring's first line need a column shift —
 * byte offsets are flat, so they always just add.
 */
export function offsetSourceRange(childRange: SourceRange, origin: SourceRange): SourceRange {
  const lineDelta = origin.startLine - 1;
  return {
    startLine: childRange.startLine + lineDelta,
    startColumn: childRange.startLine === 1 ? origin.startColumn + childRange.startColumn - 1 : childRange.startColumn,
    endLine: childRange.endLine + lineDelta,
    endColumn: childRange.endLine === 1 ? origin.startColumn + childRange.endColumn - 1 : childRange.endColumn,
    startByte: origin.startByte + childRange.startByte,
    endByte: origin.startByte + childRange.endByte,
  };
}

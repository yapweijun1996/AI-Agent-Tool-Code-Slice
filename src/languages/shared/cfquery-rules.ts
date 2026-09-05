import type { Node } from "web-tree-sitter";
import type { CodeSymbol } from "../../schema/types.js";
import type { SourceIndex } from "../../schema/coordinates.js";
import type { ExtractedName, SymbolRule } from "./walk.js";

function queryFunctionName(node: Node): ExtractedName {
  const name = node.childForFieldName("name");
  return name ? { name: name.text } : { name: null, dynamic: true };
}

const queryFunctionRule: SymbolRule = {
  nodeTypes: ["query_function"],
  kind: "function",
  extractName: queryFunctionName,
  extractSignature: (node) => node.text,
};

export const cfqueryRules: SymbolRule[] = [queryFunctionRule];

interface ClauseSpec {
  name: string;
  consumed: number;
}

interface ClauseStart extends ClauseSpec {
  childIndex: number;
  node: Node;
}

const singleWordClauses = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "RETURNING",
  "VALUES",
  "SET",
  "INSERT",
  "UPDATE",
  "DELETE",
  "WITH",
  "INTO",
  "ON",
  "JOIN",
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
]);

const joinPrefixes = new Set(["LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL"]);

function keywordAt(children: Node[], index: number): string | null {
  const child = children[index];
  return child?.type === "query_keyword" ? child.text.toUpperCase() : null;
}

function clauseAt(children: Node[], index: number): ClauseSpec | null {
  const keyword = keywordAt(children, index);
  if (!keyword) return null;

  if (keyword === "ORDER" || keyword === "GROUP") {
    const next = keywordAt(children, index + 1);
    if (next === "BY") return { name: `${keyword} BY`, consumed: 2 };
    return { name: keyword, consumed: 1 };
  }

  if (keyword === "UNION") {
    const next = keywordAt(children, index + 1);
    if (next === "ALL" || next === "DISTINCT") return { name: `UNION ${next}`, consumed: 2 };
    return { name: keyword, consumed: 1 };
  }

  if (joinPrefixes.has(keyword)) {
    const next = keywordAt(children, index + 1);
    if (next === "JOIN") return { name: `${keyword} JOIN`, consumed: 2 };
    if (next === "OUTER" && keyword !== "OUTER" && keywordAt(children, index + 2) === "JOIN") {
      return { name: `${keyword} OUTER JOIN`, consumed: 3 };
    }
    return null;
  }

  return singleWordClauses.has(keyword) ? { name: keyword, consumed: 1 } : null;
}

function rangeBetween(sourceIndex: SourceIndex, start: Node, end: Node) {
  return sourceIndex.toSourceRange({
    startPosition: start.startPosition,
    endPosition: end.endPosition,
    startIndex: start.startIndex,
    endIndex: end.endIndex,
  });
}

function extractClausesFromContainer(container: Node, sourceIndex: SourceIndex, results: CodeSymbol[]): void {
  const children = container.namedChildren.filter((child): child is Node => child !== null);
  const starts: ClauseStart[] = [];

  for (let childIndex = 0; childIndex < children.length; ) {
    const spec = clauseAt(children, childIndex);
    if (!spec) {
      childIndex += 1;
      continue;
    }
    const node = children[childIndex];
    if (node) starts.push({ ...spec, childIndex, node });
    childIndex += spec.consumed;
  }

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    if (!start) continue;
    const next = starts[index + 1];
    const endChildIndex = next?.childIndex ?? children.length;
    const end = children[endChildIndex - 1] ?? start.node;
    if (!end || end.endIndex <= start.node.startIndex) continue;

    results.push({
      kind: "block",
      nativeKind: "query_clause",
      name: start.name,
      language: "cfquery",
      embeddedLanguage: "cfquery",
      range: rangeBetween(sourceIndex, start.node, end),
      parent: null,
    });
  }

  for (const child of children) {
    if (child.type === "parenthesized_query_node") extractClausesFromContainer(child, sourceIndex, results);
  }
}

/**
 * The cfquery grammar intentionally keeps SQL clauses as a flat token stream.
 * This adapter-level pass uses only its named query_keyword nodes to create
 * bounded clause containers; it does not infer table/column roles from names.
 */
export function extractCfqueryClauses(root: Node, sourceIndex: SourceIndex): CodeSymbol[] {
  const results: CodeSymbol[] = [];
  extractClausesFromContainer(root, sourceIndex, results);
  return results;
}

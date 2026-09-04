import type { Node } from "web-tree-sitter";
import type { SymbolRef } from "../../schema/types.js";
import type { SymbolRule } from "./walk.js";

/**
 * Verified against @cfmleditor/tree-sitter-cfml's cfscript/src/node-types.json:
 * function_declaration{name,parameters,body}, variable_declarator{name,value},
 * component{body} (component has no name field — CFC name is conventionally
 * the file name, not part of the CFScript syntax itself).
 */

function functionSignature(node: Node): string | null {
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  if (!paramsNode) return null;
  return `${nameNode?.text ?? ""}${paramsNode.text}`;
}

const functionDeclarationRule: SymbolRule = {
  nodeTypes: ["function_declaration"],
  kind: (_node, parent: SymbolRef | null) => (parent?.kind === "class" ? "method" : "function"),
  extractName: (node) => {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return { name: null, dynamic: true };
    return { name: nameNode.text };
  },
  extractSignature: functionSignature,
};

const componentRule: SymbolRule = {
  nodeTypes: ["component"],
  kind: "class",
  extractName: () => ({ name: null }),
};

function isFunctionValued(declarator: Node): boolean {
  const value = declarator.childForFieldName("value");
  return value !== null && (value.type === "arrow_function" || value.type === "function_expression");
}

const variableDeclaratorRule: SymbolRule = {
  nodeTypes: ["variable_declarator"],
  kind: (node) => (isFunctionValued(node) ? "function" : "variable"),
  extractName: (node) => {
    const nameNode = node.childForFieldName("name");
    if (!nameNode || nameNode.type !== "identifier") return { name: null, dynamic: true };
    return { name: nameNode.text };
  },
  extractSignature: (node) => {
    if (!isFunctionValued(node)) return null;
    const nameNode = node.childForFieldName("name");
    const paramsNode = node.childForFieldName("value")?.childForFieldName("parameters");
    if (!paramsNode) return null;
    return `${nameNode?.text ?? ""}${paramsNode.text}`;
  },
};

export const cfscriptRules: SymbolRule[] = [functionDeclarationRule, componentRule, variableDeclaratorRule];

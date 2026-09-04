import type { Node } from "web-tree-sitter";
import type { ExtractedName, SymbolRule, WalkConfig } from "./walk.js";

/**
 * Shared symbol rules for the JavaScript/TypeScript/TSX grammar family.
 * Verified against tree-sitter-javascript's node-types.json field definitions
 * (see grammar spike notes) rather than assumed from memory.
 */

function identifierName(node: Node, fieldName = "name"): ExtractedName {
  const nameNode = node.childForFieldName(fieldName);
  if (!nameNode) return { name: null, dynamic: true };
  if (nameNode.type === "identifier" || nameNode.type === "type_identifier") {
    return { name: nameNode.text };
  }
  return { name: null, dynamic: true };
}

function propertyName(node: Node): ExtractedName {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return { name: null, dynamic: true };
  if (nameNode.type === "property_identifier" || nameNode.type === "private_property_identifier") {
    return { name: nameNode.text };
  }
  return { name: null, dynamic: true };
}

function functionSignature(node: Node): string | null {
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  if (!paramsNode) return null;
  return `${nameNode?.text ?? ""}${paramsNode.text}`;
}

function isFunctionValued(declarator: Node): boolean {
  const valueNode = declarator.childForFieldName("value");
  return valueNode !== null && (valueNode.type === "arrow_function" || valueNode.type === "function_expression");
}

const functionDeclarationRule: SymbolRule = {
  nodeTypes: ["function_declaration", "generator_function_declaration"],
  kind: "function",
  extractName: (node) => identifierName(node),
  extractSignature: functionSignature,
};

const classDeclarationRule: SymbolRule = {
  nodeTypes: ["class_declaration"],
  kind: "class",
  extractName: (node) => identifierName(node),
};

const methodDefinitionRule: SymbolRule = {
  nodeTypes: ["method_definition"],
  kind: "method",
  extractName: propertyName,
  extractSignature: functionSignature,
};

const interfaceDeclarationRule: SymbolRule = {
  nodeTypes: ["interface_declaration"],
  kind: "interface",
  extractName: (node) => identifierName(node),
};

const typeAliasRule: SymbolRule = {
  nodeTypes: ["type_alias_declaration"],
  kind: "type",
  extractName: (node) => identifierName(node),
};

const importStatementRule: SymbolRule = {
  nodeTypes: ["import_statement"],
  kind: "import",
  extractName: () => ({ name: null }),
  extractSignature: (node) => node.text.split("\n")[0] ?? null,
};

/**
 * `const foo = ...` / `let foo = ...`. Only identifier names are captured
 * (destructuring patterns are skipped for V0.1 rather than emitted with a
 * misleading null name). A function-valued initializer (arrow/function
 * expression) is reported as kind "function" so `code-slice symbol file foo`
 * finds arrow-function exports too; anything else is kind "variable".
 * Destructuring declarators (name field not a plain identifier) still produce
 * a CodeSymbol — with name:null, dynamicName:true, and a DYNAMIC_NAME warning
 * — rather than being silently dropped from the IR (docs/ARCHITECTURE.md
 * allows `name: string | null`). Symbol-name lookup can never match a null
 * name, so these are effectively invisible to `code-slice symbol` while still
 * being honest in `outline`.
 */
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
    const value = node.childForFieldName("value");
    const paramsNode = value?.childForFieldName("parameters");
    if (!paramsNode) return null;
    return `${nameNode?.text ?? ""}${paramsNode.text}`;
  },
};

export const jsFamilyRules: SymbolRule[] = [
  functionDeclarationRule,
  classDeclarationRule,
  methodDefinitionRule,
  interfaceDeclarationRule,
  typeAliasRule,
  importStatementRule,
  variableDeclaratorRule,
];

export const jsFamilyWrapper: NonNullable<WalkConfig["wrapper"]> = {
  nodeType: "export_statement",
  declarationField: "declaration",
  fallbackKind: "export",
};

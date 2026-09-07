import type { Node } from "web-tree-sitter";
import type { ExtractedName, SymbolRule, WalkConfig } from "./walk.js";

/**
 * Shared symbol rules for the JavaScript/TypeScript/TSX grammar family.
 * Rules are based on the pinned Tree-sitter grammars and verified with frozen
 * fixtures instead of inferred from source syntax alone.
 */

function identifierName(node: Node, fieldName = "name"): ExtractedName {
  const nameNode = node.childForFieldName(fieldName);
  if (!nameNode) return { name: null, dynamic: true };
  if (nameNode.type === "identifier" || nameNode.type === "type_identifier") {
    return { name: nameNode.text };
  }
  return { name: null, dynamic: true };
}

function staticPropertyNodeName(nameNode: Node | null): ExtractedName {
  if (!nameNode) return { name: null, dynamic: true };
  if (
    nameNode.type === "property_identifier" ||
    nameNode.type === "private_property_identifier" ||
    nameNode.type === "identifier" ||
    nameNode.type === "type_identifier"
  ) {
    return { name: nameNode.text };
  }
  if (nameNode.type === "string") {
    const text = nameNode.text;
    if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
      return { name: text.slice(1, -1) };
    }
  }
  return { name: null, dynamic: true };
}

function propertyName(node: Node): ExtractedName {
  return staticPropertyNodeName(node.childForFieldName("name"));
}

function propertyKeyName(node: Node): ExtractedName {
  return staticPropertyNodeName(node.childForFieldName("key"));
}

function moduleName(node: Node): ExtractedName {
  return staticPropertyNodeName(node.childForFieldName("name"));
}

function functionSignature(node: Node): string | null {
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  if (!paramsNode) return null;
  return `${nameNode?.text ?? ""}${paramsNode.text}`;
}

function functionValue(node: Node): Node | null {
  const valueNode = node.childForFieldName("value");
  return valueNode !== null && (valueNode.type === "arrow_function" || valueNode.type === "function_expression")
    ? valueNode
    : null;
}

function isFunctionValued(node: Node): boolean {
  return functionValue(node) !== null;
}

function functionValueSignature(node: Node, fieldName: "name" | "key"): string | null {
  const value = functionValue(node);
  if (!value) return null;
  const paramsNode = value.childForFieldName("parameters");
  if (!paramsNode) return null;
  const extracted = fieldName === "name" ? propertyName(node) : propertyKeyName(node);
  return `${extracted.name ?? ""}${paramsNode.text}`;
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

const enumDeclarationRule: SymbolRule = {
  nodeTypes: ["enum_declaration"],
  kind: "enum",
  extractName: (node) => identifierName(node),
};

const moduleDeclarationRule: SymbolRule = {
  // tree-sitter-typescript uses internal_module for `namespace X {}` and
  // module for `module X {}` / ambient module declarations.
  nodeTypes: ["internal_module", "module"],
  kind: "module",
  extractName: moduleName,
};

const classFieldRule: SymbolRule = {
  // TypeScript uses public_field_definition; JavaScript uses field_definition.
  // Only callable fields are navigation units; ordinary data fields stay out of
  // the symbol inventory so practical coverage does not recreate outline noise.
  nodeTypes: ["public_field_definition", "field_definition"],
  matches: isFunctionValued,
  kind: "method",
  extractName: propertyName,
  extractSignature: (node) => functionValueSignature(node, "name"),
};

const objectFunctionPropertyRule: SymbolRule = {
  // Do not surface every object literal key. Only function-valued pairs are
  // navigation units; ordinary data properties would recreate outline noise.
  nodeTypes: ["pair"],
  matches: isFunctionValued,
  kind: "function",
  extractName: propertyKeyName,
  extractSignature: (node) => functionValueSignature(node, "key"),
};

const importStatementRule: SymbolRule = {
  nodeTypes: ["import_statement"],
  kind: "import",
  extractName: () => ({ name: null }),
  extractSignature: (node) => node.text.split("\n")[0] ?? null,
};

/**
 * `const foo = ...` / `let foo = ...`. Only identifier names are captured.
 * Function-valued initializers are normalized as `function`; destructuring is
 * retained with a dynamic null name instead of guessed.
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
    const value = functionValue(node);
    if (!value) return null;
    const nameNode = node.childForFieldName("name");
    const paramsNode = value.childForFieldName("parameters");
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
  enumDeclarationRule,
  moduleDeclarationRule,
  classFieldRule,
  objectFunctionPropertyRule,
  importStatementRule,
  variableDeclaratorRule,
];

export const jsFamilyWrapper: NonNullable<WalkConfig["wrapper"]> = {
  nodeType: "export_statement",
  declarationField: "declaration",
  fallbackKind: "export",
};

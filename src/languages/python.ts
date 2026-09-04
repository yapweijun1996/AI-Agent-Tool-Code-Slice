import type { Node } from "web-tree-sitter";
import type { LanguageAdapter } from "./types.js";
import { walkSymbols, type SymbolRule } from "./shared/walk.js";
import type { SymbolRef } from "../schema/types.js";

/**
 * Verified against tree-sitter-python's node-types.json field definitions
 * (see grammar spike notes): function_definition{name,parameters,body},
 * class_definition{name,body}, decorated_definition{definition}, assignment{left,right}.
 */

function functionSignature(node: Node): string | null {
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  if (!paramsNode) return null;
  return `${nameNode?.text ?? ""}${paramsNode.text}`;
}

const functionDefinitionRule: SymbolRule = {
  nodeTypes: ["function_definition"],
  // A def directly inside a class body is a method; anywhere else it's a function.
  kind: (_node, parent: SymbolRef | null) => (parent?.kind === "class" ? "method" : "function"),
  extractName: (node) => {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return { name: null, dynamic: true };
    return { name: nameNode.text };
  },
  extractSignature: functionSignature,
};

const classDefinitionRule: SymbolRule = {
  nodeTypes: ["class_definition"],
  kind: "class",
  extractName: (node) => {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return { name: null, dynamic: true };
    return { name: nameNode.text };
  },
};

/**
 * Module/class-level `name = value`. Only a plain identifier target is
 * captured (tuple/attribute targets are skipped rather than misrepresented).
 * `name = lambda ...:` is reported as kind "function" for parity with the
 * JS-family arrow-function treatment.
 */
const assignmentRule: SymbolRule = {
  nodeTypes: ["assignment"],
  kind: (node) => {
    const right = node.childForFieldName("right");
    return right?.type === "lambda" ? "function" : "variable";
  },
  extractName: (node) => {
    const left = node.childForFieldName("left");
    if (!left || left.type !== "identifier") return { name: null, dynamic: true };
    return { name: left.text };
  },
};

const importRule: SymbolRule = {
  nodeTypes: ["import_statement", "import_from_statement"],
  kind: "import",
  extractName: () => ({ name: null }),
  extractSignature: (node) => node.text.split("\n")[0] ?? null,
};

const rules: SymbolRule[] = [functionDefinitionRule, classDefinitionRule, assignmentRule, importRule];

export const pythonAdapter: LanguageAdapter = {
  id: "python",
  extensions: [".py"],
  grammarId: "python",
  extractSymbols(ctx) {
    return walkSymbols(ctx.tree.rootNode, {
      language: "python",
      rules,
      sourceIndex: ctx.sourceIndex,
      source: ctx.source,
      wrapper: {
        nodeType: "decorated_definition",
        declarationField: "definition",
        fallbackKind: "unknown",
      },
    });
  },
};

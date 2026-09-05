import type { Node } from "web-tree-sitter";
import type { ExtractedName, SymbolRule } from "./walk.js";

function childOfType(node: Node, type: string): Node | null {
  return node.namedChildren.find((child) => child?.type === type) ?? null;
}

function selectorName(node: Node): ExtractedName {
  const selectors = childOfType(node, "selectors");
  const name = selectors?.text.trim() ?? "";
  return name.length > 0 ? { name } : { name: null, dynamic: true };
}

function atRuleHeader(node: Node): ExtractedName {
  const block = childOfType(node, "block");
  const header = block ? node.text.slice(0, block.startIndex - node.startIndex).trim() : node.text.trim();
  return header.length > 0 ? { name: header } : { name: null, dynamic: true };
}

function keyframesName(node: Node): ExtractedName {
  const nameNode = childOfType(node, "keyframes_name");
  return nameNode ? { name: nameNode.text } : { name: null, dynamic: true };
}

const ruleSetRule: SymbolRule = {
  nodeTypes: ["rule_set"],
  kind: "block",
  extractName: selectorName,
};

const mediaRule: SymbolRule = {
  nodeTypes: ["media_statement", "supports_statement", "scope_statement", "at_rule"],
  kind: "block",
  extractName: atRuleHeader,
};

const keyframesRule: SymbolRule = {
  nodeTypes: ["keyframes_statement"],
  kind: "block",
  extractName: keyframesName,
};

const declarationRule: SymbolRule = {
  nodeTypes: ["declaration"],
  kind: "property",
  extractName: (node) => {
    const property = childOfType(node, "property_name");
    return property ? { name: property.text } : { name: null, dynamic: true };
  },
};

const importRule: SymbolRule = {
  nodeTypes: ["import_statement"],
  kind: "import",
  extractName: () => ({ name: null }),
  extractSignature: (node) => node.text.split("\n")[0] ?? null,
};

/**
 * CSS symbols are deliberately structural: selectors and at-rules become
 * blocks, declarations become properties, and imports remain imports. The
 * selector text is retained as the name because CSS has no declaration name
 * for a rule set that would be safer to invent.
 */
export const cssRules: SymbolRule[] = [ruleSetRule, mediaRule, keyframesRule, declarationRule, importRule];

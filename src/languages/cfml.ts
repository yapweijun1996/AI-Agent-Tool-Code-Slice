import type { Node } from "web-tree-sitter";
import type { AdapterContext, LanguageAdapter } from "./types.js";
import type { CodeSymbol } from "../schema/types.js";
import { SourceIndex, offsetSourceRange } from "../schema/coordinates.js";
import { walkSymbols } from "./shared/walk.js";
import { cfscriptRules } from "./shared/cfscript-rules.js";
import { assignContainmentParents } from "./shared/containment.js";

/**
 * CFML is a tag grammar (@cfmleditor/tree-sitter-cfml). Unlike the JS/Python
 * grammars, it does NOT nest a tag's body under its own node in every case:
 * empirically (see grammar spike notes), `cf_component_open_tag` and
 * `cf_component_close_tag` are FLAT SIBLINGS at the `program` level, not
 * parent/child — everything "inside" a component is really just later
 * siblings before the matching close tag. `cf_function_tag`, by contrast,
 * really does contain its whole body (including cfquery/cfscript children
 * and its own implicit end tag) as real tree children.
 *
 * So: cfcomponent spans are synthesized by pairing open/close tags with a
 * stack, and ALL nesting (component -> function, function -> query/script)
 * is finalized by byte-range containment rather than trusted from tree shape.
 */

function getCfAttributeValue(tagNode: Node, attrName: string): { value: string | null; dynamic: boolean } {
  for (const child of tagNode.namedChildren) {
    if (!child || child.type !== "cf_attribute") continue;
    const nameNode = child.namedChildren.find((c) => c?.type === "cf_attribute_name");
    if (!nameNode || nameNode.text.toLowerCase() !== attrName.toLowerCase()) continue;

    const valueNode = child.namedChildren.find(
      (c) => c?.type === "cf_attribute_value" || c?.type === "quoted_cf_attribute_value",
    );
    if (!valueNode) return { value: null, dynamic: false };
    if (valueNode.type === "cf_attribute_value") {
      return { value: valueNode.text, dynamic: false };
    }
    // quoted_cf_attribute_value children: attribute_value | hash_empty | hash_expression
    const dynamic = valueNode.namedChildren.some((c) => c?.type === "hash_expression" || c?.type === "hash_empty");
    const text = valueNode.namedChildren
      .filter((c) => c?.type === "attribute_value")
      .map((c) => c!.text)
      .join("");
    return { value: text || null, dynamic };
  }
  return { value: null, dynamic: false };
}

function pairComponentTags(root: Node, sourceIndex: SourceIndex, language: string): CodeSymbol[] {
  const opens = root.descendantsOfType("cf_component_open_tag");
  const closes = root.descendantsOfType("cf_component_close_tag");
  const tagged = [
    ...opens.map((n) => ({ n, isOpen: true })),
    ...closes.map((n) => ({ n, isOpen: false })),
  ].sort((a, b) => a.n.startIndex - b.n.startIndex);

  const stack: Node[] = [];
  const components: CodeSymbol[] = [];
  for (const { n, isOpen } of tagged) {
    if (isOpen) {
      stack.push(n);
      continue;
    }
    const open = stack.pop();
    if (!open) continue; // unmatched close tag; malformed source, skip rather than guess
    const { value: name, dynamic } = getCfAttributeValue(open, "name");
    const openRange = sourceIndex.toSourceRange(open);
    const closeRange = sourceIndex.toSourceRange(n);
    const range = {
      startLine: openRange.startLine,
      startColumn: openRange.startColumn,
      endLine: closeRange.endLine,
      endColumn: closeRange.endColumn,
      startByte: openRange.startByte,
      endByte: closeRange.endByte,
    };
    const symbol: CodeSymbol = {
      kind: "class",
      nativeKind: "cf_component_open_tag",
      name,
      language,
      range,
      parent: null,
    };
    if (dynamic) {
      symbol.dynamicName = true;
      symbol.warnings = [
        { code: "DYNAMIC_NAME", message: "CFML component name attribute could not be statically resolved.", severity: "warning" },
      ];
    }
    components.push(symbol);
  }
  return components;
}

function extractFunctions(root: Node, sourceIndex: SourceIndex, language: string): CodeSymbol[] {
  return root.descendantsOfType("cf_function_tag").map((node) => {
    const { value: name, dynamic } = getCfAttributeValue(node, "name");
    const symbol: CodeSymbol = {
      kind: "function",
      nativeKind: "cf_function_tag",
      name,
      language,
      range: sourceIndex.toSourceRange(node),
      parent: null,
    };
    if (dynamic) {
      symbol.dynamicName = true;
      symbol.warnings = [
        { code: "DYNAMIC_NAME", message: "CFML function name attribute could not be statically resolved.", severity: "warning" },
      ];
    }
    return symbol;
  });
}

function extractQueries(root: Node, sourceIndex: SourceIndex, language: string): CodeSymbol[] {
  return root.descendantsOfType("cf_query_tag").map((node) => {
    const { value: name, dynamic } = getCfAttributeValue(node, "name");
    const symbol: CodeSymbol = {
      kind: "query",
      nativeKind: "cf_query_tag",
      name,
      language,
      embeddedLanguage: "cfquery",
      range: sourceIndex.toSourceRange(node),
      parent: null,
    };
    if (dynamic) {
      symbol.dynamicName = true;
      symbol.warnings = [
        { code: "DYNAMIC_NAME", message: "CFML query name attribute could not be statically resolved.", severity: "warning" },
      ];
    }
    return symbol;
  });
}

async function extractScriptSymbols(
  root: Node,
  sourceIndex: SourceIndex,
  ctx: AdapterContext,
  language: string,
): Promise<CodeSymbol[]> {
  const scriptTags = root.descendantsOfType("cf_script_tag");
  if (scriptTags.length === 0) return [];

  const loaded = await ctx.engine.loadLanguage("cfscript");
  const results: CodeSymbol[] = [];

  for (const tag of scriptTags) {
    const content = tag.namedChildren.find((c) => c?.type === "cf_script_content");
    if (!content || content.text.trim().length === 0) continue;

    const origin = sourceIndex.toSourceRange(content);
    const { tree: subTree, hadError } = await ctx.engine.parse(content.text, loaded);
    const subIndex = new SourceIndex(content.text);
    const subSymbols = walkSymbols(subTree.rootNode, {
      language: "cfscript",
      rules: cfscriptRules,
      sourceIndex: subIndex,
      source: content.text,
    });

    for (const symbol of subSymbols) {
      symbol.range = offsetSourceRange(symbol.range, origin);
      symbol.embeddedLanguage = "cfscript";
      if (symbol.parent) {
        symbol.parent = { ...symbol.parent, range: offsetSourceRange(symbol.parent.range, origin) };
      }
      if (hadError) {
        symbol.warnings = [
          ...(symbol.warnings ?? []),
          { code: "EMBEDDED_PARSE_ERROR", message: "Embedded cfscript region contains a recoverable parse error.", severity: "warning" },
        ];
      }
      results.push(symbol);
    }
  }
  return results;
}

export const cfmlAdapter: LanguageAdapter = {
  id: "cfml",
  extensions: [".cfm", ".cfc"],
  grammarId: "cfml",
  async extractSymbols(ctx: AdapterContext): Promise<CodeSymbol[]> {
    const root = ctx.tree.rootNode;
    const language = "cfml";

    const components = pairComponentTags(root, ctx.sourceIndex, language);
    const functions = extractFunctions(root, ctx.sourceIndex, language);
    const queries = extractQueries(root, ctx.sourceIndex, language);
    const scriptSymbols = await extractScriptSymbols(root, ctx.sourceIndex, ctx, language);

    const all = [...components, ...functions, ...queries, ...scriptSymbols];
    assignContainmentParents(all);

    // A function/method distinction only becomes knowable once containment
    // (component -> function) is resolved above.
    for (const symbol of all) {
      if (symbol.kind === "function" && symbol.parent?.kind === "class") {
        symbol.kind = "method";
      }
    }

    return all;
  },
};

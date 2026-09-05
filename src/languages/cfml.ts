import type { Node } from "web-tree-sitter";
import type { AdapterContext, LanguageAdapter, SymbolBudget } from "./types.js";
import type { CodeSymbol, SourceRange } from "../schema/types.js";
import type { LoadedLanguage } from "../engine/parser-engine.js";
import { SourceIndex, offsetSourceRange } from "../schema/coordinates.js";
import { walkSymbols, type SymbolRule, type WalkConfig } from "./shared/walk.js";
import { cfscriptRules } from "./shared/cfscript-rules.js";
import { cssRules } from "./shared/css-rules.js";
import { cfqueryRules, extractCfqueryClauses } from "./shared/cfquery-rules.js";
import { jsFamilyRules, jsFamilyWrapper } from "./shared/js-family-rules.js";
import { assignContainmentParents } from "./shared/containment.js";

/**
 * CFML is a tag grammar (@cfmleditor/tree-sitter-cfml). Unlike the JS/Python
 * grammars, it does NOT nest a tag's body under its own node in every case:
 * empirically (see grammar spike notes), `cf_component_open_tag` and
 * `cf_component_close_tag` are FLAT SIBLINGS at the `program` level, not
 * parent/child — everything "inside" a component is really just later
 * siblings before the matching close tag. `cf_function_tag`, by contrast,
 * really does contain its whole body (including cfquery/cfscript children,
 * and its own implicit end tag) as real tree children. HTML-style
 * script_element/style_element nodes are separate top-level regions and are
 * re-parsed by this adapter with their own grammars.
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

function pairComponentTags(
  root: Node,
  sourceIndex: SourceIndex,
  language: string,
  symbolBudget: SymbolBudget,
): CodeSymbol[] {
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
    symbolBudget.consume();
    components.push(symbol);
  }
  return components;
}

function extractFunctions(root: Node, sourceIndex: SourceIndex, language: string, symbolBudget: SymbolBudget): CodeSymbol[] {
  const functions: CodeSymbol[] = [];
  for (const node of root.descendantsOfType("cf_function_tag")) {
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
    symbolBudget.consume();
    functions.push(symbol);
  }
  return functions;
}

interface QueryExtraction {
  queries: CodeSymbol[];
  sqlSymbols: CodeSymbol[];
}

function embeddedParseWarning(language: string): { code: string; message: string; severity: "warning" } {
  return {
    code: "EMBEDDED_PARSE_ERROR",
    message: `Embedded ${language} region contains a recoverable parse error.`,
    severity: "warning",
  };
}

function rebaseEmbeddedSymbols(
  symbols: CodeSymbol[],
  origin: SourceRange,
  embeddedLanguage: string,
  hadError: boolean,
): CodeSymbol[] {
  for (const symbol of symbols) {
    symbol.range = offsetSourceRange(symbol.range, origin);
    symbol.embeddedLanguage = embeddedLanguage;
    if (symbol.parent) {
      symbol.parent = { ...symbol.parent, range: offsetSourceRange(symbol.parent.range, origin) };
    }
    if (hadError) symbol.warnings = [...(symbol.warnings ?? []), embeddedParseWarning(embeddedLanguage)];
  }
  return symbols;
}

async function parseEmbeddedSymbols(
  regions: Node[],
  ctx: AdapterContext,
  options: {
    contentType: string;
    grammarId: string;
    language: string;
    rules: SymbolRule[];
    wrapper?: WalkConfig["wrapper"];
    shouldParse?: (region: Node) => boolean;
  },
): Promise<CodeSymbol[]> {
  const eligibleRegions = regions.filter((region) => options.shouldParse?.(region) ?? true);
  if (eligibleRegions.length === 0) return [];

  const loaded = await ctx.engine.loadLanguage(options.grammarId);
  const results: CodeSymbol[] = [];

  for (const region of eligibleRegions) {
    const content = region.namedChildren.find((child) => child?.type === options.contentType);
    if (!content || content.text.trim().length === 0) continue;

    const origin = ctx.sourceIndex.toSourceRange(content);
    await ctx.engine.withParse(content.text, loaded, ({ tree: subTree, hadError }) => {
      const subIndex = new SourceIndex(content.text);
      const subSymbols = walkSymbols(subTree.rootNode, {
        language: options.language,
        rules: options.rules,
        sourceIndex: subIndex,
        source: content.text,
        wrapper: options.wrapper,
        symbolBudget: ctx.symbolBudget,
      });
      results.push(...rebaseEmbeddedSymbols(subSymbols, origin, options.language, hadError));
    });
  }
  return results;
}

/**
 * Returns undefined for an absent attribute and null for a present value that
 * the host grammar cannot resolve statically (for example a CFML hash).
 */
function getHtmlAttributeValue(region: Node, attrName: string): string | null | undefined {
  const startTag = region.namedChildren.find((child) => child?.type === "start_tag");
  const attributes = startTag?.namedChildren.find((child) => child?.type === "tag_attributes");
  const attribute = attributes?.namedChildren.find((child) => {
    if (!child || child.type !== "attribute") return false;
    const name = child.namedChildren.find((grandchild) => grandchild?.type === "attribute_name");
    return name?.text.toLowerCase() === attrName.toLowerCase();
  });
  if (!attribute) return undefined;

  const value = attribute.namedChildren.find(
    (child) => child?.type === "attribute_value" || child?.type === "quoted_attribute_value",
  );
  if (!value) return "";
  if (value.type === "attribute_value") return value.text;
  return value.namedChildren.find((child) => child?.type === "attribute_value")?.text ?? null;
}

function normalizedHtmlType(region: Node): string | null | undefined {
  const value = getHtmlAttributeValue(region, "type");
  if (value === undefined || value === null) return value;
  const mediaType = value.split(";", 1)[0];
  return mediaType?.trim().toLowerCase() ?? "";
}

function normalizedHtmlLanguage(region: Node): string | null | undefined {
  const value = getHtmlAttributeValue(region, "language");
  if (value === undefined || value === null) return value;
  return value.trim().toLowerCase();
}

const javascriptScriptTypes = new Set([
  "application/ecmascript",
  "application/javascript",
  "module",
  "text/ecmascript",
  "text/javascript",
]);
const javascriptLanguageValues = new Set(["ecmascript", "javascript", "jscript"]);

function isJavaScriptScript(region: Node): boolean {
  const type = normalizedHtmlType(region);
  if (type !== undefined) return type !== null && javascriptScriptTypes.has(type);

  const language = normalizedHtmlLanguage(region);
  if (language === undefined) return true;
  return language !== null && javascriptLanguageValues.has(language);
}

function isCssStyle(region: Node): boolean {
  const type = normalizedHtmlType(region);
  return type === undefined || type === "text/css";
}

async function extractQueries(
  root: Node,
  sourceIndex: SourceIndex,
  ctx: AdapterContext,
  language: string,
): Promise<QueryExtraction> {
  const queries: CodeSymbol[] = [];
  const sqlSymbols: CodeSymbol[] = [];
  let loaded: LoadedLanguage | undefined;

  for (const node of root.descendantsOfType("cf_query_tag")) {
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
    ctx.symbolBudget.consume();
    queries.push(symbol);

    const content = node.namedChildren.find((child) => child?.type === "cf_query_content");
    if (!content || content.text.trim().length === 0) continue;

    loaded ??= await ctx.engine.loadLanguage("cfquery");
    const origin = sourceIndex.toSourceRange(content);
    await ctx.engine.withParse(content.text, loaded, ({ tree: subTree, hadError }) => {
      if (hadError) symbol.warnings = [...(symbol.warnings ?? []), embeddedParseWarning("cfquery")];

      const subIndex = new SourceIndex(content.text);
      const functionSymbols = walkSymbols(subTree.rootNode, {
        language: "cfquery",
        rules: cfqueryRules,
        sourceIndex: subIndex,
        source: content.text,
        symbolBudget: ctx.symbolBudget,
      });
      const clauseSymbols = extractCfqueryClauses(subTree.rootNode, subIndex, ctx.symbolBudget);
      sqlSymbols.push(...rebaseEmbeddedSymbols([...functionSymbols, ...clauseSymbols], origin, "cfquery", hadError));
    });
  }

  return { queries, sqlSymbols };
}

async function extractEmbeddedSymbols(root: Node, ctx: AdapterContext): Promise<CodeSymbol[]> {
  const cfscriptSymbols = await parseEmbeddedSymbols(root.descendantsOfType("cf_script_tag"), ctx, {
    contentType: "cf_script_content",
    grammarId: "cfscript",
    language: "cfscript",
    rules: cfscriptRules,
  });
  const javascriptSymbols = await parseEmbeddedSymbols(root.descendantsOfType("script_element"), ctx, {
    contentType: "script_text",
    grammarId: "javascript",
    language: "javascript",
    rules: jsFamilyRules,
    wrapper: jsFamilyWrapper,
    shouldParse: isJavaScriptScript,
  });
  const styleSymbols = await parseEmbeddedSymbols(root.descendantsOfType("style_element"), ctx, {
    contentType: "style_text",
    grammarId: "css",
    language: "css",
    rules: cssRules,
    shouldParse: isCssStyle,
  });
  return [...cfscriptSymbols, ...javascriptSymbols, ...styleSymbols];
}

export const cfmlAdapter: LanguageAdapter = {
  id: "cfml",
  extensions: [".cfm", ".cfc"],
  grammarId: "cfml",
  embeddedLanguages: ["cfscript", "cfquery", "javascript", "css"],
  async extractSymbols(ctx: AdapterContext): Promise<CodeSymbol[]> {
    const root = ctx.tree.rootNode;
    const language = "cfml";

    const components = pairComponentTags(root, ctx.sourceIndex, language, ctx.symbolBudget);
    const functions = extractFunctions(root, ctx.sourceIndex, language, ctx.symbolBudget);
    const { queries, sqlSymbols } = await extractQueries(root, ctx.sourceIndex, ctx, language);
    const embeddedSymbols = await extractEmbeddedSymbols(root, ctx);

    const all = [...components, ...functions, ...queries, ...sqlSymbols, ...embeddedSymbols];
    assignContainmentParents(all);

    // A function/method distinction only becomes knowable once containment
    // (component -> function) is resolved above.
    for (const symbol of all) {
      if (
        (symbol.language === language || symbol.embeddedLanguage === "cfscript") &&
        symbol.kind === "function" &&
        symbol.parent?.kind === "class"
      ) {
        symbol.kind = "method";
      }
    }

    return all;
  },
};

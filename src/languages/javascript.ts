import type { LanguageAdapter } from "./types.js";
import { walkSymbols } from "./shared/walk.js";
import { jsFamilyRules, jsFamilyWrapper } from "./shared/js-family-rules.js";

export const javascriptAdapter: LanguageAdapter = {
  id: "javascript",
  extensions: [".js", ".jsx", ".mjs", ".cjs"],
  grammarId: "javascript",
  extractSymbols(ctx) {
    return walkSymbols(ctx.tree.rootNode, {
      language: "javascript",
      rules: jsFamilyRules,
      sourceIndex: ctx.sourceIndex,
      source: ctx.source,
      wrapper: jsFamilyWrapper,
      symbolBudget: ctx.symbolBudget,
    });
  },
};

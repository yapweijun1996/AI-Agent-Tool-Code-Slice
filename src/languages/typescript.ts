import type { LanguageAdapter } from "./types.js";
import { walkSymbols } from "./shared/walk.js";
import { jsFamilyRules, jsFamilyWrapper } from "./shared/js-family-rules.js";

export const typescriptAdapter: LanguageAdapter = {
  id: "typescript",
  // docs/LANGUAGE_SUPPORT_MATRIX.md pins TypeScript to exactly `.ts`; `.tsx` is its own adapter/grammar.
  extensions: [".ts"],
  grammarId: "typescript",
  extractSymbols(ctx) {
    return walkSymbols(ctx.tree.rootNode, {
      language: "typescript",
      rules: jsFamilyRules,
      sourceIndex: ctx.sourceIndex,
      source: ctx.source,
      wrapper: jsFamilyWrapper,
      symbolBudget: ctx.symbolBudget,
    });
  },
};

export const tsxAdapter: LanguageAdapter = {
  id: "tsx",
  extensions: [".tsx"],
  grammarId: "tsx",
  extractSymbols(ctx) {
    return walkSymbols(ctx.tree.rootNode, {
      language: "tsx",
      rules: jsFamilyRules,
      sourceIndex: ctx.sourceIndex,
      source: ctx.source,
      wrapper: jsFamilyWrapper,
      symbolBudget: ctx.symbolBudget,
    });
  },
};

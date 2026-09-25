import type { HighlightFn } from "@twinkleplop/markdown-core";

interface LanguageModule {
  language: () => HighlightFn;
}

// Each loader imports its grammar package on first use only. The server starts
// without any grammar and loads only the grammars that the pages use.
const loaders = {
  bash: () => import("@twinkleplop/bash"),
  css: () => import("@twinkleplop/css"),
  go: () => import("@twinkleplop/go"),
  html: () => import("@twinkleplop/html"),
  javascript: () => import("@twinkleplop/javascript"),
  json: () => import("@twinkleplop/json"),
  markdown: () => import("@twinkleplop/markdown"),
  python: () => import("@twinkleplop/python"),
  rust: () => import("@twinkleplop/rust"),
  sql: () => import("@twinkleplop/sql"),
  svelte: () => import("@twinkleplop/svelte"),
  toml: () => import("@twinkleplop/toml"),
  tsx: () => import("@twinkleplop/tsx"),
  typescript: () => import("@twinkleplop/typescript"),
  yaml: () => import("@twinkleplop/yaml"),
} satisfies Record<string, () => Promise<LanguageModule>>;

export type LanguageId = keyof typeof loaders;

export const supportedLanguages = Object.keys(loaders) as readonly LanguageId[];

/** Fence names that are not a canonical language id. */
export const languageAliases: Readonly<Record<string, LanguageId>> = {
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  console: "bash",
  golang: "go",
  htm: "html",
  xhtml: "html",
  vue: "html",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsonc: "json",
  json5: "json",
  jsonl: "json",
  md: "markdown",
  mdc: "markdown",
  comark: "markdown",
  py: "python",
  python3: "python",
  rs: "rust",
  mysql: "sql",
  postgres: "sql",
  postgresql: "sql",
  pgsql: "sql",
  sqlite: "sql",
  jsx: "tsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  yml: "yaml",
};

function isLanguageId(name: string): name is LanguageId {
  return Object.hasOwn(loaders, name);
}

/** Returns the canonical language id for a fence name, or `undefined` for an unknown name. */
export function resolveLanguage(name: string | undefined): LanguageId | undefined {
  const key = name?.trim().toLowerCase();
  if (!key) return undefined;
  if (isLanguageId(key)) return key;
  return Object.hasOwn(languageAliases, key) ? languageAliases[key] : undefined;
}

const pending = new Map<LanguageId, Promise<HighlightFn>>();
const loaded = new Map<LanguageId, HighlightFn>();

/** Loads a grammar. Concurrent and later calls share one import. */
export function loadLanguage(id: LanguageId): Promise<HighlightFn> {
  let promise = pending.get(id);
  if (!promise) {
    promise = loaders[id]().then((module: LanguageModule) => {
      const highlight = module.language();
      loaded.set(id, highlight);
      return highlight;
    });
    promise.catch(() => pending.delete(id));
    pending.set(id, promise);
  }
  return promise;
}

/** Returns a grammar that is already loaded, without a load. */
export function getLoadedLanguage(id: LanguageId): HighlightFn | undefined {
  return loaded.get(id);
}

/** Returns the ids of the grammars that are loaded, in load order. */
export function loadedLanguages(): LanguageId[] {
  return [...loaded.keys()];
}

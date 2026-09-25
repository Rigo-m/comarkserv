import type { TokenizeResult } from "@twinkleplop/core";

interface LanguageModule {
  language: () => Highlighter;
  tokenize: () => (input: string) => TokenizeResult;
}

export type LanguageId =
  | "bash"
  | "css"
  | "go"
  | "html"
  | "javascript"
  | "json"
  | "markdown"
  | "python"
  | "rust"
  | "sql"
  | "svelte"
  | "toml"
  | "tsx"
  | "typescript"
  | "yaml";

/** A grammar: it returns the highlighted HTML of the code. */
export type Highlighter = (code: string) => string;

// Each loader imports its grammar package on first use only. The server starts
// without any grammar and loads only the grammars that the pages use.
// LanguageId is a plain union, so the published declarations do not contain the
// types of the grammar packages, which comarkserv bundles.
const loaders: Record<LanguageId, () => Promise<LanguageModule>> = {
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
};

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

// The types here are the plain Highlighter, so the published declarations need
// no twinkleplop types. highlight.ts gives the render options to the grammars.
const pending = new Map<LanguageId, Promise<Highlighter>>();
const loaded = new Map<LanguageId, Highlighter>();

/** Loads a grammar. Concurrent and later calls share one import. */
export function loadLanguage(id: LanguageId): Promise<Highlighter> {
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

/** A token of a grammar: its type, such as `keyword`, and its text. */
export interface Token {
  type: string;
  value: string;
  start: number;
  end: number;
}

/** A tokenizer: it returns the tokens of the code. The gaps between tokens are plain text. */
export type Tokenizer = (code: string) => Token[];

const tokenizers = new Map<LanguageId, Promise<Tokenizer>>();

/** Loads the tokenizer of a grammar, for output that is not HTML, such as a terminal. */
export function loadTokenizer(id: LanguageId): Promise<Tokenizer> {
  let promise = tokenizers.get(id);
  if (!promise) {
    promise = Promise.all([loaders[id](), import("@twinkleplop/core")]).then(([module, core]) => {
      const tokenize = module.tokenize();
      return (code: string) => core.tokens_to_named(tokenize(code), code);
    });
    promise.catch(() => tokenizers.delete(id));
    tokenizers.set(id, promise);
  }
  return promise;
}

/** Returns a grammar that is already loaded, without a load. */
export function getLoadedLanguage(id: LanguageId): Highlighter | undefined {
  return loaded.get(id);
}

/** Returns the ids of the grammars that are loaded, in load order. */
export function loadedLanguages(): LanguageId[] {
  return [...loaded.keys()];
}

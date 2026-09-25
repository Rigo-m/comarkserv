import type { ConditionalNodeHandler, ElementNode, Node, NodeHandler } from "comark";
import { escapeHtml } from "comark/utils";
import { create_renderer } from "@twinkleplop/markdown-core";
import type { HighlightFn, RegistryValue } from "@twinkleplop/markdown-core";
import {
  getLoadedLanguage,
  languageAliases,
  loadLanguage,
  resolveLanguage,
  supportedLanguages,
} from "./languages.ts";
import type { LanguageId } from "./languages.ts";
import { childrenOf, errorBlock, isElement, stringAttr } from "./nodes.ts";

export interface CodeHighlighterOptions {
  /** Show line numbers on all code blocks. A fence can override this with `:line-numbers` or `:no-line-numbers`. */
  lineNumbers?: boolean;
}

export interface CodeHighlighter {
  /** Loads, in parallel, the grammars that the nodes use. */
  preload: (nodes: Node[]) => Promise<void>;
  /** Comark components that highlight code blocks and `code{:lang}` inline code. */
  components: Record<string, NodeHandler | ConditionalNodeHandler>;
}

const INLINE_LANGUAGE = /\{:([^{}\s]+)\}$/;

// The registry that twinkleplop gets. Each entry calls a grammar that the
// components load before they render, so twinkleplop can stay synchronous.
function createRegistry(): Record<string, RegistryValue> {
  const registry: Record<string, RegistryValue> = { ...languageAliases };
  for (const id of supportedLanguages) {
    registry[id] = lazyHighlight(id);
  }
  return registry;
}

function lazyHighlight(id: LanguageId): HighlightFn {
  return (code, render) => {
    const highlight = getLoadedLanguage(id);
    if (!highlight) throw new Error(`The "${id}" grammar is not loaded`);
    return highlight(code, render);
  };
}

function fenceLanguage(attrs: ElementNode[1]): string {
  return stringAttr(attrs, "language")?.trim().toLowerCase() ?? "";
}

// Comark moves `{1,3}` to `highlights` and `[file]` to `filename`. twinkleplop
// reads them from the meta string, so this function puts them back.
function fenceMeta(attrs: ElementNode[1]): string | undefined {
  const parts: string[] = [];
  if (Array.isArray(attrs.highlights) && attrs.highlights.length > 0) {
    parts.push(`{${attrs.highlights.join(",")}}`);
  }
  const filename = stringAttr(attrs, "filename");
  if (filename) parts.push(`[${filename}]`);
  const meta = stringAttr(attrs, "meta")?.trim();
  if (meta) parts.push(meta);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function codeText(node: Node | undefined): string {
  if (!isElement(node) || node[0] !== "code") return "";
  return childrenOf(node)
    .filter((child) => typeof child === "string")
    .join("");
}

function inlineText(node: ElementNode): string | undefined {
  return node.length === 3 && typeof node[2] === "string" ? node[2] : undefined;
}

function plainBlock(code: string): string {
  return `<pre class="twinkleplop"><code>${escapeHtml(code)}</code></pre>`;
}

/** Returns the ids of the known grammars that code blocks and inline code in the nodes use. */
export function collectLanguages(nodes: Node[]): Set<LanguageId> {
  const found = new Set<LanguageId>();
  const walk = (node: Node, parent?: ElementNode) => {
    if (!isElement(node)) return;
    const [tag, attrs] = node;
    if (tag === "pre") {
      const id = resolveLanguage(fenceLanguage(attrs));
      if (id) found.add(id);
      return;
    }
    if (tag === "code" && parent?.[0] !== "pre") {
      const match = INLINE_LANGUAGE.exec(inlineText(node) ?? "");
      const id = resolveLanguage(match?.[1]);
      if (id) found.add(id);
      return;
    }
    for (const child of childrenOf(node)) walk(child, node);
  };
  for (const node of nodes) walk(node);
  return found;
}

export function createCodeHighlighter(options: CodeHighlighterOptions = {}): CodeHighlighter {
  const renderer = create_renderer({
    languages: createRegistry(),
    on_unknown_language: "plain",
    inline: "tailing-curly-colon",
    line_numbers: options.lineNumbers ?? false,
  });

  const pre: NodeHandler = async ([, attrs, code]) => {
    const source = codeText(code);
    const name = fenceLanguage(attrs);
    const id = resolveLanguage(name);
    if (id) await loadLanguage(id);
    try {
      return renderer.fence(name || "text", fenceMeta(attrs), source) ?? plainBlock(source);
    } catch (error) {
      return errorBlock(source, error);
    }
  };

  const inlineCode: ConditionalNodeHandler = {
    match: (node) => node[0] === "code" && INLINE_LANGUAGE.test(inlineText(node) ?? ""),
    handler: async (node) => {
      const text = inlineText(node) ?? "";
      const id = resolveLanguage(INLINE_LANGUAGE.exec(text)?.[1]);
      if (id) await loadLanguage(id);
      try {
        return renderer.inline_code(text) ?? `<code>${escapeHtml(text)}</code>`;
      } catch {
        return `<code>${escapeHtml(text)}</code>`;
      }
    },
  };

  return {
    preload: async (nodes) => {
      await Promise.all([...collectLanguages(nodes)].map((id) => loadLanguage(id)));
    },
    components: { pre, inlineCode },
  };
}

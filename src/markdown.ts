import { createMarkdownParser } from "comark";
import type { ComarkPlugin, ConditionalNodeHandler, ElementNode, Node, NodeHandler } from "comark";
import { textContent } from "comark/utils";
import emoji from "comark/plugins/emoji";
import footnotes from "comark/plugins/footnotes";
import math from "comark/plugins/math";
import mermaid from "comark/plugins/mermaid";
import toc from "comark/plugins/toc";
import type { TocLink } from "comark/plugins/toc";
import { renderHtmlFromDocument } from "@comark/html";
import { createComponents, preloadFeatures } from "./components.ts";
import { createCodeHighlighter } from "./highlight.ts";
import { childrenOf, isElement } from "./nodes.ts";

export type { TocLink };

export interface MarkdownRendererOptions {
  /** Show line numbers on all code blocks. */
  lineNumbers?: boolean;
  /** More Comark plugins. They run after the built-in plugins. */
  plugins?: ComarkPlugin[];
  /** More Comark components. A component with a built-in name replaces the built-in one. */
  components?: Record<string, NodeHandler | ConditionalNodeHandler>;
  /** Changes the `href` of each link. The static build uses it to change `.md` links to `.html`. */
  transformLink?: (href: string) => string;
}

export interface MarkdownFeatures {
  math: boolean;
  mermaid: boolean;
}

export interface RenderedMarkdown {
  html: string;
  title: string | undefined;
  description: string | undefined;
  frontmatter: Record<string, unknown>;
  toc: TocLink[];
  features: MarkdownFeatures;
}

export type MarkdownRenderer = (source: string) => Promise<RenderedMarkdown>;

interface Scan {
  features: MarkdownFeatures;
  firstHeading: ElementNode | undefined;
}

// One walk over the tree: it finds the features of the page and the first h1,
// and it changes the links.
function scan(nodes: Node[], transformLink: ((href: string) => string) | undefined): Scan {
  const result: Scan = { features: { math: false, mermaid: false }, firstHeading: undefined };
  const walk = (node: Node) => {
    if (!isElement(node)) return;
    const [tag, attrs] = node;
    if (tag === "math") result.features.math = true;
    else if (tag === "mermaid") result.features.mermaid = true;
    else if (tag === "h1") result.firstHeading ??= node;
    else if (tag === "a" && transformLink && typeof attrs.href === "string") {
      attrs.href = transformLink(attrs.href);
    }
    for (const child of childrenOf(node)) walk(child);
  };
  for (const node of nodes) walk(node);
  return result;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createMarkdownRenderer(options: MarkdownRendererOptions = {}): MarkdownRenderer {
  const parse = createMarkdownParser({
    plugins: [
      toc({ depth: 2, searchDepth: 3 }),
      footnotes(),
      emoji(),
      math(),
      mermaid(),
      ...(options.plugins ?? []),
    ],
  });
  const highlighter = createCodeHighlighter({ lineNumbers: options.lineNumbers });
  const components = {
    ...highlighter.components,
    ...createComponents(),
    ...options.components,
  };

  return async (source) => {
    const doc = await parse(source);
    const { features, firstHeading } = scan(doc.nodes, options.transformLink);
    await Promise.all([highlighter.preload(doc.nodes), preloadFeatures(features)]);
    const html = await renderHtmlFromDocument(doc, { components });
    const frontmatter: Record<string, unknown> = doc.frontmatter ?? {};
    const meta: { toc?: { links?: TocLink[] } } = doc.meta ?? {};
    return {
      html,
      title:
        stringOrUndefined(frontmatter.title) ??
        stringOrUndefined(firstHeading && textContent(firstHeading)),
      description: stringOrUndefined(frontmatter.description),
      frontmatter,
      toc: meta.toc?.links ?? [],
      features,
    };
  };
}

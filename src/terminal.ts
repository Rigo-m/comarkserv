import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createMarkdownParser } from "comark";
import type { ElementNode, Node, NodeHandler } from "comark";
import emoji from "comark/plugins/emoji";
import footnotes from "comark/plugins/footnotes";
import math from "comark/plugins/math";
import mermaid from "comark/plugins/mermaid";
import { renderAnsiFromDocument } from "@comark/ansi";
import { Mermaid } from "@comark/ansi/plugins/mermaid";
import { loadTokenizer, resolveLanguage } from "./languages.ts";
import { childrenOf, isElement, stringAttr } from "./nodes.ts";

export interface TerminalRendererOptions {
  /** Emit ANSI colors. @default true, unless NO_COLOR is set */
  colors?: boolean;
  /** The width for rules and tables. @default 80 */
  width?: number;
}

export type TerminalRenderer = (source: string) => Promise<string>;

const ALERT_TYPES: Record<string, string> = {
  note: "NOTE",
  info: "NOTE",
  callout: "NOTE",
  tip: "TIP",
  success: "TIP",
  important: "IMPORTANT",
  warning: "WARNING",
  caution: "CAUTION",
  danger: "CAUTION",
};
const INLINE_LANGUAGE = /\{:([^{}\s]+)\}$/;
const UNWRAP = new Set([
  "code-group",
  "div",
  "figcaption",
  "figure",
  "kbd",
  "mark",
  "section",
  "small",
  "span",
  "sub",
  "sup",
]);
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let darkColors: Record<string, string> | undefined;

// The token colors of the GitHub dark theme, because most terminals are dark.
function tokenColors(): Record<string, string> {
  if (darkColors) return darkColors;
  const css = readFileSync(
    createRequire(import.meta.url).resolve("@twinkleplop/theme-github"),
    "utf8",
  );
  const dark = /\.dark\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  darkColors = Object.fromEntries(
    [...dark.matchAll(/--twp-([a-z0-9_]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map((match) => [
      match[1] ?? "",
      match[2] ?? "",
    ]),
  );
  return darkColors;
}

// Changes a code block to spans with inline colors. The pre handler of
// @comark/ansi prints such spans as true color text.
async function highlight(node: ElementNode): Promise<ElementNode> {
  const [tag, attrs, code] = node;
  const id = resolveLanguage(stringAttr(attrs, "language"));
  if (!id || !isElement(code)) return node;
  const text = childrenOf(code)
    .filter((child) => typeof child === "string")
    .join("");
  const tokens = (await loadTokenizer(id))(text);
  const colors = tokenColors();
  const children: Node[] = [];
  let position = 0;
  for (const token of tokens) {
    if (token.start > position) children.push(text.slice(position, token.start));
    const color = colors[token.type];
    children.push(color ? ["span", { style: `color:${color}` }, token.value] : token.value);
    position = token.end;
  }
  if (position < text.length) children.push(text.slice(position));
  return [tag, attrs, [code[0], code[1], ...children]];
}

// Prepares the tree for the terminal: colors code, turns alert components into
// GitHub alerts, and removes the `{:lang}` suffix of inline code.
async function prepare(nodes: Node[]): Promise<Node[]> {
  const prepared = await Promise.all(
    nodes.map(async (node): Promise<Node[]> => {
      if (!isElement(node)) return [node];
      const [tag, attrs] = node;
      if (tag === "pre") return [await highlight(node)];
      const children = await prepare(childrenOf(node));
      const alert =
        tag === "alert" ? ALERT_TYPES[stringAttr(attrs, "type") ?? "note"] : ALERT_TYPES[tag];
      if (alert) return [["blockquote", { as: alert.toLowerCase() }, ...children]];
      // Wrapper tags go, and their children stay in the parent. @comark/ansi does not
      // know these tags, and a link to a place on the same page is noise in a terminal.
      if (UNWRAP.has(tag) || (tag === "a" && stringAttr(attrs, "href")?.startsWith("#"))) {
        return children;
      }
      // @comark/ansi escapes text as markdown, so "[1]" would print as "\[1\]". Comark
      // prints the text of an element with this flag as it is.
      const raw = { ...attrs, $: { ...attrs.$, html: 1 as const, block: 1 as const } };
      if (tag === "code" && children.length === 1 && typeof children[0] === "string") {
        return [[tag, raw, children[0].replace(INLINE_LANGUAGE, "")]];
      }
      return [[tag, raw, ...children]];
    }),
  );
  // The unwrap can leave text nodes side by side. They become one node again, as
  // the parser makes them, so the renderer does not escape "[1]" as a link.
  const merged: Node[] = [];
  for (const node of prepared.flat()) {
    const last = merged.at(-1);
    if (typeof node === "string" && typeof last === "string")
      merged[merged.length - 1] = last + node;
    else merged.push(node);
  }
  return merged;
}

export function createTerminalRenderer(options: TerminalRendererOptions = {}): TerminalRenderer {
  const parse = createMarkdownParser({ plugins: [footnotes(), emoji(), math(), mermaid()] });
  const colors = options.colors ?? !process.env.NO_COLOR;
  const paint = (style: string, text: string) => (colors ? `${style}${text}${RESET}` : text);

  const components: Record<string, NodeHandler> = {
    details: async (node, state) =>
      `${paint(BOLD, `▸ ${stringAttr(node[1], "summary") ?? "Details"}`)}\n${(await state.flow(node, state)).trim()}\n\n`,
    math: ([, attrs]) => {
      const content = stringAttr(attrs, "content") ?? "";
      return (stringAttr(attrs, "class") ?? "").includes("inline")
        ? paint(YELLOW, `$${content}$`)
        : `${paint(YELLOW, content)}\n\n`;
    },
    mermaid: Mermaid,
    // The pre handler of @comark/ansi colors the language label even with no colors.
    pre: ([, attrs, code]) => {
      const language = stringAttr(attrs, "language") ?? "";
      const filename = stringAttr(attrs, "filename") ?? "";
      const header = [language && paint(BOLD + CYAN, language), filename && paint(DIM, filename)]
        .filter(Boolean)
        .join("  ");
      const body = isElement(code) ? childrenOf(code).map(codePart).join("") : "";
      return `\`\`\`${header}\n${body}\n\`\`\`\n\n`;
    },
  };
  // A part of highlighted code: text, or a span with an inline color.
  const codePart = (part: Node): string => {
    if (typeof part === "string") return part;
    if (!isElement(part)) return "";
    const text = childrenOf(part)
      .filter((child) => typeof child === "string")
      .join("");
    const color = /color:\s*#([0-9a-f]{6})/i.exec(stringAttr(part[1], "style") ?? "")?.[1];
    if (!colors || !color) return text;
    const [r, g, b] = [0, 2, 4].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
    return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
  };

  return async (source) => {
    const doc = await parse(source);
    const nodes = await prepare(doc.nodes);
    return renderAnsiFromDocument(
      { ...doc, nodes },
      { colors, width: options.width ?? 80, components },
    );
  };
}

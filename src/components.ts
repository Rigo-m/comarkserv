import type { ConditionalNodeHandler, ElementNode, Node, NodeHandler, State } from "comark";
import { escapeHtml } from "comark/utils";
import { childrenOf, errorBlock, isElement, stringAttr } from "./nodes.ts";

type Components = Record<string, NodeHandler | ConditionalNodeHandler>;

const ALERT_TITLES = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
} as const;

type AlertType = keyof typeof ALERT_TITLES;

// Comark component names that render as an alert, and the alert type of each.
const ALERT_COMPONENTS: Record<string, AlertType> = {
  note: "note",
  info: "note",
  callout: "note",
  tip: "tip",
  success: "tip",
  important: "important",
  warning: "warning",
  caution: "caution",
  danger: "caution",
};

const ICON_PATHS: Record<AlertType, string> = {
  note: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3Z"/>',
  important: '<path d="M4 4h16v12H8l-4 4Z"/><path d="M12 7v4M12 13.5h.01"/>',
  warning: '<path d="M12 3 2 20h20Z"/><path d="M12 9v5M12 17h.01"/>',
  caution: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8Z"/><path d="M12 8v5M12 16h.01"/>',
};

const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "br",
  "code",
  "del",
  "em",
  "i",
  "img",
  "input",
  "kbd",
  "mark",
  "math",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);

function icon(type: AlertType): string {
  return (
    '<svg class="cms-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[type]}</svg>`
  );
}

function isInline(node: Node): boolean {
  return typeof node === "string" || (isElement(node) && INLINE_TAGS.has(node[0]));
}

// Comark removes the paragraph around a single line of component content.
// This function puts a paragraph back, so the body always has block content.
async function renderBody(node: ElementNode, state: State): Promise<string> {
  const children = childrenOf(node);
  const html = await state.flow(node, state);
  return children.length > 0 && children.every(isInline) ? `<p>${html.trim()}</p>` : html;
}

function toAlertType(value: unknown): AlertType | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.toLowerCase();
  if (Object.hasOwn(ALERT_TITLES, key)) return key as AlertType;
  return Object.hasOwn(ALERT_COMPONENTS, key) ? ALERT_COMPONENTS[key] : undefined;
}

async function alert(type: AlertType, node: ElementNode, state: State): Promise<string> {
  const title = stringAttr(node[1], "title") ?? ALERT_TITLES[type];
  const body = await renderBody(node, state);
  return (
    `<div class="cms-alert cms-alert-${type}">` +
    `<p class="cms-alert-title">${icon(type)}${escapeHtml(title)}</p>${body}</div>`
  );
}

const githubAlert: ConditionalNodeHandler = {
  match: (node) => node[0] === "blockquote" && toAlertType(node[1].as) !== undefined,
  handler: (node, state) => alert(toAlertType(node[1].as) ?? "note", node, state),
};

const alertComponent: NodeHandler = (node, state) => {
  const type = toAlertType(node[0] === "alert" ? node[1].type : node[0]) ?? "note";
  return alert(type, node, state);
};

const codeGroup: NodeHandler = async (node, state) => {
  const panels = childrenOf(node).filter(isElement);
  const tabs: string[] = [];
  const bodies: string[] = [];
  for (const [index, panel] of panels.entries()) {
    const attrs = panel[1];
    const label =
      stringAttr(attrs, "filename") ?? stringAttr(attrs, "language") ?? `Tab ${index + 1}`;
    const selected = index === 0;
    // The tab shows the filename, so the panel does not repeat it as a title.
    const { filename: _filename, ...rest } = attrs;
    tabs.push(`<button role="tab" aria-selected="${selected}">${escapeHtml(label)}</button>`);
    bodies.push(
      `<div role="tabpanel"${selected ? "" : " hidden"}>` +
        `${await state.render([panel[0], rest, ...childrenOf(panel)])}</div>`,
    );
  }
  return (
    `<div class="cms-code-group"><div class="cms-tabs" role="tablist">${tabs.join("")}</div>` +
    `${bodies.join("")}</div>`
  );
};

const details: NodeHandler = async (node, state) => {
  const summary = stringAttr(node[1], "summary") ?? "Details";
  const body = await renderBody(node, state);
  return `<details><summary>${escapeHtml(summary)}</summary>${body}</details>`;
};

type Katex = typeof import("katex").default;
let katex: Promise<Katex> | undefined;

// KaTeX loads on the first page that has math.
function loadKatex(): Promise<Katex> {
  katex ??= import("katex").then((module) => module.default);
  return katex;
}

const math: NodeHandler = async ([, attrs]) => {
  const content = stringAttr(attrs, "content") ?? "";
  const inline = (stringAttr(attrs, "class") ?? "").includes("inline");
  const html = (await loadKatex()).renderToString(content, {
    displayMode: !inline,
    throwOnError: false,
    output: "htmlAndMathml",
  });
  return inline
    ? `<span class="cms-math">${html}</span>`
    : `<div class="cms-math cms-math-block">${html}</div>`;
};

const FONT_IMPORT = /@import url\([^)]*fonts\.googleapis\.com[^)]*\);?/g;
const MERMAID_CACHE_SIZE = 256;
const mermaidCache = new Map<string, string>();

// beautiful-mermaid renders the SVG on the server, so the page needs no
// Mermaid runtime. The colors are CSS variables, so the diagram follows the theme.
// The cache keeps a live reload fast when the diagram does not change.
const mermaid: NodeHandler = async ([, attrs]) => {
  const content = stringAttr(attrs, "content") ?? "";
  const cached = mermaidCache.get(content);
  if (cached) return cached;
  let html: string;
  try {
    const { renderMermaidSVG } = await import("beautiful-mermaid");
    const svg = renderMermaidSVG(content, {
      bg: "var(--cms-bg)",
      fg: "var(--cms-fg)",
      transparent: true,
    }).replace(FONT_IMPORT, "");
    html = `<figure class="cms-mermaid">${svg}</figure>`;
  } catch (error) {
    return errorBlock(content, error);
  }
  if (mermaidCache.size >= MERMAID_CACHE_SIZE) {
    mermaidCache.delete(mermaidCache.keys().next().value ?? "");
  }
  mermaidCache.set(content, html);
  return html;
};

export function createComponents(): Components {
  const components: Components = {
    githubAlert,
    alert: alertComponent,
    "code-group": codeGroup,
    details,
    math,
    mermaid,
  };
  for (const name of Object.keys(ALERT_COMPONENTS)) components[name] = alertComponent;
  return components;
}

/** Loads the libraries that the features of a page need, before the page renders. */
export async function preloadFeatures(features: { math: boolean }): Promise<void> {
  if (features.math) await loadKatex();
}

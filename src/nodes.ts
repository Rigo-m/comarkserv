import type { ElementNode, Node } from "comark";
import { escapeHtml } from "comark/utils";

export function isElement(node: Node | undefined): node is ElementNode {
  return Array.isArray(node) && typeof node[0] === "string";
}

/** Returns the child nodes of an element. */
export function childrenOf(node: ElementNode): Node[] {
  return node.slice(2) as Node[];
}

/** Returns an attribute value when it is a string that is not empty. */
export function stringAttr(attrs: ElementNode[1], name: string): string | undefined {
  const value = attrs[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Renders source text that failed to render, with the error message above it. */
export function errorBlock(source: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    `<figure class="cms-code-error"><figcaption>${escapeHtml(message)}</figcaption>` +
    `<pre class="twinkleplop"><code>${escapeHtml(source)}</code></pre></figure>`
  );
}

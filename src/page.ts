import type { ClientConfig } from "./client.ts";
import { themeScript } from "./client.ts";
import type { MarkdownFeatures, TocLink } from "./markdown.ts";
import type { Palette } from "./theme-parse.ts";

export interface Crumb {
  name: string;
  /** The link. The last crumb, the current page, has none. */
  href?: string;
}

export interface PageAssets {
  /** The URL of the stylesheet. */
  css: string;
  /** The URL of the client script. */
  js: string;
  /** The URL of the KaTeX stylesheet. */
  katex: string;
}

export interface PageInput {
  title: string;
  description?: string;
  /** The HTML in the `#cms-content` element. */
  content: string;
  /** The class of the `#cms-content` element. */
  contentClass?: string;
  toc?: TocLink[];
  crumbs: Crumb[];
  features?: MarkdownFeatures;
  /** The link to the source text of the page. */
  rawHref?: string;
  /** Text for the footer, after the product name. */
  footer?: string;
  /** The link of the logo. @default the link of the first crumb */
  home?: string;
  /** The default theme of the server. The built-in GitHub theme when it is not set. */
  theme?: Palette;
  config: ClientConfig;
  assets: PageAssets;
}

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function icon(paths: string): string {
  return (
    '<svg class="cms-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
}

const LOGO_PATHS =
  '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 15V9l3 3 3-3v6m4-6v6m-2.5-2.5L16 15l2.5-2.5"/>';

export const icons = {
  logo: icon(LOGO_PATHS),
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  palette: icon(
    '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4.5 4H16a2 2 0 0 0-1.5 3.3c.4.5.6 1 .6 1.5 0 .7-.6 1.2-1.3 1.2Z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/>',
  ),
  code: icon('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'),
  folder: icon(
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  ),
  file: icon(
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  ),
  markdown: icon(
    '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 15V9l3 3 3-3v6m4-6v6m-2.5-2.5L16 15l2.5-2.5"/>',
  ),
  image: icon(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  ),
  up: icon('<path d="M12 19V5m-7 7 7-7 7 7"/>'),
  book: icon(
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  ),
};

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8250df" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${LOGO_PATHS}</svg>`,
  );

export function renderToc(toc: TocLink[] | undefined): string {
  if (!toc || toc.length === 0) return "";
  const list = (links: TocLink[]): string =>
    `<ul>${links
      .map(
        (link) =>
          `<li><a href="#${escape(link.id)}">${escape(link.text)}</a>` +
          `${link.children?.length ? list(link.children) : ""}</li>`,
      )
      .join("")}</ul>`;
  return `<p>On this page</p>${list(toc)}`;
}

function renderCrumbs(crumbs: Crumb[]): string {
  return crumbs
    .map((crumb) =>
      crumb.href === undefined
        ? `<span>${escape(crumb.name)}</span>`
        : `<a href="${escape(crumb.href)}">${escape(crumb.name)}</a>`,
    )
    .join('<span class="cms-sep">/</span>');
}

function configScript(config: ClientConfig): string {
  // `<` is escaped, so a path cannot close the script element.
  return `<script type="application/json" id="cms-config">${JSON.stringify(config).replace(/</g, "\\u003c")}</script>`;
}

export function renderPage(input: PageInput): string {
  const { assets, config } = input;
  const toc = renderToc(input.toc);
  const rootHref = input.home ?? input.crumbs[0]?.href ?? "./";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(input.title)}</title>
${input.description ? `<meta name="description" content="${escape(input.description)}">\n` : ""}<meta name="generator" content="comarkserv">
<link rel="icon" href="${FAVICON}">
<script>${themeScript(input.theme)}</script>
<link rel="stylesheet" href="${escape(assets.css)}">
${input.features?.math ? `<link rel="stylesheet" href="${escape(assets.katex)}">\n` : ""}<script src="${escape(assets.js)}" defer></script>
</head>
<body>
<header class="cms-bar">
<a class="cms-logo" href="${escape(rootHref)}" title="Home">${icons.logo}</a>
<nav class="cms-crumbs" aria-label="Breadcrumb">${renderCrumbs(input.crumbs)}</nav>
<div class="cms-actions">
<button class="cms-button cms-search" type="button" data-cms-search>${icons.search}<span>Search</span><kbd>⌘K</kbd></button>
${input.rawHref ? `<a class="cms-button" href="${escape(input.rawHref)}" title="View the source">${icons.code}</a>\n` : ""}<button class="cms-button" type="button" data-cms-theme title="Change the theme">${icons.palette}</button>
${config.events ? '<span class="cms-live" title="Live reload is connecting"></span>\n' : ""}</div>
</header>
<div class="cms-layout">
<main class="cms-main"><div id="cms-content" class="${input.contentClass ?? "cms-markdown"}">
${input.content}
</div></main>
<aside class="cms-toc"><nav id="cms-toc" aria-label="Table of contents">${toc}</nav></aside>
</div>
<footer class="cms-footer">Served by <a href="https://github.com/Rigo-m/comarkserv">comarkserv</a>${input.footer ? ` · ${escape(input.footer)}` : ""}</footer>
${configScript(config)}
</body>
</html>
`;
}

/** Adds the client script to an HTML file that the server does not render, for live reload. */
export function injectClient(html: string, config: ClientConfig, assets: PageAssets): string {
  const tags = `${configScript(config)}<script src="${escape(assets.js)}" defer></script>`;
  const at = html.search(/<\/body>/i);
  return at < 0 ? html + tags : html.slice(0, at) + tags + html.slice(at);
}

export type EntryKind = "dir" | "markdown" | "image" | "file";

export interface ListingEntry {
  name: string;
  href: string;
  kind: EntryKind;
  size: number;
  modified: Date;
}

const KIND_ICONS: Record<EntryKind, string> = {
  dir: icons.folder,
  markdown: icons.markdown,
  image: icons.image,
  file: icons.file,
};

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatAge(date: Date, now = Date.now()): string {
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const steps: [number, string][] = [
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
  ];
  let value = seconds / 60;
  for (const [limit, unit] of steps) {
    if (value < limit) {
      const count = Math.floor(value);
      return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
    }
    value /= limit;
  }
  const years = Math.floor(value);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function renderListing(entries: ListingEntry[], parentHref: string | undefined): string {
  const rows = entries.map(
    (entry) =>
      `<tr data-kind="${entry.kind}"><td><a href="${escape(entry.href)}">${KIND_ICONS[entry.kind]}` +
      `${escape(entry.name)}${entry.kind === "dir" ? "/" : ""}</a></td>` +
      `<td>${entry.kind === "dir" ? "" : formatSize(entry.size)}</td>` +
      `<td><time datetime="${entry.modified.toISOString()}" title="${entry.modified.toLocaleString("en")}">` +
      `${formatAge(entry.modified)}</time></td></tr>`,
  );
  if (parentHref !== undefined) {
    rows.unshift(
      `<tr data-kind="dir"><td><a href="${escape(parentHref)}">${icons.up}..</a></td><td></td><td></td></tr>`,
    );
  }
  if (entries.length === 0)
    rows.push('<tr><td class="cms-empty" colspan="3">This directory is empty.</td></tr>');
  return (
    '<table class="cms-listing"><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>' +
    `<tbody>${rows.join("")}</tbody></table>`
  );
}

export function renderReadme(name: string, html: string): string {
  return `<section class="cms-readme"><header>${icons.book}${escape(name)}</header><div class="cms-markdown">${html}</div></section>`;
}

export function renderStatus(
  code: number,
  title: string,
  message: string,
  detail?: string,
): string {
  return (
    `<section class="cms-status"><h1>${code}</h1><h2>${escape(title)}</h2><p>${escape(message)}</p>` +
    `${detail ? `<pre><code>${escape(detail)}</code></pre>` : ""}</section>`
  );
}

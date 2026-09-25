import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "pathe";
import { glob } from "tinyglobby";
import { getAssets } from "./assets.ts";
import type { ClientConfig } from "./client.ts";
import { createMarkdownRenderer } from "./markdown.ts";
import type { MarkdownRendererOptions, RenderedMarkdown } from "./markdown.ts";
import { renderListing, renderPage, renderReadme } from "./page.ts";
import type { Crumb, PageInput } from "./page.ts";
import { createSearchIndex } from "./search.ts";
import { crumbsFor, isMarkdown, mapLimit, readDirectory, SKIPPED_GLOBS } from "./site.ts";
import type { LinkStyle } from "./site.ts";
import { createThemeStore } from "./themes.ts";
import type { ThemeStore } from "./themes.ts";

export interface BuildOptions extends MarkdownRendererOptions {
  /** The directory to build. @default process.cwd() */
  root?: string;
  /** The directory for the site. The build deletes an earlier build in it. @default "dist" */
  outDir?: string;
  /** Include dotfiles. `.well-known` is always included. @default false */
  dotfiles?: boolean;
  /** The default theme, as for the server. A theme that does not load stops the build. @default "github" */
  theme?: string;
  /** Write the theme catalog, so the theme picker of the site can list all themes. @default true */
  themeCatalog?: boolean;
  /** The store that loads and caches the themes. */
  themeStore?: ThemeStore;
}

export interface BuildResult {
  outDir: string;
  /** The number of HTML pages that the build wrote. */
  pages: number;
  /** The number of other files that the build copied. */
  files: number;
  ms: number;
  /** Problems that did not stop the build. */
  warnings: string[];
}

/** The directory in the site for the files of comarkserv. */
export const ASSETS_DIR = "_comarkserv";
const MARKER = `${ASSETS_DIR}/build.json`;
const CONCURRENCY = 16;
const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i;

/** Changes the path of a markdown file to the path of its HTML page. */
export function toHtmlPath(path: string): string {
  return `${path.slice(0, path.length - extname(path).length)}.html`;
}

/**
 * Returns a link transform for a page in `directory` (from the root, `""` for the root).
 * Links to markdown files go to their HTML pages, and links to directories go to their `index.html`.
 */
export function staticLinkTransform(directory: string): (href: string) => string {
  return (href) => {
    if (!href || EXTERNAL.test(href)) return href;
    const cut = href.search(/[?#]/);
    let path = cut < 0 ? href : href.slice(0, cut);
    const suffix = cut < 0 ? "" : href.slice(cut);
    if (path.startsWith("/")) {
      const isDirectory = path.endsWith("/");
      path = relative(`/${directory}`, path) || ".";
      if (isDirectory) path = `${path}/`;
    }
    if (isMarkdown(path)) path = toHtmlPath(path);
    else if (path.endsWith("/")) path = `${path}index.html`;
    else if (path === "." || path === "..") path = `${path}/index.html`;
    return path + suffix;
  };
}

const staticLinks: LinkStyle = {
  directory: (name) => `${encodeURIComponent(name)}/index.html`,
  markdown: (name) => encodeURIComponent(toHtmlPath(name)),
};

async function prepareOutDir(outDir: string): Promise<void> {
  const names = await readdir(outDir).catch(() => []);
  if (names.length > 0) {
    if (!existsSync(join(outDir, MARKER))) {
      throw new Error(
        `The output directory ${outDir} is not empty, and it is not an earlier comarkserv build. ` +
          "Delete it, or choose another directory.",
      );
    }
    await rm(outDir, { recursive: true, force: true });
  }
  await mkdir(join(outDir, ASSETS_DIR), { recursive: true });
}

function parentOf(path: string): string {
  const parent = dirname(path);
  return parent === "." ? "" : parent;
}

async function write(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

/** Builds a static HTML site from a directory. */
export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const started = performance.now();
  const root = resolve(options.root ?? process.cwd());
  const outDir = resolve(options.outDir ?? "dist");
  if (outDir === root || root.startsWith(`${outDir}/`)) {
    throw new Error("The output directory must not be the root or a parent of the root.");
  }
  // The theme loads before the build deletes an earlier build, so a typo in the
  // theme name does not leave an empty directory.
  const themeStore = options.themeStore ?? createThemeStore();
  const theme = await themeStore.load(options.theme ?? "github", process.cwd());
  const warnings: string[] = [];
  const catalog =
    options.themeCatalog === false
      ? undefined
      : await themeStore.catalog().catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          warnings.push(
            `The theme catalog is not available (${reason}). The theme picker shows only the built-in themes.`,
          );
          return undefined;
        });
  await prepareOutDir(outDir);

  const dotfiles = options.dotfiles ?? false;
  const rootName = basename(root) || root;
  const render = createMarkdownRenderer(options);
  const assets = getAssets();
  const outInRoot = outDir.startsWith(`${root}/`) ? relative(root, outDir) : undefined;
  const ignore = [...SKIPPED_GLOBS, ...(outInRoot ? [`${outInRoot}/**`] : [])];
  const files = await glob(dotfiles ? ["**/*"] : ["**/*", ".well-known/**"], {
    cwd: root,
    dot: dotfiles,
    ignore,
    onlyFiles: true,
    expandDirectories: false,
  });
  const fileSet = new Set(files);
  const directories = new Set<string>([""]);
  for (const file of files) {
    for (let directory = parentOf(file); directory; directory = parentOf(directory)) {
      directories.add(directory);
    }
  }
  let usesMath = false;

  const page = (
    url: string,
    kind: ClientConfig["kind"],
    input: Omit<PageInput, "assets" | "config">,
  ) => {
    const prefix = "../".repeat(url.split("/").length - 1);
    const base = `${prefix}${ASSETS_DIR}/`;
    return renderPage({
      ...input,
      theme,
      home: `${prefix}index.html`,
      assets: {
        css: `${base}app.css?v=${assets["app.css"].version}`,
        js: `${base}app.js?v=${assets["app.js"].version}`,
        katex: `${base}katex/katex.min.css?v=${assets.katexVersion}`,
      },
      config: {
        root: prefix,
        search: `${base}search.json`,
        events: "",
        themes: catalog ? `${base}themes/catalog.json` : "",
        edit: "",
        source: `/${url}`,
        kind,
      },
    });
  };
  const crumbs = (pathname: string): Crumb[] =>
    crumbsFor(pathname, rootName).map((crumb) =>
      crumb.href === undefined ? crumb : { ...crumb, href: `${crumb.href}index.html` },
    );

  const renderMarkdown = async (file: string): Promise<RenderedMarkdown> => {
    const source = await readFile(join(root, file), "utf8");
    const rendered = await render(source, { transformLink: staticLinkTransform(parentOf(file)) });
    usesMath ||= rendered.features.math;
    return rendered;
  };

  const markdownPages = files.filter((file) => isMarkdown(file));
  await mapLimit(markdownPages, CONCURRENCY, async (file) => {
    const rendered = await renderMarkdown(file);
    const url = toHtmlPath(file);
    const directory = parentOf(file);
    const isIndex = basename(file) === "index.md";
    const html = page(url, "markdown", {
      title: rendered.title ?? basename(file),
      description: rendered.description,
      content: rendered.html,
      toc: rendered.toc,
      crumbs: crumbs(isIndex ? `/${directory ? `${directory}/` : ""}` : `/${file}`),
      features: rendered.features,
      rawHref: encodeURIComponent(basename(file)),
    });
    await write(join(outDir, url), html);
  });

  const listings = [...directories].filter(
    (directory) =>
      !fileSet.has(join(directory, "index.md")) && !fileSet.has(join(directory, "index.html")),
  );
  await mapLimit(listings, CONCURRENCY, async (directory) => {
    const listing = await readDirectory(join(root, directory), { dotfiles, links: staticLinks });
    const entries = listing.entries.filter((entry) => {
      const path = join(directory, entry.name);
      return entry.kind === "dir" ? directories.has(path) : fileSet.has(path);
    });
    let content = renderListing(entries, directory ? "../index.html" : undefined);
    let readme: RenderedMarkdown | undefined;
    if (listing.readme) {
      readme = await renderMarkdown(join(directory, listing.readme));
      content += renderReadme(listing.readme, readme.html);
    }
    const url = join(directory, "index.html");
    const html = page(url, "directory", {
      title: directory ? `${directory}/` : rootName,
      content,
      contentClass: "cms-directory",
      toc: readme?.toc,
      crumbs: crumbs(`/${directory ? `${directory}/` : ""}`),
      features: readme?.features,
    });
    await write(join(outDir, url), html);
  });

  // The markdown sources are copied too, for the "view the source" links.
  await mapLimit(files, 32, async (file) => {
    await mkdir(join(outDir, parentOf(file)), { recursive: true });
    if (isMarkdown(file) || !existsSync(join(outDir, file)))
      await copyFile(join(root, file), join(outDir, file));
  });

  const search = createSearchIndex({ root, dotfiles, ignore, toUrl: toHtmlPath });
  await Promise.all([
    write(join(outDir, ASSETS_DIR, "app.css"), assets["app.css"].body),
    write(join(outDir, ASSETS_DIR, "app.js"), assets["app.js"].body),
    write(join(outDir, ASSETS_DIR, "search.json"), JSON.stringify(await search.get())),
    ...(catalog
      ? [write(join(outDir, ASSETS_DIR, "themes", "catalog.json"), JSON.stringify(catalog))]
      : []),
    write(
      join(outDir, MARKER),
      JSON.stringify({ generator: "comarkserv", date: new Date().toISOString() }),
    ),
  ]);
  if (usesMath) {
    const katexFiles = await glob(["katex.min.css", "fonts/*.woff2"], { cwd: assets.katexDir });
    await Promise.all(
      katexFiles.map(async (file) => {
        await mkdir(dirname(join(outDir, ASSETS_DIR, "katex", file)), { recursive: true });
        await copyFile(join(assets.katexDir, file), join(outDir, ASSETS_DIR, "katex", file));
      }),
    );
  }

  return {
    outDir,
    pages: markdownPages.length + listings.length,
    files: files.length - markdownPages.length,
    ms: performance.now() - started,
    warnings,
  };
}

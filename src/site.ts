import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { Crumb, EntryKind, ListingEntry } from "./page.ts";

export const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  ".md",
  ".markdown",
  ".mdown",
  ".mkd",
  ".mdc",
]);

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".apng",
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);

/** Directories that the listing, the search index and the watcher skip. */
export const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(["node_modules", ".git"]);

/** Glob patterns for the skipped directories, for tinyglobby. */
export const SKIPPED_GLOBS: readonly string[] = [...SKIPPED_DIRECTORIES].map(
  (name) => `**/${name}/**`,
);

/** A glob pattern for markdown files, for tinyglobby. */
export const MARKDOWN_GLOB = `**/*.{${[...MARKDOWN_EXTENSIONS].map((extension) => extension.slice(1)).join(",")}}`;

export function isMarkdown(name: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(name).toLowerCase());
}

export function entryKind(name: string, directory: boolean): EntryKind {
  if (directory) return "dir";
  const extension = extname(name).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  return IMAGE_EXTENSIONS.has(extension) ? "image" : "file";
}

/** Returns true when a path segment is hidden: a dotfile other than `.well-known`. */
export function isHiddenSegment(segment: string): boolean {
  return segment.startsWith(".") && segment !== ".well-known";
}

/** Returns true when a URL path, with `/` separators, has a hidden segment. */
export function hasHiddenSegment(path: string): boolean {
  return path.split("/").some(isHiddenSegment);
}

/** Returns true when the watcher and the search index must skip a path from the root. */
export function isSkippedPath(path: string, dotfiles: boolean): boolean {
  return path
    .split("/")
    .some((segment) => SKIPPED_DIRECTORIES.has(segment) || (!dotfiles && isHiddenSegment(segment)));
}

/** A relative link that goes up the given number of directories. */
export function up(levels: number): string {
  return levels === 0 ? "./" : "../".repeat(levels);
}

/**
 * Returns the breadcrumbs for a URL path. The links are relative, so they work
 * on the server and in a static build.
 */
export function crumbsFor(pathname: string, rootName: string): Crumb[] {
  const isDirectory = pathname.endsWith("/");
  const segments = pathname.split("/").filter(Boolean);
  const directories = isDirectory ? segments : segments.slice(0, -1);
  const crumbs: Crumb[] = [{ name: rootName, href: up(directories.length) }];
  directories.forEach((name, index) => {
    crumbs.push({ name, href: up(directories.length - 1 - index) });
  });
  if (!isDirectory && segments.length > 0) crumbs.push({ name: segments.at(-1) ?? "" });
  // The current page is the last crumb, and it has no link.
  const last = crumbs.at(-1);
  if (last) delete last.href;
  return crumbs;
}

export interface LinkStyle {
  /** The link to a subdirectory. */
  directory: (name: string) => string;
  /** The link to a markdown file. */
  markdown: (name: string) => string;
}

export const serverLinks: LinkStyle = {
  directory: (name) => `${encodeURIComponent(name)}/`,
  markdown: (name) => encodeURIComponent(name),
};

export interface Directory {
  entries: ListingEntry[];
  /** The README file of the directory, if it has one. */
  readme: string | undefined;
}

function compareEntries(a: ListingEntry, b: ListingEntry): number {
  if ((a.kind === "dir") !== (b.kind === "dir")) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });
}

/** Reads a directory for the listing: directories first, then files, in natural order. */
export async function readDirectory(
  path: string,
  options: { dotfiles: boolean; links: LinkStyle },
): Promise<Directory> {
  const dirents: Dirent[] = await readdir(path, { withFileTypes: true });
  const visible = dirents.filter(
    (dirent) =>
      !SKIPPED_DIRECTORIES.has(dirent.name) && (options.dotfiles || !isHiddenSegment(dirent.name)),
  );
  const entries = await Promise.all(
    visible.map(async (dirent): Promise<ListingEntry | undefined> => {
      const info = await stat(join(path, dirent.name)).catch(() => undefined);
      if (!info) return undefined;
      const directory = info.isDirectory();
      const kind = entryKind(dirent.name, directory);
      const href = directory
        ? options.links.directory(dirent.name)
        : kind === "markdown"
          ? options.links.markdown(dirent.name)
          : encodeURIComponent(dirent.name);
      return { name: dirent.name, href, kind, size: info.size, modified: info.mtime };
    }),
  );
  const list = entries.filter((entry) => entry !== undefined).sort(compareEntries);
  const readme = list.find(
    (entry) => entry.kind === "markdown" && /^readme\.[a-z]+$/i.test(entry.name),
  )?.name;
  return { entries: list, readme };
}

/** Maps the items with at most `limit` calls at the same time. The results keep the order of the items. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await map(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const README_EXTENSIONS = ["md", "markdown", "mdc", "mdown", "mkd"];

/**
 * Returns the closest README: in `start`, or else in the first parent directory
 * that has one. The name can have any case. `README.md` comes before the other
 * markdown extensions.
 */
export async function findReadme(start: string): Promise<string | undefined> {
  for (let directory = start; ; directory = dirname(directory)) {
    // A file has no entries, so the search continues in its directory.
    const names = await readdir(directory).catch((): string[] => []);
    for (const extension of README_EXTENSIONS) {
      const name = names.find((entry) => entry.toLowerCase() === `readme.${extension}`);
      if (name) return join(directory, name);
    }
    if (dirname(directory) === directory) return undefined;
  }
}

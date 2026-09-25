import { readFile } from "node:fs/promises";
import { basename, extname, join } from "pathe";
import { mapLimit, MARKDOWN_GLOB, SKIPPED_GLOBS } from "./site.ts";

export interface SearchHeading {
  id: string;
  text: string;
  depth: number;
}

export interface SearchEntry {
  /** The URL path of the page, from the site root. */
  url: string;
  title: string;
  headings: SearchHeading[];
}

export interface Outline {
  title: string | undefined;
  headings: SearchHeading[];
}

const MAX_FILES = 10_000;
const READ_CONCURRENCY = 32;

// The same slug as Comark makes, so the heading links in search results work.
function slugify(text: string): string {
  let slug = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (/^\d/.test(slug)) slug = `_${slug}`;
  return slug;
}

/** Removes the inline markdown from heading text. */
function plainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=$|[^\w*])/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATTRIBUTES = /\s*\{([^{}]*)\}\s*$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function customId(attributes: string | undefined): string | undefined {
  if (!attributes) return undefined;
  return /(?:^|\s)#([\w-]+)/.exec(attributes)?.[1] ?? /\bid=["']?([\w-]+)/.exec(attributes)?.[1];
}

function frontmatterTitle(yaml: string): string | undefined {
  const match = /^title:[ \t]*(.+?)[ \t]*$/m.exec(yaml);
  if (!match?.[1]) return undefined;
  return match[1].replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;
}

/** Reads the title and the headings of a markdown source, with no full parse. */
export function extractOutline(source: string): Outline {
  const frontmatter = FRONTMATTER.exec(source);
  const body = frontmatter ? source.slice(frontmatter[0].length) : source;
  const headings: SearchHeading[] = [];
  const stack: { level: number; id: string }[] = [];
  const counts = new Map<string, number>();
  let fence: string | undefined;
  let previous = "";

  const add = (level: number, raw: string) => {
    const attributes = ATTRIBUTES.exec(raw);
    const text = plainText(attributes ? raw.slice(0, attributes.index) : raw);
    if (!text) return;
    let slug = slugify(text);
    while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= level) stack.pop();
    const parent = stack.at(-1);
    if (parent && parent.level >= 2) slug = `${parent.id}-${slug}`;
    stack.push({ level, id: slug });
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    const id = customId(attributes?.[1]) ?? (count === 0 ? slug : `${slug}-${count}`);
    headings.push({ id, text, depth: level });
  };

  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = FENCE.exec(line);
    if (fence) {
      if (
        fenceMatch?.[1] &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = undefined;
      }
      previous = "";
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      previous = "";
      continue;
    }
    const atx = ATX.exec(line);
    if (atx?.[1]) {
      add(atx[1].length, atx[2] ?? "");
      previous = "";
      continue;
    }
    // A setext heading: a text line, then a line of `=` or `-`.
    if (previous && /^ {0,3}(=+|-+)[ \t]*$/.test(line) && !/^ {0,3}[-*+>]|^ {4}/.test(previous)) {
      add(line.trim().startsWith("=") ? 1 : 2, previous.trim());
      previous = "";
      continue;
    }
    previous = line.trim() ? line : "";
  }

  const title =
    (frontmatter?.[1] ? frontmatterTitle(frontmatter[1]) : undefined) ??
    headings.find((heading) => heading.depth === 1)?.text;
  return { title, headings };
}

async function findMarkdown(
  root: string,
  dotfiles: boolean,
  ignore: readonly string[],
): Promise<string[]> {
  // tinyglobby loads when the first search needs it.
  const { glob } = await import("tinyglobby");
  return glob(MARKDOWN_GLOB, {
    cwd: root,
    dot: dotfiles,
    ignore: [...SKIPPED_GLOBS, ...ignore],
    caseSensitiveMatch: false,
    expandDirectories: false,
  }).then((paths) => paths.sort().slice(0, MAX_FILES));
}

export interface SearchIndexOptions {
  root: string;
  dotfiles: boolean;
  /** Changes the path of a file, from the root with a leading `/`, to the URL of its page. */
  toUrl?: (path: string) => string;
  /** More glob patterns to skip. */
  ignore?: readonly string[];
}

export interface SearchIndex {
  /** Returns the entries. The first call reads all markdown files. Later calls read only the changed files. */
  get: () => Promise<SearchEntry[]>;
  /** Marks paths as changed. Use the URL paths from the file watcher. */
  invalidate: (paths: string[]) => void;
}

export function createSearchIndex(options: SearchIndexOptions): SearchIndex {
  const toUrl = options.toUrl ?? ((path: string) => path);
  let entries: Map<string, SearchEntry> | undefined;
  let building: Promise<Map<string, SearchEntry>> | undefined;
  let changed = new Set<string>();
  let stale = false;

  const read = async (path: string): Promise<SearchEntry | undefined> => {
    const source = await readFile(join(options.root, path), "utf8").catch(() => undefined);
    if (source === undefined) return undefined;
    const outline = extractOutline(source);
    const title = outline.title ?? basename(path, extname(path));
    return { url: toUrl(`/${path}`), title, headings: outline.headings };
  };

  // The glob reads only file names. Only new and changed files are read again.
  const build = async (previous: Map<string, SearchEntry> | undefined) => {
    const dirty = changed;
    changed = new Set();
    const paths = await findMarkdown(options.root, options.dotfiles, options.ignore ?? []);
    const list = await mapLimit(paths, READ_CONCURRENCY, (path) => {
      const known = previous?.get(path);
      return known && !dirty.has(path) ? Promise.resolve(known) : read(path);
    });
    const map = new Map<string, SearchEntry>();
    paths.forEach((path, index) => {
      const entry = list[index];
      if (entry) map.set(path, entry);
    });
    return map;
  };

  return {
    get: async () => {
      while (!entries || stale) {
        stale = false;
        building ??= build(entries).finally(() => (building = undefined));
        entries = await building;
      }
      return [...entries.values()].sort((a, b) => a.url.localeCompare(b.url));
    },
    invalidate: (paths) => {
      for (const path of paths) changed.add(path.replace(/^\//, ""));
      if (paths.length > 0) stale = true;
    },
  };
}

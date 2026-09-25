import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "pathe";
import { parseTheme } from "./theme-parse.ts";
import type { Palette } from "./theme-parse.ts";

export type { Palette };

/** The remote theme sources. Each theme is one file in a GitHub repository. */
export const THEME_SOURCES = {
  base16: { repo: "tinted-theming/schemes", dir: "base16/", suffix: ".yaml" },
  base24: { repo: "tinted-theming/schemes", dir: "base24/", suffix: ".yaml" },
  omarchy: { repo: "basecamp/omarchy", dir: "themes/", suffix: "/colors.toml" },
} as const;

export type ThemeSource = keyof typeof THEME_SOURCES;

export interface CatalogEntry {
  /** The value for `--theme`, such as `base16:nord`. */
  id: string;
  name: string;
  source: ThemeSource | "omarchy-live";
  /** The URL of the theme file. */
  url: string;
}

export interface ThemeStoreOptions {
  /** The directory for downloaded themes and listings. @default ~/.cache/comarkserv/themes */
  cacheDir?: string;
  fetch?: (input: string) => Promise<Response>;
  now?: () => number;
  /** The `colors.toml` of the current Omarchy theme. */
  omarchyPath?: string;
}

export interface ThemeStore {
  /** Lists the themes of all remote sources. `urlFor` gives the URL of each entry. @default the raw GitHub URL */
  catalog: (urlFor?: (source: ThemeSource, id: string) => string) => Promise<CatalogEntry[]>;
  /** Returns the text of a remote theme, or `undefined` when it does not exist. */
  raw: (source: ThemeSource, id: string) => Promise<string | undefined>;
  /**
   * Loads the theme for a `--theme` value. Returns `undefined` for the built-in GitHub theme.
   * Rejects with a message when it cannot load the theme.
   */
  load: (spec: string, cwd?: string) => Promise<Palette | undefined>;
}

/** The `colors.toml` of the current Omarchy theme. `omarchy-theme-set` replaces it on each change. */
export const OMARCHY_CURRENT = join(homedir(), ".local/state/omarchy/current/theme/colors.toml");

const UNGH = "https://ungh.cc/repos/";
const RAW = "https://raw.githubusercontent.com/";
const DAY = 24 * 60 * 60 * 1000;
const LISTING_TTL = DAY;
const THEME_TTL = 7 * DAY;
const TIMEOUT = 8000;
const THEME_ID = /^[a-z0-9][a-z0-9._-]*$/i;
const REMOTE_SPEC = /^(base16|base24|omarchy):(.+)$/;

export function defaultCacheDir(): string {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "comarkserv", "themes");
}

export function isThemeSource(value: string): value is ThemeSource {
  return Object.hasOwn(THEME_SOURCES, value);
}

/** Returns true for a theme id that is a plain file name, so it cannot change the path. */
export function isThemeId(id: string): boolean {
  return THEME_ID.test(id) && !id.includes("..");
}

function titleCase(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Returns the file to watch for a `--theme` value that can change while the server runs. */
export function themeWatchPath(
  spec: string,
  cwd: string,
  omarchyPath = OMARCHY_CURRENT,
): string | undefined {
  if (spec === "omarchy") return omarchyPath;
  if (spec === "github" || REMOTE_SPEC.test(spec) || /^https?:\/\//.test(spec)) return undefined;
  return resolve(cwd, spec);
}

interface CacheRecord {
  time: number;
  text: string;
}

export function createThemeStore(options: ThemeStoreOptions = {}): ThemeStore {
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const request =
    options.fetch ?? ((input: string) => fetch(input, { signal: AbortSignal.timeout(TIMEOUT) }));
  const now = options.now ?? Date.now;
  const omarchyPath = options.omarchyPath ?? OMARCHY_CURRENT;
  const pending = new Map<string, Promise<string | undefined>>();

  const cachePath = (url: string) =>
    join(cacheDir, `${createHash("sha1").update(url).digest("hex").slice(0, 20)}.json`);

  const readCache = async (url: string): Promise<CacheRecord | undefined> => {
    try {
      return JSON.parse(await readFile(cachePath(url), "utf8")) as CacheRecord;
    } catch {
      return undefined;
    }
  };

  // Memory first, then a fresh disk entry, then the network. When the request
  // fails, a stale disk entry is better than no theme.
  const cached = (url: string, ttl: number): Promise<string | undefined> => {
    let promise = pending.get(url);
    if (!promise) {
      promise = (async () => {
        const record = await readCache(url);
        if (record && now() - record.time < ttl) return record.text;
        try {
          const response = await request(url);
          if (response.status === 404) return undefined;
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const text = await response.text();
          await mkdir(cacheDir, { recursive: true });
          await writeFile(
            cachePath(url),
            JSON.stringify({ time: now(), text } satisfies CacheRecord),
          );
          return text;
        } catch (error) {
          if (record) return record.text;
          throw error;
        }
      })();
      pending.set(url, promise);
      // The map only joins requests at the same time. Later calls read the disk cache,
      // so a long-running server sees a new version when the entry is stale.
      const done = () => pending.delete(url);
      promise.then(done, done);
    }
    return promise;
  };

  const json = async <T>(url: string, ttl: number): Promise<T> => {
    const text = await cached(url, ttl);
    if (text === undefined) throw new Error(`${url} does not exist`);
    return JSON.parse(text) as T;
  };

  const branch = async (repo: string) =>
    (await json<{ repo: { defaultBranch: string } }>(`${UNGH}${repo}`, LISTING_TTL)).repo
      .defaultBranch;

  const listing = async (repo: string) => {
    const ref = await branch(repo);
    const { files } = await json<{ files: { path: string }[] }>(
      `${UNGH}${repo}/files/${ref}`,
      LISTING_TTL,
    );
    return { ref, paths: files.map((file) => file.path) };
  };

  const rawUrl = async (source: ThemeSource, id: string) => {
    const { repo, dir, suffix } = THEME_SOURCES[source];
    return `${RAW}${repo}/${await branch(repo)}/${dir}${id}${suffix}`;
  };

  const raw = async (source: ThemeSource, id: string) => {
    if (!isThemeId(id)) return undefined;
    return cached(await rawUrl(source, id), THEME_TTL);
  };

  const catalog = async (urlFor?: (source: ThemeSource, id: string) => string) => {
    const repos = [...new Set(Object.values(THEME_SOURCES).map((source) => source.repo))];
    const listings = new Map(
      await Promise.all(repos.map(async (repo) => [repo, await listing(repo)] as const)),
    );
    const entries: CatalogEntry[] = [];
    for (const [source, { repo, dir, suffix }] of Object.entries(THEME_SOURCES)) {
      const found = listings.get(repo);
      if (!found || !isThemeSource(source)) continue;
      const ids = found.paths
        .filter((path) => path.startsWith(dir) && path.endsWith(suffix))
        .map((path) => path.slice(dir.length, path.length - suffix.length))
        .filter(isThemeId);
      const sorted = ids
        .map((id) => ({ id, name: titleCase(id) }))
        .sort((a, b) => a.name.localeCompare(b.name, "en"));
      for (const { id, name } of sorted) {
        const url = urlFor ? urlFor(source, id) : `${RAW}${repo}/${found.ref}/${dir}${id}${suffix}`;
        entries.push({ id: `${source}:${id}`, name, source, url });
      }
    }
    return entries;
  };

  const parse = (text: string, id: string, name: string, origin: string) => {
    const theme = parseTheme(text, id, name);
    if (!theme) throw new Error(`${origin} is not a base16, base24 or Omarchy theme.`);
    return theme;
  };

  const load = async (spec: string, cwd = process.cwd()): Promise<Palette | undefined> => {
    if (!spec || spec === "github") return undefined;
    const remote = REMOTE_SPEC.exec(spec);
    if (remote?.[1] && remote[2] && isThemeSource(remote[1])) {
      const text = await raw(remote[1], remote[2]);
      if (text === undefined) {
        throw new Error(`There is no theme "${spec}". Run \`comarkserv themes\` for the list.`);
      }
      return parse(text, spec, titleCase(remote[2]), spec);
    }
    if (spec === "omarchy") {
      const text = await readFile(omarchyPath, "utf8").catch(() => {
        throw new Error(`There is no current Omarchy theme at ${omarchyPath}.`);
      });
      return parse(text, "omarchy-live", "Omarchy", omarchyPath);
    }
    if (/^https?:\/\//.test(spec)) {
      const text = await cached(spec, LISTING_TTL);
      if (text === undefined) throw new Error(`There is no theme at ${spec}.`);
      return parse(text, spec, titleCase(basename(spec, extname(spec))), spec);
    }
    const path = resolve(cwd, spec);
    const text = await readFile(path, "utf8").catch(() => {
      throw new Error(`There is no theme file at ${path}.`);
    });
    const name =
      basename(path) === "colors.toml" ? basename(dirname(path)) : basename(path, extname(path));
    return parse(text, `file:${basename(path)}`, titleCase(name), path);
  };

  return { catalog, raw, load };
}

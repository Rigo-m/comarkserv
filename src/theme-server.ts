import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";
import { dirname, resolve } from "pathe";
import { isThemeSource, OMARCHY_CURRENT, themeWatchPath } from "./themes.ts";
import type { CatalogEntry, Palette, ThemeStore } from "./themes.ts";

export interface ThemeServiceOptions {
  /** The `--theme` value. */
  spec: string;
  store: ThemeStore;
  /** The URL prefix of the theme endpoints, with a trailing slash. */
  prefix: string;
  /** Watch the theme file of the spec and the current Omarchy theme. */
  watch: boolean;
  omarchyPath?: string;
  cwd?: string;
}

export interface ThemeService {
  /** Resolves when the watchers are ready. */
  ready: Promise<void>;
  /** The default theme for the pages, or `undefined` for the built-in GitHub theme. */
  current: () => Promise<Palette | undefined>;
  /** A number that changes when the default theme changes. Page caches include it. */
  version: () => number;
  /** Answers a request for `<prefix><name>`. */
  handle: (request: Request, name: string) => Promise<Response>;
  /** Calls the listener with each theme that changes on disk. */
  subscribe: (listener: (theme: Palette) => void) => () => void;
  close: () => Promise<void>;
}

const RAW_PATH = /^raw\/([^/]+)\/([^/]+)$/;
const DEBOUNCE = 80;

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function text(body: string, cacheControl: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": cacheControl },
  });
}

export function createThemeService(options: ThemeServiceOptions): ThemeService {
  const { store, prefix } = options;
  const omarchyPath = resolve(options.omarchyPath ?? OMARCHY_CURRENT);
  const cwd = options.cwd ?? process.cwd();
  const defaultPath = themeWatchPath(options.spec, cwd, omarchyPath);
  const listeners = new Set<(theme: Palette) => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let version = 0;

  const load = () =>
    store.load(options.spec, cwd).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`comarkserv: ${message} The pages use the GitHub theme.`);
      return undefined;
    });
  let current = load();

  const emit = (theme: Palette | undefined) => {
    if (theme) for (const listener of listeners) listener(theme);
  };

  const onFile = async (path: string) => {
    if (path === defaultPath) {
      version++;
      current = load();
      emit(await current);
    } else if (path === omarchyPath) {
      emit(await store.load("omarchy", cwd).catch(() => undefined));
    }
  };

  let watcher: FSWatcher | undefined;
  let ready = Promise.resolve();
  const files = new Set<string>();
  if (options.watch) {
    if (defaultPath) files.add(resolve(defaultPath));
    if (existsSync(omarchyPath)) files.add(omarchyPath);
  }
  if (files.size > 0) {
    // omarchy-theme-set replaces the whole theme directory, so the watcher
    // watches the directory above it. Another theme file has a watcher on its own directory.
    const directories = [...files].map((file) =>
      file === omarchyPath ? dirname(dirname(file)) : dirname(file),
    );
    const active = watch(directories, {
      ignoreInitial: true,
      depth: 1,
      ignored: (path, stats) => stats?.isFile() === true && !files.has(resolve(path)),
    });
    active.on("all", (_event, path) => {
      const file = resolve(path);
      if (!files.has(file)) return;
      clearTimeout(timers.get(file));
      timers.set(
        file,
        setTimeout(() => void onFile(file), DEBOUNCE),
      );
    });
    active.on("error", () => {});
    ready = new Promise((done) => active.once("ready", () => done()));
    watcher = active;
  }

  const catalog = async () => {
    const entries = await store
      .catalog((source, id) => `${prefix}raw/${source}/${id}`)
      .catch((): CatalogEntry[] => []);
    if (existsSync(omarchyPath)) {
      entries.unshift({
        id: "omarchy-live",
        name: "Omarchy (live)",
        source: "omarchy-live",
        url: `${prefix}omarchy-live`,
      });
    }
    return Response.json(entries, { headers: { "cache-control": "no-cache" } });
  };

  const handle = async (_request: Request, name: string): Promise<Response> => {
    if (name === "catalog.json") return catalog();
    if (name === "omarchy-live") {
      const body = await readFile(omarchyPath, "utf8").catch(() => undefined);
      return body === undefined ? notFound() : text(body, "no-cache");
    }
    const [, source = "", id = ""] = RAW_PATH.exec(name) ?? [];
    if (!isThemeSource(source)) return notFound();
    const body = await store.raw(source, id).catch(() => undefined);
    return body === undefined ? notFound() : text(body, "public, max-age=86400");
  };

  return {
    ready,
    current: () => current,
    version: () => version,
    handle,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => {
      for (const timer of timers.values()) clearTimeout(timer);
      listeners.clear();
      await watcher?.close();
    },
  };
}

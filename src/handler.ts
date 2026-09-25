import { createHash, randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants as zlib, gzip } from "node:zlib";
import { staticMiddleware } from "srvx/static";
import { getAssets } from "./assets.ts";
import type { ClientConfig } from "./client.ts";
import type { MarkdownRenderer, MarkdownRendererOptions, RenderedMarkdown } from "./markdown.ts";
import { injectClient, renderListing, renderPage, renderReadme, renderStatus } from "./page.ts";
import type { PageAssets, PageInput } from "./page.ts";
import type { OpenEditor } from "./editor.ts";
import { createSearchIndex, extractOutline } from "./search.ts";
import {
  crumbsFor,
  hasHiddenSegment,
  isMarkdown,
  isSkippedPath,
  readDirectory,
  serverLinks,
} from "./site.ts";
import { createThemeService } from "./theme-server.ts";
import { createThemeStore } from "./themes.ts";
import type { ThemeStore } from "./themes.ts";
import { watchTree } from "./watch.ts";

/** The URL prefix of the files and endpoints of comarkserv itself. */
export const INTERNAL_PREFIX = "/__comarkserv/";

export interface ComarkservOptions extends MarkdownRendererOptions {
  /** The directory to serve. @default process.cwd() */
  root?: string;
  /** Watch the files and update open pages when they change. @default true */
  livereload?: boolean;
  /** Serve and list dotfiles, such as `.github/`. `.well-known` is always served. @default false */
  dotfiles?: boolean;
  /** The maximum number of rendered pages in memory. @default 500 */
  cacheSize?: number;
  /**
   * The default theme: `github`, `base16:<id>`, `base24:<id>`, `omarchy:<id>`, `omarchy`
   * (the current Omarchy theme, live), a scheme file or a URL. @default "github"
   */
  theme?: string;
  /** The store that loads and caches the themes. Replace it to use another cache or no network. */
  themeStore?: ThemeStore;
  /** The `colors.toml` of the current Omarchy theme. @default ~/.local/state/omarchy/current/theme/colors.toml */
  omarchyPath?: string;
  /**
   * Show an Edit button that opens the file in the editor of the user. Turn it off
   * when other machines can reach the server. @default true
   */
  editor?: boolean;
  /** Replaces the function that opens a file in the editor. */
  openEditor?: OpenEditor;
}

export interface ComarkservHandler {
  /** The absolute path of the served directory. */
  readonly root: string;
  /** The request handler. Give it to srvx, or to any server that uses web `Request` and `Response`. */
  fetch: (request: Request) => Promise<Response>;
  /** Loads the markdown renderer before the first request needs it. */
  warmup: () => Promise<void>;
  /** Stops the file watcher and closes the live reload streams. */
  close: () => Promise<void>;
}

type Encoding = "br" | "gzip";

interface Body {
  text: string;
  type: string;
  etag: string;
  encoded: Map<Encoding, Promise<Uint8Array>>;
}

interface Timed {
  rendered: RenderedMarkdown;
  ms: number;
  /** The source line of each heading, by heading id, for the Edit button. */
  lines: Record<string, number>;
}

const HTML = "text/html; charset=utf-8";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MIN_COMPRESS_SIZE = 1024;
const IMMUTABLE = "public, max-age=31536000, immutable";

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

class Lru<V> {
  private readonly map = new Map<string, V>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value ?? "");
  }

  delete(key: string): void {
    this.map.delete(key);
  }
}

function makeBody(text: string, type: string, etag?: string): Body {
  const tag = etag ?? createHash("sha1").update(text).digest("base64url").slice(0, 16);
  return { text, type, etag: `W/"${tag}"`, encoded: new Map() };
}

function negotiate(header: string | null): Encoding | undefined {
  if (!header) return undefined;
  const accepted = new Set<string>();
  for (const part of header.toLowerCase().split(",")) {
    const [name = "", ...params] = part.trim().split(";");
    const quality = params.find((param) => param.trim().startsWith("q="));
    if (quality && Number(quality.trim().slice(2)) === 0) continue;
    accepted.add(name.trim());
  }
  if (accepted.has("br")) return "br";
  if (accepted.has("gzip")) return "gzip";
  return undefined;
}

async function compress(text: string, encoding: Encoding): Promise<Uint8Array> {
  const data =
    encoding === "br"
      ? await brotli(text, {
          params: {
            [zlib.BROTLI_PARAM_QUALITY]: 5,
            [zlib.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(text),
          },
        })
      : await gzipAsync(text, { level: 6 });
  return new Uint8Array(data);
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const weak = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some((tag) => tag.trim() === "*" || weak(tag) === weak(etag));
}

async function respond(
  request: Request,
  body: Body,
  init: { status?: number; headers?: Record<string, string> } = {},
): Promise<Response> {
  const status = init.status ?? 200;
  const headers = new Headers({
    "content-type": body.type,
    "cache-control": "no-cache",
    etag: body.etag,
    ...init.headers,
  });
  if (status === 200 && etagMatches(request.headers.get("if-none-match"), body.etag)) {
    return new Response(null, { status: 304, headers });
  }
  const compressible = body.text.length >= MIN_COMPRESS_SIZE;
  if (compressible) headers.set("vary", "accept-encoding");
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const encoding = compressible ? negotiate(request.headers.get("accept-encoding")) : undefined;
  if (!encoding) return new Response(body.text, { status, headers });
  let data = body.encoded.get(encoding);
  if (!data) {
    data = compress(body.text, encoding);
    body.encoded.set(encoding, data);
  }
  headers.set("content-encoding", encoding);
  return new Response((await data) as Uint8Array<ArrayBuffer>, { status, headers });
}

function timing(ms: number, cached: boolean): string {
  return `render;dur=${ms.toFixed(2)}${cached ? ', cache;desc="hit"' : ""}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export function createHandler(options: ComarkservOptions = {}): ComarkservHandler {
  const root = resolve(options.root ?? process.cwd());
  const rootName = basename(root) || root;
  const livereload = options.livereload ?? true;
  const editor = options.editor ?? true;
  // launch-editor loads on the first request that needs it.
  const openEditor: OpenEditor =
    options.openEditor ??
    (async (file, line) => (await import("./editor.ts")).openInEditor(file, line));
  const dotfiles = options.dotfiles ?? false;
  // Comark takes about 40 ms to import, so it loads after the server starts, not before.
  let renderer: Promise<MarkdownRenderer> | undefined;
  const getRenderer = () =>
    (renderer ??= import("./markdown.ts").then((module) => module.createMarkdownRenderer(options)));
  const renders = new Lru<{ stamp: string; result: Promise<Timed> }>(options.cacheSize ?? 500);
  const pages = new Lru<{ stamp: string; body: Body; ms: number }>(options.cacheSize ?? 500);
  const search = createSearchIndex({ root, dotfiles });
  const serverId = randomUUID();
  const streams = new Set<() => void>();
  const themes = createThemeService({
    spec: options.theme ?? "github",
    store: options.themeStore ?? createThemeStore({ omarchyPath: options.omarchyPath }),
    prefix: `${INTERNAL_PREFIX}themes/`,
    watch: livereload,
    omarchyPath: options.omarchyPath,
  });

  const assets = getAssets();
  const assetBodies = {
    "app.css": makeBody(assets["app.css"].body, assets["app.css"].type, assets["app.css"].version),
    "app.js": makeBody(assets["app.js"].body, assets["app.js"].type, assets["app.js"].version),
  };
  const pageAssets: PageAssets = {
    css: `${INTERNAL_PREFIX}app.css?v=${assets["app.css"].version}`,
    js: `${INTERNAL_PREFIX}app.js?v=${assets["app.js"].version}`,
    katex: `${INTERNAL_PREFIX}katex/katex.min.css?v=${assets.katexVersion}`,
  };
  const config = (
    source: string,
    kind: ClientConfig["kind"],
    lines?: Record<string, number>,
  ): ClientConfig => ({
    root: "/",
    search: `${INTERNAL_PREFIX}search.json`,
    events: livereload ? `${INTERNAL_PREFIX}events` : "",
    themes: `${INTERNAL_PREFIX}themes/catalog.json`,
    edit: editor ? `${INTERNAL_PREFIX}edit` : "",
    source,
    kind,
    ...(lines ? { lines } : {}),
  });
  const page = async (input: Omit<PageInput, "assets" | "theme">) =>
    renderPage({ ...input, assets: pageAssets, theme: await themes.current() });

  const watcher = livereload
    ? watchTree(root, { ignore: (path) => isSkippedPath(path, dotfiles) })
    : undefined;
  watcher?.subscribe((paths) => {
    search.invalidate(paths);
    for (const path of paths) {
      renders.delete(join(root, path));
      pages.delete(path);
      pages.delete(path.slice(0, path.lastIndexOf("/") + 1));
    }
  });

  const serveStatic = staticMiddleware({
    dir: root,
    dotfiles: dotfiles ? true : [".well-known"],
    renderHTML: livereload
      ? ({ request, html }) => {
          const source = decodeURIComponent(new URL(request.url).pathname);
          const injected = injectClient(html, config(source, "html"), pageAssets);
          return new Response(injected, { headers: { "content-type": HTML } });
        }
      : undefined,
  });

  const serveKatex = staticMiddleware({
    dir: assets.katexDir,
    maxAge: 31_536_000,
    immutable: true,
    dotfiles: false,
  });

  const renderFile = (path: string, info: Stats): Promise<Timed> => {
    const stamp = `${info.mtimeMs}:${info.size}`;
    const cached = renders.get(path);
    if (cached?.stamp === stamp) return cached.result;
    const result = (async () => {
      const started = performance.now();
      const [render, source] = await Promise.all([getRenderer(), readFile(path, "utf8")]);
      const rendered = await render(source);
      const lines = Object.fromEntries(
        extractOutline(source).headings.map((heading) => [heading.id, heading.line]),
      );
      return { rendered, ms: performance.now() - started, lines };
    })();
    renders.set(path, { stamp, result });
    result.catch(() => renders.delete(path));
    return result;
  };

  const notFound = async (request: Request, pathname: string) =>
    respond(
      request,
      makeBody(
        await page({
          title: "Not found",
          content: renderStatus(404, "Not found", `There is no file at ${pathname}.`),
          crumbs: crumbsFor(pathname, rootName),
          config: config(pathname, "status"),
        }),
        HTML,
      ),
      { status: 404 },
    );

  const failure = async (request: Request, pathname: string, error: unknown, source = pathname) =>
    respond(
      request,
      makeBody(
        await page({
          title: "Render error",
          content: renderStatus(
            500,
            "Render error",
            `comarkserv could not render ${pathname}.`,
            errorText(error),
          ),
          crumbs: crumbsFor(pathname, rootName),
          config: config(source, "markdown"),
        }),
        HTML,
      ),
      { status: 500 },
    );

  const markdownPage = async (
    request: Request,
    pathname: string,
    path: string,
    info: Stats,
    source: string,
  ): Promise<Response> => {
    const stamp = `${info.mtimeMs}:${info.size}:${themes.version()}`;
    const cached = pages.get(pathname);
    if (cached?.stamp === stamp) {
      return respond(request, cached.body, {
        headers: { "server-timing": timing(cached.ms, true) },
      });
    }
    let timed: Timed;
    try {
      timed = await renderFile(path, info);
    } catch (error) {
      return failure(request, pathname, error, source);
    }
    const { rendered, ms } = timed;
    const html = await page({
      title: rendered.title ?? basename(path),
      description: rendered.description,
      content: rendered.html,
      toc: rendered.toc,
      crumbs: crumbsFor(pathname, rootName),
      features: rendered.features,
      rawHref: `${encodeURI(source)}?raw`,
      footer: `rendered in ${ms.toFixed(1)} ms`,
      config: config(source, "markdown", timed.lines),
    });
    const body = makeBody(html, HTML);
    pages.set(pathname, { stamp, body, ms });
    return respond(request, body, { headers: { "server-timing": timing(ms, false) } });
  };

  const directoryPage = async (
    request: Request,
    pathname: string,
    path: string,
  ): Promise<Response> => {
    const started = performance.now();
    const directory = await readDirectory(path, { dotfiles, links: serverLinks });
    const names = new Set(directory.entries.map((entry) => entry.name));
    if (names.has("index.html")) return serveStatic(request, () => notFound(request, pathname));
    if (names.has("index.md")) {
      const index = join(path, "index.md");
      return markdownPage(request, pathname, index, await stat(index), `${pathname}index.md`);
    }
    let content = renderListing(directory.entries, pathname === "/" ? undefined : "../");
    let readme: RenderedMarkdown | undefined;
    if (directory.readme) {
      const readmePath = join(path, directory.readme);
      try {
        readme = (await renderFile(readmePath, await stat(readmePath))).rendered;
        content += renderReadme(directory.readme, readme.html);
      } catch (error) {
        content += renderStatus(
          500,
          "Render error",
          `comarkserv could not render ${directory.readme}.`,
          errorText(error),
        );
      }
    }
    const ms = performance.now() - started;
    const count = directory.entries.length;
    const html = await page({
      title: pathname === "/" ? rootName : pathname.slice(1),
      content,
      contentClass: "cms-directory",
      toc: readme?.toc,
      crumbs: crumbsFor(pathname, rootName),
      features: readme?.features,
      footer: `${count} ${count === 1 ? "item" : "items"} · rendered in ${ms.toFixed(1)} ms`,
      config: config(pathname, "directory"),
    });
    return respond(request, makeBody(html, HTML), {
      headers: { "server-timing": timing(ms, false) },
    });
  };

  const events = (request: Request): Response => {
    if (!watcher) return new Response("Live reload is off", { status: 404 });
    const encoder = new TextEncoder();
    let close = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            close();
          }
        };
        const unsubscribe = watcher.subscribe((paths) => {
          send(`event: change\ndata: ${JSON.stringify({ paths })}\n\n`);
        });
        const unsubscribeTheme = themes.subscribe((theme) => {
          send(`event: theme\ndata: ${JSON.stringify({ theme })}\n\n`);
        });
        const ping = setInterval(() => send(": ping\n\n"), 25_000);
        close = () => {
          clearInterval(ping);
          unsubscribe();
          unsubscribeTheme();
          streams.delete(close);
          try {
            controller.close();
          } catch {
            // The stream is already closed.
          }
        };
        streams.add(close);
        request.signal.addEventListener("abort", () => close(), { once: true });
        send(`retry: 1000\nevent: hello\ndata: ${JSON.stringify({ id: serverId })}\n\n`);
      },
      cancel() {
        close();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-accel-buffering": "no",
      },
    });
  };

  // Opens a file in the editor. A web page from another site must not do this, so
  // the request must come to a local host name (against DNS rebinding), from this
  // origin, with a custom header (a cross-origin request with it needs a preflight,
  // and the server answers no preflight).
  const edit = async (request: Request): Promise<Response> => {
    if (!editor) return new Response("Not found", { status: 404 });
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
    }
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (
      !LOOPBACK_HOSTS.has(url.hostname) ||
      (origin !== null && origin !== url.origin) ||
      request.headers.get("x-comarkserv-edit") !== "1"
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { path?: unknown; line?: unknown };
    const pathname = typeof body.path === "string" ? body.path : "";
    const visible =
      pathname.startsWith("/") &&
      !pathname.includes("\0") &&
      (dotfiles || !hasHiddenSegment(pathname));
    const path = resolve(root, `.${pathname}`);
    const inside = path === root || path.startsWith(root + sep);
    const info = visible && inside ? await stat(path).catch(() => undefined) : undefined;
    if (!info?.isFile()) return new Response("Not found", { status: 404 });
    const line =
      typeof body.line === "number" && Number.isInteger(body.line) && body.line > 0
        ? body.line
        : undefined;
    try {
      await openEditor(path, line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message }, { status: 500 });
    }
    return new Response(null, { status: 204 });
  };

  const internal = async (request: Request, name: string): Promise<Response> => {
    if (name === "app.css" || name === "app.js") {
      return respond(request, assetBodies[name], { headers: { "cache-control": IMMUTABLE } });
    }
    if (name === "search.json") {
      return Response.json(await search.get(), { headers: { "cache-control": "no-cache" } });
    }
    if (name === "events") return events(request);
    if (name.startsWith("themes/")) return themes.handle(request, name.slice("themes/".length));
    if (name.startsWith("katex/")) {
      const url = new URL(request.url);
      url.pathname = `/${name.slice("katex/".length)}`;
      return serveKatex(
        new Request(url, request),
        () => new Response("Not found", { status: 404 }),
      );
    }
    return new Response("Not found", { status: 404 });
  };

  const handle = async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname === `${INTERNAL_PREFIX}edit`) return edit(request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const url = new URL(request.url);
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (pathname.startsWith(INTERNAL_PREFIX))
      return internal(request, pathname.slice(INTERNAL_PREFIX.length));
    if (pathname.includes("\0") || (!dotfiles && hasHiddenSegment(pathname))) {
      return notFound(request, pathname);
    }
    const path = resolve(root, `.${pathname}`);
    if (path !== root && !path.startsWith(root + sep)) return notFound(request, pathname);
    const info = await stat(path).catch(() => undefined);
    if (!info) return notFound(request, pathname);
    if (info.isDirectory()) {
      if (!pathname.endsWith("/")) {
        return new Response(null, {
          status: 301,
          headers: { location: `${url.pathname}/${url.search}` },
        });
      }
      return directoryPage(request, pathname, path);
    }
    if (!info.isFile()) return notFound(request, pathname);
    if (isMarkdown(path)) {
      if (url.searchParams.has("raw")) {
        const source = await readFile(path, "utf8");
        return respond(request, makeBody(source, "text/plain; charset=utf-8"));
      }
      return markdownPage(request, pathname, path, info, pathname);
    }
    return serveStatic(request, () => notFound(request, pathname));
  };

  return {
    root,
    warmup: async () => {
      await Promise.all([getRenderer(), themes.current()]);
    },
    fetch: async (request) => {
      try {
        return await handle(request);
      } catch (error) {
        const pathname = new URL(request.url).pathname;
        return failure(request, pathname, error);
      }
    },
    close: async () => {
      await Promise.all([watcher?.close(), themes.close()]);
      for (const close of streams) close();
    },
  };
}

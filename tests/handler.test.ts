import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { createHandler } from "../src/handler.ts";
import type { ComarkservHandler } from "../src/handler.ts";
import { createFixture, sampleFiles } from "./fixture.ts";
import type { Fixture } from "./fixture.ts";

let fixture: Fixture;
let app: ComarkservHandler;

const get = (path: string, headers?: Record<string, string>) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

beforeAll(async () => {
  fixture = await createFixture(sampleFiles);
  app = createHandler({ root: fixture.root, livereload: false });
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

describe("markdown pages", () => {
  test("renders a markdown file as a full page", async () => {
    const response = await get("/guide.md");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await response.text();
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>The Guide</title>");
    expect(html).toContain('<span class="tok keyword">const</span>');
    expect(html).toContain('href="#install"');
    expect(html).toContain("/__comarkserv/app.css?v=");
  });

  test("renders other markdown extensions", async () => {
    const response = await get("/docs/notes.markdown");
    expect(await response.text()).toContain("<title>Notes</title>");
  });

  test("returns the source for ?raw", async () => {
    const response = await get("/guide.md?raw");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe(sampleFiles["guide.md"]);
  });

  test("returns 304 when the ETag matches", async () => {
    const first = await get("/guide.md");
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const second = await get("/guide.md", { "if-none-match": etag ?? "" });
    expect(second.status).toBe(304);
  });

  test("renders the new content after the file changes", async () => {
    await fixture.write("changing.md", "# First\n");
    expect(await (await get("/changing.md")).text()).toContain("First");
    await fixture.write("changing.md", "# Second version\n");
    expect(await (await get("/changing.md")).text()).toContain("Second version");
  });

  test("sends a Server-Timing header", async () => {
    const response = await get("/guide.md");
    expect(response.headers.get("server-timing")).toMatch(/render;dur=/);
  });

  test("compresses a large page when the client accepts it", async () => {
    const response = await get("/big.md", { "accept-encoding": "br, gzip" });
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("vary")).toBe("accept-encoding");
    const body = brotliDecompressSync(Buffer.from(await response.arrayBuffer())).toString();
    expect(body).toContain("Some paragraph text");
  });

  test("shows the render error in the page when a file cannot render", async () => {
    // A code fence with an incorrect line range renders as an error block, not a crash.
    await fixture.write("broken.md", "```ts {7}\nconst a = 1\n```\n");
    const response = await get("/broken.md");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("cms-code-error");
  });
});

describe("directories", () => {
  test("lists a directory and renders its README", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('href="docs/"');
    expect(html).toContain('href="guide.md"');
    expect(html).toContain("Read me first.");
    expect(html).not.toContain(".env");
    expect(html).not.toContain(".hidden");
  });

  test("lists directories before files", async () => {
    const html = await (await get("/")).text();
    expect(html.indexOf('href="docs/"')).toBeLessThan(html.indexOf('href="guide.md"'));
  });

  test("redirects a directory path with no trailing slash", async () => {
    const response = await get("/docs?x=1");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/docs/?x=1");
  });

  test("renders index.md as the directory page", async () => {
    const html = await (await get("/site/")).text();
    expect(html).toContain("Site home");
    expect(html).not.toContain("cms-listing");
  });

  test("serves index.html for a directory that has one", async () => {
    expect(await (await get("/static/")).text()).toContain("static");
  });
});

describe("static files", () => {
  test("serves a file with validators", async () => {
    const response = await get("/style.css");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    expect(await response.text()).toBe(sampleFiles["style.css"]);
    const etag = response.headers.get("etag") ?? "";
    expect((await get("/style.css", { "if-none-match": etag })).status).toBe(304);
  });
});

describe("safety", () => {
  test("returns 404 for a missing file", async () => {
    const response = await get("/missing.md");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Not found");
  });

  test("does not serve dotfiles", async () => {
    expect((await get("/.env")).status).toBe(404);
    expect((await get("/.hidden/secret.md")).status).toBe(404);
  });

  test("does not serve files outside the root", async () => {
    for (const path of [
      "/%2e%2e/%2e%2e/etc/passwd",
      "/..%2f..%2fetc%2fpasswd",
      "/docs/%2e%2e%2f%2e%2e%2f",
    ]) {
      const response = await get(path);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await response.text()).not.toContain("root:");
    }
  });

  test("rejects methods other than GET and HEAD", async () => {
    const response = await app.fetch(new Request("http://localhost/guide.md", { method: "POST" }));
    expect(response.status).toBe(405);
  });

  test("answers HEAD with no body", async () => {
    const response = await app.fetch(new Request("http://localhost/guide.md", { method: "HEAD" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});

describe("internal endpoints", () => {
  test("serves the stylesheet and the script with long caching", async () => {
    for (const path of ["/__comarkserv/app.css", "/__comarkserv/app.js"]) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("immutable");
    }
  });

  test("serves the KaTeX stylesheet and fonts", async () => {
    const css = await get("/__comarkserv/katex/katex.min.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("cache-control")).toContain("immutable");
    expect(await css.text()).toContain(".katex");
    const font = await get("/__comarkserv/katex/fonts/KaTeX_Main-Regular.woff2");
    expect(font.status).toBe(200);
    expect((await font.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect((await get("/__comarkserv/katex/..%2f..%2fpackage.json")).status).toBe(404);
  });

  test("returns a search index with titles and heading ids", async () => {
    const response = await get("/__comarkserv/search.json");
    const entries = (await response.json()) as {
      url: string;
      title: string;
      headings: { id: string }[];
    }[];
    const guide = entries.find((entry) => entry.url === "/guide.md");
    expect(guide?.title).toBe("The Guide");
    expect(guide?.headings.map((heading) => heading.id)).toEqual([
      "guide",
      "install",
      "install-deep-dive",
    ]);
    const api = entries.find((entry) => entry.url === "/docs/api.md");
    expect(api?.headings.map((heading) => heading.id)).toEqual([
      "api",
      "createhandler",
      "createhandler-1",
    ]);
    expect(entries.some((entry) => entry.url.includes("node_modules"))).toBe(false);
    expect(entries.some((entry) => entry.url.includes(".hidden"))).toBe(false);
  });

  test("returns 404 for the event stream when live reload is off", async () => {
    expect((await get("/__comarkserv/events")).status).toBe(404);
  });
});

describe("themes", () => {
  const nordYaml = `name: "Nord"\nvariant: "dark"\npalette:\n${Array.from({ length: 16 }, (_, i) => `  base0${i.toString(16).toUpperCase()}: "#2e3440"`).join("\n")}\n`;

  test("puts the default theme in the head of each page", async () => {
    await fixture.write("nord.yaml", nordYaml);
    const themed = createHandler({
      root: fixture.root,
      livereload: false,
      theme: join(fixture.root, "nord.yaml"),
    });
    try {
      const html = await (await themed.fetch(new Request("http://localhost/guide.md"))).text();
      const head = html.slice(0, html.indexOf("</head>"));
      expect(head).toContain('"id":"file:nord.yaml"');
      expect(head).toContain('"colors":["#2e3440"');
    } finally {
      await themed.close();
    }
  });

  test("puts no theme in the page for the GitHub theme", async () => {
    const html = await (await get("/guide.md")).text();
    expect(html).toContain("})(null);</script>");
  });

  test("gives the catalog URL to the client and answers the theme endpoints", async () => {
    const html = await (await get("/guide.md")).text();
    expect(html).toContain('"themes":"/__comarkserv/themes/catalog.json"');
    expect((await get("/__comarkserv/themes/raw/evil/x")).status).toBe(404);
  });

  test("serves a stylesheet that maps the palette slots", async () => {
    const css = await (await get("/__comarkserv/app.css")).text();
    expect(css).toContain(":root[data-cms-palette]");
    expect(css).toContain("--twp-keyword: var(--b0E);");
  });
});

describe("live reload", () => {
  test("injects the client into static HTML pages only when live reload is on", async () => {
    expect(await (await get("/static/index.html")).text()).not.toContain("__comarkserv");
    const live = createHandler({ root: fixture.root });
    try {
      const response = await live.fetch(new Request("http://localhost/static/index.html"));
      expect(await response.text()).toContain("/__comarkserv/app.js");
    } finally {
      await live.close();
    }
  });

  test("sends a theme event when the theme file changes", async () => {
    const scheme = (color: string) =>
      `name: "Live"\nvariant: "dark"\npalette:\n${Array.from({ length: 16 }, (_, i) => `  base0${i.toString(16).toUpperCase()}: "${color}"`).join("\n")}\n`;
    await fixture.write("live-theme.yaml", scheme("#111111"));
    const live = createHandler({
      root: fixture.root,
      theme: join(fixture.root, "live-theme.yaml"),
    });
    try {
      const response = await live.fetch(new Request("http://localhost/__comarkserv/events"));
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let text = "";
      while (!text.includes("event: hello")) text += (await reader.read()).value ?? "";
      await new Promise((resolve) => setTimeout(resolve, 150));
      await fixture.write("live-theme.yaml", scheme("#222222"));
      while (!text.includes("event: theme")) text += (await reader.read()).value ?? "";
      expect(text).toContain('"colors":["#222222"');
      await reader.cancel();
      const html = await (await live.fetch(new Request("http://localhost/guide.md"))).text();
      expect(html).toContain('"colors":["#222222"');
    } finally {
      await live.close();
    }
  });

  test("sends a change event when a file changes", async () => {
    const live = createHandler({ root: fixture.root });
    try {
      const response = await live.fetch(new Request("http://localhost/__comarkserv/events"));
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let text = "";
      while (!text.includes("event: hello")) text += (await reader.read()).value ?? "";
      // Give the file watcher time to start before the change.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fixture.write("docs/api.md", "# API\n\nChanged.\n");
      while (!text.includes("event: change")) text += (await reader.read()).value ?? "";
      expect(text).toContain("/docs/api.md");
      await reader.cancel();
    } finally {
      await live.close();
    }
  });
});

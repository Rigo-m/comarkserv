import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { build } from "../src/build.ts";
import type { BuildResult } from "../src/build.ts";
import { createFixture, sampleFiles } from "./fixture.ts";
import type { Fixture } from "./fixture.ts";

let fixture: Fixture;
let out: string;
let result: BuildResult;
const read = (path: string) => readFile(join(out, path), "utf8");

beforeAll(async () => {
  fixture = await createFixture({
    ...sampleFiles,
    "links.md":
      "[api](docs/api.md#x) [dir](docs/) [abs](/guide.md) [web](https://e.com/a.md) [top](#t)\n",
    "math.md": "$$\na^2\n$$\n",
  });
  out = join(fixture.root, "_site");
  result = await build({ root: fixture.root, outDir: out });
});

afterAll(() => fixture.cleanup());

describe("build", () => {
  test("renders each markdown file to an HTML file", async () => {
    const html = await read("guide.html");
    expect(html).toContain("<title>The Guide</title>");
    expect(html).toContain('<span class="tok keyword">const</span>');
    expect(await read("docs/notes.html")).toContain("<title>Notes</title>");
    expect(result.pages).toBeGreaterThanOrEqual(8);
  });

  test("uses relative asset URLs with no live reload", async () => {
    const html = await read("docs/api.html");
    expect(html).toContain('href="../_comarkserv/app.css?v=');
    expect(html).toContain('"events":""');
    expect(html).not.toContain("/__comarkserv/");
  });

  test("changes markdown links to HTML links", async () => {
    const html = await read("links.html");
    expect(html).toContain('href="docs/api.html#x"');
    expect(html).toContain('href="docs/index.html"');
    expect(html).toContain('href="guide.html"');
    expect(html).toContain('href="https://e.com/a.md"');
    expect(html).toContain('href="#t"');
  });

  test("writes a listing page with the README for a directory", async () => {
    const html = await read("index.html");
    expect(html).toContain('href="docs/index.html"');
    expect(html).toContain('href="guide.html"');
    expect(html).toContain("Read me first.");
    expect(await read("docs/index.html")).toContain('href="api.html"');
  });

  test("renders index.md as the directory page", async () => {
    expect(await read("site/index.html")).toContain("Site home");
  });

  test("copies other files and keeps HTML files as they are", async () => {
    expect(await read("style.css")).toBe(sampleFiles["style.css"]);
    expect(await read("static/index.html")).toBe(sampleFiles["static/index.html"]);
  });

  test("skips dotfiles, node_modules and the output directory", () => {
    expect(existsSync(join(out, ".env"))).toBe(false);
    expect(existsSync(join(out, ".hidden"))).toBe(false);
    expect(existsSync(join(out, "node_modules"))).toBe(false);
    expect(existsSync(join(out, "_site"))).toBe(false);
  });

  test("writes the assets and a search index with HTML URLs", async () => {
    expect(await read("_comarkserv/app.css")).toContain(".cms-bar");
    expect(await read("_comarkserv/app.js")).toContain("cms-config");
    const entries = JSON.parse(await read("_comarkserv/search.json")) as { url: string }[];
    expect(entries.map((entry) => entry.url)).toContain("/docs/api.html");
  });

  test("copies KaTeX when a page has math", async () => {
    expect(await read("_comarkserv/katex/katex.min.css")).toContain(".katex");
    expect(existsSync(join(out, "_comarkserv/katex/fonts/KaTeX_Main-Regular.woff2"))).toBe(true);
    expect(await read("math.html")).toContain('href="_comarkserv/katex/katex.min.css?v=');
  });

  test("replaces an earlier build", async () => {
    await writeFile(join(out, "stale.html"), "old");
    await build({ root: fixture.root, outDir: out });
    expect(existsSync(join(out, "stale.html"))).toBe(false);
  });

  test("does not write to a directory that has other files", async () => {
    const other = join(fixture.root, "_other");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "keep.txt"), "keep");
    await expect(build({ root: fixture.root, outDir: other })).rejects.toThrow(/not empty/);
    expect(await readFile(join(other, "keep.txt"), "utf8")).toBe("keep");
  });

  test("does not write to the root or to a parent of the root", async () => {
    await expect(build({ root: fixture.root, outDir: fixture.root })).rejects.toThrow(/root/);
    await expect(build({ root: fixture.root, outDir: join(fixture.root, "..") })).rejects.toThrow(
      /root/,
    );
  });
});

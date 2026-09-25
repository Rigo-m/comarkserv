import { Script } from "node:vm";
import { createMarkdownParser } from "comark";
import type { Node } from "comark";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { clientScript } from "../src/client.ts";
import { createSearchIndex, extractOutline } from "../src/search.ts";
import { createFixture } from "./fixture.ts";
import type { Fixture } from "./fixture.ts";

function comarkHeadingIds(nodes: Node[]): string[] {
  const ids: string[] = [];
  const walk = (node: Node) => {
    if (!Array.isArray(node) || typeof node[0] !== "string") return;
    if (/^h[1-6]$/.test(node[0]) && typeof node[1].id === "string") ids.push(node[1].id);
    for (const child of node.slice(2)) walk(child as Node);
  };
  nodes.forEach(walk);
  return ids;
}

describe("extractOutline", () => {
  test("makes the same heading ids as Comark", async () => {
    const source = [
      "# Title",
      "## Getting started",
      "### Install `pnpm` now",
      "## Getting started",
      "### Deep **dive** and [a link](./x.md)",
      "#### Four",
      "## 2 numbers",
      "Setext heading",
      "--------------",
      "```md",
      "# Not a heading",
      "```",
      "## Custom {#my-id}",
      "## snake_case and *emphasis*",
      "",
    ].join("\n\n");
    const doc = await createMarkdownParser()(source);
    expect(extractOutline(source).headings.map((heading) => heading.id)).toEqual(
      comarkHeadingIds(doc.nodes),
    );
  });

  test("records the source line of each heading, after the frontmatter", () => {
    const source = "---\ntitle: T\n---\n# One\n\ntext\n\n## Two\n\nSetext\n------\n";
    expect(extractOutline(source).headings.map((heading) => [heading.text, heading.line])).toEqual([
      ["One", 4],
      ["Two", 8],
      ["Setext", 10],
    ]);
  });

  test("takes the title from the frontmatter, then from the first h1", () => {
    expect(extractOutline("---\ntitle: 'Quoted'\n---\n# H1\n").title).toBe("Quoted");
    expect(extractOutline("Intro\n\n# The *title*\n").title).toBe("The title");
    expect(extractOutline("No heading\n").title).toBeUndefined();
  });
});

describe("createSearchIndex", () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await createFixture({ "a.md": "# Alpha\n", "sub/b.md": "# Beta\n", "c.txt": "x" });
  });
  afterAll(() => fixture.cleanup());

  test("lists the markdown files with their titles", async () => {
    const index = createSearchIndex({ root: fixture.root, dotfiles: false });
    expect((await index.get()).map((entry) => [entry.url, entry.title])).toEqual([
      ["/a.md", "Alpha"],
      ["/sub/b.md", "Beta"],
    ]);
  });

  test("reads changed and new files again after invalidate", async () => {
    const index = createSearchIndex({ root: fixture.root, dotfiles: false });
    await index.get();
    await fixture.write("a.md", "# Alpha two\n");
    await fixture.write("new.md", "# New\n");
    index.invalidate(["/a.md", "/new.md"]);
    const titles = (await index.get()).map((entry) => entry.title);
    expect(titles).toEqual(["Alpha two", "New", "Beta"]);
  });

  test("uses toUrl for the page URLs", async () => {
    const index = createSearchIndex({
      root: fixture.root,
      dotfiles: false,
      toUrl: (path) => path.replace(/\.md$/, ".html"),
    });
    expect((await index.get()).map((entry) => entry.url)).toContain("/sub/b.html");
  });
});

describe("clientScript", () => {
  test("is valid JavaScript", () => {
    expect(() => new Script(clientScript)).not.toThrow();
  });
});

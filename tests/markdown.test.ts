import { describe, expect, test } from "vite-plus/test";
import { createMarkdownRenderer } from "../src/markdown.ts";

const render = createMarkdownRenderer();

describe("createMarkdownRenderer", () => {
  test("renders GFM", async () => {
    const { html } = await render("| a |\n|---|\n| 1 |\n\n- [x] done\n\n~~old~~\n");
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<del>old</del>");
  });

  test("keeps raw HTML", async () => {
    const { html } = await render("Press <kbd>Ctrl</kbd>.");
    expect(html).toContain("<kbd>Ctrl</kbd>");
  });

  test("takes the title from the frontmatter first", async () => {
    const result = await render("---\ntitle: From FM\ndescription: Desc\n---\n# From H1\n");
    expect(result.title).toBe("From FM");
    expect(result.description).toBe("Desc");
    expect(result.frontmatter).toMatchObject({ title: "From FM" });
  });

  test("takes the title from the first h1 when the frontmatter has none", async () => {
    expect((await render("Intro\n\n# The **Title**\n\n# Second\n")).title).toBe("The Title");
    expect((await render("No heading\n")).title).toBeUndefined();
  });

  test("returns a table of contents for h2 and h3", async () => {
    const { toc } = await render("# T\n\n## A\n\n### A1\n\n#### Deep\n\n## B\n");
    expect(toc).toEqual([
      { id: "a", text: "A", depth: 2, children: [{ id: "a-a1", text: "A1", depth: 3 }] },
      { id: "b", text: "B", depth: 2 },
    ]);
  });

  test("renders emoji and footnotes", async () => {
    const { html } = await render("Go :rocket:[^1]\n\n[^1]: Note.\n");
    expect(html).toContain("🚀");
    expect(html).toContain('class="footnotes"');
  });

  test("highlights code blocks", async () => {
    const { html } = await render("```ts\nconst a = 1\n```\n");
    expect(html).toContain('<span class="tok keyword">const</span>');
  });

  test("rewrites links with transformLink", async () => {
    const renderStatic = createMarkdownRenderer({
      transformLink: (href) => href.replace(/\.md(#|$)/, ".html$1"),
    });
    const { html } = await renderStatic("[a](./b.md#x) [c](https://e.com/c.md)");
    expect(html).toContain('href="./b.html#x"');
    expect(html).toContain('href="https://e.com/c.html"');
  });
});

describe("alerts", () => {
  test("renders GitHub alerts", async () => {
    const { html } = await render("> [!WARNING]\n> Be **careful**.\n");
    expect(html).toContain('class="cms-alert cms-alert-warning"');
    expect(html).toContain('<p class="cms-alert-title">');
    expect(html).toContain("Warning</p>");
    expect(html).toContain("<p>Be <strong>careful</strong>.</p>");
  });

  test("leaves a normal blockquote as it is", async () => {
    const { html } = await render("> Just a quote.\n");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("cms-alert");
  });

  test("renders Comark alert components", async () => {
    const tip = await render("::tip\nUse this.\n::\n");
    expect(tip.html).toContain('class="cms-alert cms-alert-tip"');
    const custom = await render('::callout{title="Heads up"}\nText.\n::\n');
    expect(custom.html).toContain('class="cms-alert cms-alert-note"');
    expect(custom.html).toContain("Heads up</p>");
    const typed = await render('::alert{type="danger"}\nNo.\n::\n');
    expect(typed.html).toContain('class="cms-alert cms-alert-caution"');
  });
});

describe("components", () => {
  test("renders a code group as tabs", async () => {
    const md = "::code-group\n```bash [pnpm]\npnpm i\n```\n```bash [npm]\nnpm i\n```\n::\n";
    const { html } = await render(md);
    expect(html).toContain('class="cms-code-group"');
    expect(html).toContain('<button role="tab" aria-selected="true">pnpm</button>');
    expect(html).toContain('<button role="tab" aria-selected="false">npm</button>');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
  });

  test("renders details", async () => {
    const { html } = await render('::details{summary="More"}\nHidden.\n::\n');
    expect(html).toContain("<details><summary>More</summary>");
  });
});

describe("math", () => {
  test("renders inline and block math with KaTeX", async () => {
    const result = await render("Inline $a^2$.\n\n$$\nE = mc^2\n$$\n");
    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain("cms-math-block");
    expect(result.features.math).toBe(true);
  });

  test("marks a page with no math", async () => {
    expect((await render("No math.\n")).features.math).toBe(false);
  });
});

describe("mermaid", () => {
  test("renders a diagram to an SVG with no external font", async () => {
    const result = await render("```mermaid\ngraph TD\n  A-->B\n```\n");
    expect(result.html).toContain('<figure class="cms-mermaid"><svg');
    expect(result.html).not.toContain("fonts.googleapis.com");
    expect(result.features.mermaid).toBe(true);
  });

  test("shows an error for a diagram that is not valid", async () => {
    const result = await render("```mermaid\nnot a diagram\n```\n");
    expect(result.html).toContain('class="cms-code-error"');
  });
});

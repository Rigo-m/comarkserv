import { createMarkdownParser } from "comark";
import { renderHtmlFromDocument } from "@comark/html";
import { describe, expect, test } from "vite-plus/test";
import { collectLanguages, createCodeHighlighter } from "../src/highlight.ts";

const parse = createMarkdownParser();

async function render(markdown: string, options?: Parameters<typeof createCodeHighlighter>[0]) {
  const highlighter = createCodeHighlighter(options);
  const doc = await parse(markdown);
  await highlighter.preload(doc.nodes);
  return renderHtmlFromDocument(doc, { components: highlighter.components });
}

const fence = (info: string, code: string) => `\`\`\`${info}\n${code}\n\`\`\`\n`;

describe("code blocks", () => {
  test("highlights a fence with a known language", async () => {
    const html = await render(fence("ts", "const total = 1"));
    expect(html).toContain('class="twinkleplop language-ts"');
    expect(html).toContain('<span class="tok keyword">const</span>');
  });

  test("resolves aliases and ignores case", async () => {
    const html = await render(fence("PY", "def f(): pass"));
    expect(html).toContain('<span class="tok keyword">def</span>');
  });

  test("keeps line highlights and the filename that Comark removes from the meta", async () => {
    const html = await render(fence("ts {2} [math.ts]", "const a = 1\nconst b = 2"));
    expect(html).toContain('<figcaption class="twinkleplop-title">math.ts</figcaption>');
    expect(html.match(/class="l highlight"/g)).toHaveLength(1);
  });

  test("passes other meta to twinkleplop", async () => {
    const html = await render(fence('ts /total/ title="t.ts"', "const total = 1"));
    expect(html).toContain("highlighted-word");
    expect(html).toContain(">t.ts</figcaption>");
  });

  test("shows line numbers when the option is on", async () => {
    const html = await render(fence("ts", "a\nb"), { lineNumbers: true });
    expect(html).toContain('<span class="ln">2</span>');
  });

  test("renders an unknown language as escaped plain text", async () => {
    const html = await render(fence("cobol", "<b>x</b>"));
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  test("renders a fence with no language as escaped plain text", async () => {
    const html = await render(fence("", "<b>x</b>"));
    expect(html).toContain("twinkleplop");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  test("shows an error and the code when the meta is not valid", async () => {
    const html = await render(fence("ts {9}", "const a = 1"));
    expect(html).toContain('class="cms-code-error"');
    expect(html).toContain("line 9");
    expect(html).toContain("const a = 1");
  });

  test("renders an empty fence", async () => {
    const html = await render("```ts\n```\n");
    expect(html).toContain("<pre");
  });
});

describe("inline code", () => {
  test("highlights inline code with a {:lang} suffix", async () => {
    const html = await render("Use `const a = 1{:ts}` here.");
    expect(html).toContain('class="twinkleplop-inline language-ts"');
    expect(html).toContain('<span class="tok keyword">const</span>');
  });

  test("leaves other inline code as it is", async () => {
    const html = await render("Use `a < b` here.");
    expect(html).toContain("<code>a &lt; b</code>");
  });
});

describe("collectLanguages", () => {
  test("finds the fence and inline languages in a document", async () => {
    const doc = await parse(
      `${fence("ts", "a")}\n${fence("py", "b")}\n${fence("cobol", "c")}\n\`x{:rs}\``,
    );
    expect([...collectLanguages(doc.nodes)].sort()).toEqual(["python", "rust", "typescript"]);
  });
});

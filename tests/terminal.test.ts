import { describe, expect, test } from "vite-plus/test";
import { createTerminalRenderer } from "../src/terminal.ts";

const plain = createTerminalRenderer({ colors: false, width: 60 });
const colored = createTerminalRenderer({ colors: true, width: 60 });
const ESC = String.fromCharCode(27);

describe("createTerminalRenderer", () => {
  test("renders headings and text with no escape codes when colors are off", async () => {
    const output = await plain("# Title\n\nSome **bold** text.\n");
    expect(output).toContain("Title");
    expect(output).toContain("bold");
    expect(output).not.toContain(ESC);
  });

  test("prints code blocks with no escape codes when colors are off", async () => {
    const output = await plain("```ts [file.ts]\nconst answer = 42\n```\n");
    expect(output).toContain("ts  file.ts");
    expect(output).toContain("const answer = 42");
    expect(output).not.toContain(ESC);
  });

  test("colors code with the twinkleplop grammars", async () => {
    const output = await colored("```ts\nconst answer = 42\n```\n");
    // The keyword color of the GitHub dark theme, as a true color code.
    expect(output).toContain(`${ESC}[38;2;255;123;114mconst`);
    expect(output).toContain("answer");
  });

  test("shows code in a language with no grammar as plain text", async () => {
    const output = await colored("```cobol\nDISPLAY 'HI'.\n```\n");
    expect(output).toContain("DISPLAY 'HI'.");
  });

  test("renders alert components and GitHub alerts", async () => {
    expect(await plain("::tip\nUse this.\n::\n")).toMatch(/TIP[\s\S]*Use this\./);
    expect(await plain("> [!WARNING]\n> Careful.\n")).toMatch(/WARNING[\s\S]*Careful\./);
  });

  test("renders each tab of a code group with its label", async () => {
    const output = await plain(
      "::code-group\n```bash [pnpm]\npnpm i\n```\n```bash [npm]\nnpm i\n```\n::\n",
    );
    expect(output).toContain("pnpm");
    expect(output).toContain("npm i");
    expect(output).not.toContain("::code-group");
  });

  test("renders details, emoji and inline code with a language", async () => {
    const output = await plain(
      '::details{summary="More"}\nHidden.\n::\n\nGo :rocket: with `const a = 1{:ts}`.\n',
    );
    expect(output).toContain("More");
    expect(output).toContain("Hidden.");
    expect(output).toContain("🚀");
    expect(output).toContain("const a = 1");
    expect(output).not.toContain("{:ts}");
  });

  test("draws Mermaid diagrams as text", async () => {
    const output = await plain("```mermaid\ngraph LR\n  A --> B\n```\n");
    expect(output).toMatch(/[┌─│└]/);
    expect(output).toContain("A");
  });

  test("shows the TeX source of math", async () => {
    expect(await plain("Inline $a^2$ math.\n")).toContain("a^2");
  });

  test("shows HTML tags and footnotes as text, not as Comark syntax", async () => {
    const output = await plain("Press <kbd>K</kbd>, see[^1].\n\n[^1]: The note.\n");
    expect(output).toContain("Press K");
    expect(output).toContain("[1]");
    expect(output).toContain("The note.");
    expect(output).not.toMatch(/:sup\[|::section|#fn-1|#fnref-1/);
  });

  test("removes control characters that the markdown contains", async () => {
    const output = await plain(`Text with ${ESC}[31mred${ESC}[0m escapes.\n`);
    expect(output).not.toContain(ESC);
  });
});

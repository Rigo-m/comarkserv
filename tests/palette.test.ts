import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vite-plus/test";
import { paletteStyles, themeTokenNames } from "../src/assets/palette.ts";

const themeCss = readFileSync(
  createRequire(import.meta.url).resolve("@twinkleplop/theme-github"),
  "utf8",
);

describe("themeTokenNames", () => {
  test("reads the color tokens of the twinkleplop theme, not the style tokens", () => {
    const names = themeTokenNames(themeCss);
    expect(names).toContain("keyword");
    expect(names).toContain("tag_name");
    expect(names).not.toContain("bold-font-weight");
    expect(names.length).toBeGreaterThan(90);
  });
});

describe("paletteStyles", () => {
  const css = paletteStyles(themeTokenNames(themeCss));

  test("maps each twinkleplop color token to a slot", () => {
    for (const name of themeTokenNames(themeCss)) {
      expect(css).toMatch(new RegExp(`--twp-${name}: var\\(--b0[0-9A-F]\\);`));
    }
  });

  test("uses the base16 roles", () => {
    expect(css).toContain("--twp-keyword: var(--b0E);");
    expect(css).toContain("--twp-string: var(--b0B);");
    expect(css).toContain("--twp-number: var(--b09);");
    expect(css).toContain("--twp-function: var(--b0D);");
    expect(css).toContain("--twp-comment: var(--b03);");
    expect(css).toContain("--twp-type: var(--b0A);");
  });

  test("maps the page colors, and the accent falls back to base0D", () => {
    expect(css).toContain("--cms-bg: var(--b00);");
    expect(css).toContain("--cms-fg: var(--b05);");
    expect(css).toContain("--cms-accent: var(--b-accent, var(--b0D));");
  });

  test("gives a token that it does not know a slot from its name", () => {
    const future = paletteStyles(["future_open", "raw_future", "something_new"]);
    expect(future).toContain("--twp-future_open: var(--b03);");
    expect(future).toContain("--twp-raw_future: var(--b05);");
    expect(future).toContain("--twp-something_new: var(--b05);");
  });

  test("applies only when a palette is active", () => {
    expect(css).toMatch(/^:root\[data-cms-palette\] \{/);
  });
});

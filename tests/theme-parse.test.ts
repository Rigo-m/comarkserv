import { Script } from "node:vm";
import { describe, expect, test } from "vite-plus/test";
import { parseTheme } from "../src/theme-parse.ts";

const base16 = `system: "base16"
name: "Gruvbox dark, hard"
author: "Dawid Kurek (dawikur@gmail.com), morhetz (https://github.com/morhetz/gruvbox)"
variant: "dark"
palette:
  base00: "#1d2021" # ----
  base01: "#3c3836" # ---
  base02: "#504945" # --
  base03: "#665c54" # -
  base04: "#bdae93" # +
  base05: "#d5c4a1" # ++
  base06: "#ebdbb2" # +++
  base07: "#fbf1c7" # ++++
  base08: "#fb4934" # red
  base09: "#fe8019" # orange
  base0A: "#fabd2f" # yellow
  base0B: "#b8bb26" # green
  base0C: "#8ec07c" # aqua/cyan
  base0D: "#83a598" # blue
  base0E: "#d3869b" # purple
  base0F: "#d65d0e" # brown
`;

const base24 = `system: "base24"
name: "Dracula"
variant: "dark"
palette:
  base00: "#282a36"  # Default Background
  base01: "#21222c"
  base02: "#44475A"  # uppercase hex
  base03: "#6272a4"
  base04: "#9ea8c7"
  base05: "#f8f8f2"
  base06: "#f8f8f2"
  base07: "#ffffff"
  base08: "#ff5555"
  base09: "#FFB86C"
  base0A: "#f1fa8c"
  base0B: "#50fa7b"
  base0C: "#8be9fd"
  base0D: "#bd93f9"
  base0E: "#ff79c6"
  base0F: "#993333"
  base10: "#1e2029"
  base11: "#16171d"
  base12: "#ff6e6e"
  base13: "#ffffa5"
  base14: "#69ff94"
  base15: "#a4ffff"
  base16: "#d6acff"
  base17: "#ff92df"
`;

// The format before spec 0.11: no palette block, no variant, no "#".
const legacy = `scheme: "Default Light"
author: "Chris Kempson (http://chriskempson.com)"
base00: "f8f8f8"
base01: "e8e8e8"
base02: "d8d8d8"
base03: "b8b8b8"
base04: "585858"
base05: "383838"
base06: "282828"
base07: "181818"
base08: "ab4642"
base09: "dc9656"
base0A: "f7ca88"
base0B: "a1b56c"
base0C: "86c1b9"
base0D: "7cafc2"
base0E: "ba8baa"
base0F: "a16946"
`;

const omarchy = `mode = "dark"

accent = "#7daea3"
selection = "#504945"
muted = "#665c54"

background = "#282828"
dark_background = "#1e1e1e"
darker_background = "#161616"
lighter_background = "#3c3836"

foreground = "#d4be98"
dark_foreground = "#7c6f64"
light_foreground = "#bdae93"
bright_foreground = "#d4be98"

red = "#ea6962"
yellow = "#d8a657"
orange = "#e1875c"
green = "#a9b665"
cyan = "#89b482"
blue = "#7daea3"
magenta = "#d3869b"
brown = "#70432e"
`;

describe("parseTheme", () => {
  test("reads a base16 scheme", () => {
    expect(parseTheme(base16, "base16:gruvbox-dark-hard", "Gruvbox Dark Hard")).toEqual({
      id: "base16:gruvbox-dark-hard",
      name: "Gruvbox dark, hard",
      variant: "dark",
      colors: [
        "#1d2021",
        "#3c3836",
        "#504945",
        "#665c54",
        "#bdae93",
        "#d5c4a1",
        "#ebdbb2",
        "#fbf1c7",
        "#fb4934",
        "#fe8019",
        "#fabd2f",
        "#b8bb26",
        "#8ec07c",
        "#83a598",
        "#d3869b",
        "#d65d0e",
      ],
    });
  });

  test("reads the base16 slots of a base24 scheme, in lowercase", () => {
    const theme = parseTheme(base24, "base24:dracula", "Dracula");
    expect(theme?.colors).toHaveLength(16);
    expect(theme?.colors[2]).toBe("#44475a");
    expect(theme?.colors[9]).toBe("#ffb86c");
    expect(theme?.colors[15]).toBe("#993333");
  });

  test("reads the old format and finds the variant from the background", () => {
    const theme = parseTheme(legacy, "base16:default-light", "Default Light");
    expect(theme?.name).toBe("Default Light");
    expect(theme?.variant).toBe("light");
    expect(theme?.colors[0]).toBe("#f8f8f8");
  });

  test("reads an Omarchy colors.toml", () => {
    const theme = parseTheme(omarchy, "omarchy:gruvbox", "Gruvbox");
    expect(theme).toEqual({
      id: "omarchy:gruvbox",
      name: "Gruvbox",
      variant: "dark",
      accent: "#7daea3",
      colors: [
        "#282828",
        "#3c3836",
        "#504945",
        "#665c54",
        "#7c6f64",
        "#d4be98",
        "#bdae93",
        "#d4be98",
        "#ea6962",
        "#e1875c",
        "#d8a657",
        "#a9b665",
        "#89b482",
        "#7daea3",
        "#d3869b",
        "#70432e",
      ],
    });
  });

  test("fills the missing Omarchy keys from other keys", () => {
    const minimal =
      'background = "#ffffff"\nforeground = "#111111"\nred = "#cc0000"\nblue = "#0000cc"\n';
    const theme = parseTheme(minimal, "file:minimal", "Minimal");
    expect(theme?.variant).toBe("light");
    expect(theme?.colors).toHaveLength(16);
    expect(theme?.colors.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
  });

  test("expands short hex colors", () => {
    const theme = parseTheme(base16.replace('"#1d2021"', '"#123"'), "x", "X");
    expect(theme?.colors[0]).toBe("#112233");
  });

  test("rejects a scheme with a value that is not a hex color", () => {
    for (const value of ['"red"', '"#12345g"', '"#1234567"', '"url(x)"', '"#fff;}body{"']) {
      expect(parseTheme(base16.replace('"#fb4934"', value), "x", "X")).toBeUndefined();
    }
  });

  test("rejects a scheme with a missing slot", () => {
    expect(parseTheme(base16.replace(/ {2}base0F.*\n/, ""), "x", "X")).toBeUndefined();
  });

  test("rejects text that is not a scheme", () => {
    expect(parseTheme("<!doctype html><title>404</title>", "x", "X")).toBeUndefined();
    expect(parseTheme("", "x", "X")).toBeUndefined();
  });

  test("limits the name to 80 characters", () => {
    const theme = parseTheme(base16.replace("Gruvbox dark, hard", "x".repeat(200)), "x", "X");
    expect(theme?.name).toHaveLength(80);
  });

  test("works when the browser gets it with toString()", () => {
    const script = new Script(`(${parseTheme.toString()})(text, "id", "Name")`);
    expect(script.runInNewContext({ text: base16 })?.colors?.[0]).toBe("#1d2021");
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createThemeStore, themeWatchPath } from "../src/themes.ts";

const nord = `system: "base16"
name: "Nord"
variant: "dark"
palette:
  base00: "#2e3440"
  base01: "#3b4252"
  base02: "#434c5e"
  base03: "#4c566a"
  base04: "#d8dee9"
  base05: "#e5e9f0"
  base06: "#eceff4"
  base07: "#8fbcbb"
  base08: "#bf616a"
  base09: "#d08770"
  base0A: "#ebcb8b"
  base0B: "#a3be8c"
  base0C: "#88c0d0"
  base0D: "#81a1c1"
  base0E: "#b48ead"
  base0F: "#5e81ac"
`;

const omarchyNord =
  'mode = "dark"\naccent = "#88c0d0"\nbackground = "#2e3440"\nforeground = "#d8dee9"\nred = "#bf616a"\nblue = "#81a1c1"\n';

const responses: Record<string, string> = {
  "https://ungh.cc/repos/tinted-theming/schemes": JSON.stringify({
    repo: { defaultBranch: "spec-0.11" },
  }),
  "https://ungh.cc/repos/tinted-theming/schemes/files/spec-0.11": JSON.stringify({
    files: [
      { path: "base16/nord.yaml" },
      { path: "base16/gruvbox-dark-hard.yaml" },
      { path: "base16/nested/skip.yaml" },
      { path: "base24/dracula.yaml" },
      { path: "README.md" },
    ],
  }),
  "https://ungh.cc/repos/basecamp/omarchy": JSON.stringify({ repo: { defaultBranch: "quattro" } }),
  "https://ungh.cc/repos/basecamp/omarchy/files/quattro": JSON.stringify({
    files: [
      { path: "themes/nord/colors.toml" },
      { path: "themes/nord/neovim.lua" },
      { path: "themes/old/alacritty.toml" },
    ],
  }),
  "https://raw.githubusercontent.com/tinted-theming/schemes/spec-0.11/base16/nord.yaml": nord,
  "https://raw.githubusercontent.com/basecamp/omarchy/quattro/themes/nord/colors.toml": omarchyNord,
};

let cacheDir: string;
let calls: string[];
let online: boolean;
let now: number;

const fakeFetch = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(url);
  if (!online) throw new TypeError("fetch failed");
  const body = responses[url];
  return body === undefined ? new Response("Not found", { status: 404 }) : new Response(body);
};

const store = (options: { omarchyPath?: string } = {}) =>
  createThemeStore({ cacheDir, fetch: fakeFetch, now: () => now, ...options });

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "comarkserv-themes-"));
  calls = [];
  online = true;
  now = Date.UTC(2026, 8, 25);
});

afterEach(() => rm(cacheDir, { recursive: true, force: true }));

describe("catalog", () => {
  test("lists the base16, base24 and Omarchy themes with raw GitHub URLs", async () => {
    const entries = await store().catalog();
    expect(entries).toEqual([
      {
        id: "base16:gruvbox-dark-hard",
        name: "Gruvbox Dark Hard",
        source: "base16",
        url: "https://raw.githubusercontent.com/tinted-theming/schemes/spec-0.11/base16/gruvbox-dark-hard.yaml",
      },
      {
        id: "base16:nord",
        name: "Nord",
        source: "base16",
        url: "https://raw.githubusercontent.com/tinted-theming/schemes/spec-0.11/base16/nord.yaml",
      },
      {
        id: "base24:dracula",
        name: "Dracula",
        source: "base24",
        url: "https://raw.githubusercontent.com/tinted-theming/schemes/spec-0.11/base24/dracula.yaml",
      },
      {
        id: "omarchy:nord",
        name: "Nord",
        source: "omarchy",
        url: "https://raw.githubusercontent.com/basecamp/omarchy/quattro/themes/nord/colors.toml",
      },
    ]);
  });

  test("gives each entry the URL from urlFor", async () => {
    const entries = await store().catalog((source, id) => `/themes/${source}/${id}`);
    expect(entries.map((entry) => entry.url)).toContain("/themes/base24/dracula");
  });

  test("reads each repository listing one time", async () => {
    await store().catalog();
    const listings = calls.filter((url) => url.includes("/files/"));
    expect(listings).toHaveLength(2);
  });
});

describe("raw", () => {
  test("returns the text of a theme", async () => {
    expect(await store().raw("base16", "nord")).toBe(nord);
  });

  test("returns undefined for a theme that does not exist", async () => {
    expect(await store().raw("base16", "missing")).toBeUndefined();
  });

  test("rejects an id that is not a plain name, with no request", async () => {
    const themes = store();
    for (const id of ["../secret", "a/b", "", ".hidden", "x?y"]) {
      expect(await themes.raw("base16", id)).toBeUndefined();
    }
    expect(calls).toEqual([]);
  });

  test("shares one request between calls at the same time", async () => {
    const themes = store();
    await Promise.all([themes.raw("base16", "nord"), themes.raw("base16", "nord")]);
    expect(calls.filter((url) => url.endsWith("nord.yaml"))).toHaveLength(1);
  });
});

describe("cache", () => {
  test("uses the disk cache when the network is not available", async () => {
    await store().raw("base16", "nord");
    online = false;
    expect(await store().raw("base16", "nord")).toBe(nord);
  });

  test("does not use the network while the cache is fresh", async () => {
    await store().raw("base16", "nord");
    calls = [];
    now += 60 * 60 * 1000;
    await store().raw("base16", "nord");
    expect(calls).toEqual([]);
  });

  test("uses a stale cache entry when the request fails", async () => {
    await store().raw("base16", "nord");
    now += 30 * 24 * 60 * 60 * 1000;
    online = false;
    expect(await store().raw("base16", "nord")).toBe(nord);
  });
});

describe("load", () => {
  test("returns undefined for the built-in GitHub theme", async () => {
    expect(await store().load("github")).toBeUndefined();
  });

  test("loads a remote theme", async () => {
    const theme = await store().load("base16:nord");
    expect(theme?.id).toBe("base16:nord");
    expect(theme?.name).toBe("Nord");
    expect((await store().load("omarchy:nord"))?.accent).toBe("#88c0d0");
  });

  test("rejects a remote theme that does not exist", async () => {
    await expect(store().load("base16:missing")).rejects.toThrow(/base16:missing/);
  });

  test("loads a local file", async () => {
    const path = join(cacheDir, "my-theme.yaml");
    await writeFile(path, nord);
    const theme = await store().load("./my-theme.yaml", cacheDir);
    expect(theme?.id).toBe("file:my-theme.yaml");
    await expect(store().load("./missing.yaml", cacheDir)).rejects.toThrow(/missing\.yaml/);
  });

  test("loads the current Omarchy theme", async () => {
    const omarchyPath = join(cacheDir, "colors.toml");
    await writeFile(omarchyPath, omarchyNord);
    const theme = await store({ omarchyPath }).load("omarchy");
    expect(theme?.id).toBe("omarchy-live");
    expect(theme?.name).toBe("Omarchy");
  });

  test("rejects text that is not a theme", async () => {
    const path = join(cacheDir, "bad.yaml");
    await writeFile(path, "hello: world\n");
    await expect(store().load(path)).rejects.toThrow(/not a base16/);
  });
});

describe("themeWatchPath", () => {
  test("returns the file to watch for live themes only", () => {
    expect(themeWatchPath("omarchy", "/x", "/omarchy/colors.toml")).toBe("/omarchy/colors.toml");
    expect(themeWatchPath("./a.yaml", "/work", "/o")).toBe("/work/a.yaml");
    expect(themeWatchPath("base16:nord", "/work", "/o")).toBeUndefined();
    expect(themeWatchPath("https://e.com/a.yaml", "/work", "/o")).toBeUndefined();
    expect(themeWatchPath("github", "/work", "/o")).toBeUndefined();
  });
});

import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createThemeService } from "../src/theme-server.ts";
import type { ThemeService } from "../src/theme-server.ts";
import type { CatalogEntry, Palette, ThemeSource, ThemeStore } from "../src/themes.ts";
import { createThemeStore } from "../src/themes.ts";

const scheme = (background: string) => `name: "Test"
variant: "dark"
palette:
${Array.from({ length: 16 }, (_, i) => `  base0${i.toString(16).toUpperCase()}: "${i === 0 ? background : "#445566"}"`).join("\n")}
`;
const toml = (background: string) =>
  `mode = "dark"\nbackground = "${background}"\nforeground = "#eeeeee"\nred = "#ff0000"\nblue = "#0000ff"\n`;

// A store that needs no network: the remote themes are in memory.
function memoryStore(dir: string, omarchyPath: string): ThemeStore {
  const remote: Record<string, string> = { "base16:nord": scheme("#2e3440") };
  const local = createThemeStore({
    cacheDir: join(dir, "cache"),
    omarchyPath,
    fetch: () => Promise.reject(new Error("offline")),
  });
  return {
    catalog: async (
      urlFor?: (source: ThemeSource, id: string) => string,
    ): Promise<CatalogEntry[]> => [
      {
        id: "base16:nord",
        name: "Nord",
        source: "base16",
        url: urlFor ? urlFor("base16", "nord") : "https://x/nord.yaml",
      },
    ],
    raw: async (source, id) => remote[`${source}:${id}`],
    load: (spec, cwd) => local.load(spec, cwd),
  };
}

let dir: string;
let omarchyPath: string;
let service: ThemeService | undefined;
const get = (name: string) =>
  service!.handle(new Request(`http://x/__comarkserv/themes/${name}`), name);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "comarkserv-theme-service-"));
  omarchyPath = join(dir, "current", "theme", "colors.toml");
});

afterEach(async () => {
  await service?.close();
  service = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe("endpoints", () => {
  test("serves the catalog with URLs of this server", async () => {
    service = createThemeService({
      spec: "github",
      store: memoryStore(dir, omarchyPath),
      prefix: "/__comarkserv/themes/",
      watch: false,
      omarchyPath,
    });
    const entries = (await (await get("catalog.json")).json()) as CatalogEntry[];
    expect(entries).toEqual([
      {
        id: "base16:nord",
        name: "Nord",
        source: "base16",
        url: "/__comarkserv/themes/raw/base16/nord",
      },
    ]);
  });

  test("puts the live Omarchy theme first when this machine has one", async () => {
    await mkdir(join(dir, "current", "theme"), { recursive: true });
    await writeFile(omarchyPath, toml("#101010"));
    service = createThemeService({
      spec: "github",
      store: memoryStore(dir, omarchyPath),
      prefix: "/p/",
      watch: false,
      omarchyPath,
    });
    const entries = (await (await get("catalog.json")).json()) as CatalogEntry[];
    expect(entries[0]).toEqual({
      id: "omarchy-live",
      name: "Omarchy (live)",
      source: "omarchy-live",
      url: "/p/omarchy-live",
    });
    expect(await (await get("omarchy-live")).text()).toContain("#101010");
  });

  test("serves a theme file, and 404 for a source or id that is not valid", async () => {
    service = createThemeService({
      spec: "github",
      store: memoryStore(dir, omarchyPath),
      prefix: "/p/",
      watch: false,
      omarchyPath,
    });
    const response = await get("raw/base16/nord");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toContain("#2e3440");
    for (const name of [
      "raw/evil/nord",
      "raw/base16/missing",
      "raw/base16",
      "raw/base16/a/b",
      "omarchy-live",
      "other",
    ]) {
      expect((await get(name)).status).toBe(404);
    }
  });
});

describe("default theme", () => {
  test("loads the theme of the spec", async () => {
    const path = join(dir, "mine.yaml");
    await writeFile(path, scheme("#123456"));
    service = createThemeService({
      spec: path,
      store: memoryStore(dir, omarchyPath),
      prefix: "/p/",
      watch: false,
      omarchyPath,
    });
    expect((await service.current())?.colors[0]).toBe("#123456");
  });

  test("uses the GitHub theme and warns when the theme does not load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    service = createThemeService({
      spec: join(dir, "missing.yaml"),
      store: memoryStore(dir, omarchyPath),
      prefix: "/p/",
      watch: false,
      omarchyPath,
    });
    expect(await service.current()).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("missing.yaml"));
    warn.mockRestore();
  });
});

describe("live themes", () => {
  const next = (target: ThemeService) =>
    new Promise<Palette>((resolve) => {
      const stop = target.subscribe((theme) => {
        stop();
        resolve(theme);
      });
    });

  test("reports a change to the theme file of the spec", async () => {
    const path = join(dir, "mine.yaml");
    await writeFile(path, scheme("#111111"));
    service = createThemeService({
      spec: path,
      store: memoryStore(dir, omarchyPath),
      prefix: "/p/",
      watch: true,
      omarchyPath,
    });
    await service.ready;
    const version = service.version();
    const changed = next(service);
    await writeFile(path, scheme("#222222"));
    expect((await changed).colors[0]).toBe("#222222");
    expect(service.version()).toBe(version + 1);
    expect((await service.current())?.colors[0]).toBe("#222222");
  });

  test("reports a new Omarchy theme when omarchy-theme-set replaces the directory", async () => {
    await mkdir(join(dir, "current", "theme"), { recursive: true });
    await writeFile(omarchyPath, toml("#111111"));
    service = createThemeService({
      spec: "github",
      store: memoryStore(dir, omarchyPath),
      prefix: "/p/",
      watch: true,
      omarchyPath,
    });
    await service.ready;
    const changed = next(service);
    // The same steps as omarchy-theme-set: stage the next theme, remove the current one, move.
    await mkdir(join(dir, "current", "next-theme"));
    await writeFile(join(dir, "current", "next-theme", "colors.toml"), toml("#333333"));
    await rm(join(dir, "current", "theme"), { recursive: true });
    await rename(join(dir, "current", "next-theme"), join(dir, "current", "theme"));
    const theme = await changed;
    expect(theme.id).toBe("omarchy-live");
    expect(theme.colors[0]).toBe("#333333");
  });
});

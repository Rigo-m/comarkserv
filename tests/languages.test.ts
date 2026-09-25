import { describe, expect, test } from "vite-plus/test";
import {
  loadLanguage,
  loadedLanguages,
  resolveLanguage,
  supportedLanguages,
} from "../src/languages.ts";

describe("resolveLanguage", () => {
  test("resolves canonical names and aliases", () => {
    expect(resolveLanguage("typescript")).toBe("typescript");
    expect(resolveLanguage("ts")).toBe("typescript");
    expect(resolveLanguage("py")).toBe("python");
    expect(resolveLanguage("sh")).toBe("bash");
    expect(resolveLanguage("yml")).toBe("yaml");
    expect(resolveLanguage("rs")).toBe("rust");
    expect(resolveLanguage("golang")).toBe("go");
    expect(resolveLanguage("jsx")).toBe("tsx");
    expect(resolveLanguage("md")).toBe("markdown");
  });

  test("ignores case and surrounding space", () => {
    expect(resolveLanguage(" TS ")).toBe("typescript");
    expect(resolveLanguage("Python")).toBe("python");
  });

  test("returns undefined for unknown or empty names", () => {
    expect(resolveLanguage("cobol")).toBeUndefined();
    expect(resolveLanguage("")).toBeUndefined();
    expect(resolveLanguage(undefined)).toBeUndefined();
  });
});

describe("lazy loading", () => {
  test("loads no grammar before it is necessary", () => {
    expect(loadedLanguages()).toEqual([]);
  });

  test("loads only the grammar that is requested", async () => {
    const highlight = await loadLanguage("typescript");
    expect(highlight("const a = 1")).toContain('class="tok keyword"');
    expect(loadedLanguages()).toEqual(["typescript"]);
  });

  test("returns the same grammar on each call", async () => {
    const [a, b] = await Promise.all([loadLanguage("python"), loadLanguage("python")]);
    expect(a).toBe(b);
  });

  test("supports each listed language", async () => {
    for (const id of supportedLanguages) {
      const highlight = await loadLanguage(id);
      expect(typeof highlight("x")).toBe("string");
    }
  });
});

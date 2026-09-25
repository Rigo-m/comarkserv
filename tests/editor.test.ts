import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { createHandler } from "../src/handler.ts";
import type { ComarkservHandler } from "../src/handler.ts";
import { createFixture, sampleFiles } from "./fixture.ts";
import type { Fixture } from "./fixture.ts";

let fixture: Fixture;
let app: ComarkservHandler;
let opened: { file: string; line: number | undefined }[];
let failure: Error | undefined;

beforeAll(async () => {
  fixture = await createFixture(sampleFiles);
  app = createHandler({
    root: fixture.root,
    livereload: false,
    openEditor: async (file, line) => {
      if (failure) throw failure;
      opened.push({ file, line });
    },
  });
});

beforeEach(() => {
  opened = [];
  failure = undefined;
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

const edit = (body: unknown, headers: Record<string, string> = {}, host = "localhost:8642") =>
  app.fetch(
    new Request(`http://${host}/__comarkserv/edit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-comarkserv-edit": "1", ...headers },
      body: JSON.stringify(body),
    }),
  );

describe("the edit endpoint", () => {
  test("opens a markdown file at a line", async () => {
    const response = await edit({ path: "/guide.md", line: 8 });
    expect(response.status).toBe(204);
    expect(opened).toEqual([{ file: join(fixture.root, "guide.md"), line: 8 }]);
  });

  test("accepts a request from the page on 127.0.0.1 and [::1]", async () => {
    expect((await edit({ path: "/guide.md" }, {}, "127.0.0.1:8642")).status).toBe(204);
    expect((await edit({ path: "/guide.md" }, {}, "[::1]:8642")).status).toBe(204);
    expect(opened.map((entry) => entry.line)).toEqual([undefined, undefined]);
  });

  test("rejects a request without the header, so another site needs a preflight", async () => {
    const response = await app.fetch(
      new Request("http://localhost:8642/__comarkserv/edit", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ path: "/guide.md" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(opened).toEqual([]);
  });

  test("rejects a request from another origin", async () => {
    const response = await edit({ path: "/guide.md" }, { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect(opened).toEqual([]);
  });

  test("rejects a host name that is not local, against DNS rebinding", async () => {
    const response = await edit({ path: "/guide.md" }, {}, "evil.example:8642");
    expect(response.status).toBe(403);
    expect(opened).toEqual([]);
  });

  test("opens only visible files in the root", async () => {
    for (const path of [
      "/../../etc/passwd",
      "/.env",
      "/.hidden/secret.md",
      "/missing.md",
      "/docs/",
      "docs/api.md",
    ]) {
      expect((await edit({ path })).status).toBe(404);
    }
    expect(opened).toEqual([]);
  });

  test("ignores a line that is not a positive integer", async () => {
    await edit({ path: "/guide.md", line: -3 });
    await edit({ path: "/guide.md", line: "7" });
    expect(opened.map((entry) => entry.line)).toEqual([undefined, undefined]);
  });

  test("returns the error when no editor opens", async () => {
    failure = new Error("comarkserv found no editor");
    const response = await edit({ path: "/guide.md" });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "comarkserv found no editor" });
  });

  test("accepts only POST", async () => {
    const response = await app.fetch(new Request("http://localhost:8642/__comarkserv/edit"));
    expect(response.status).toBe(405);
  });
});

describe("the page", () => {
  test("gives the edit URL and the heading lines to the client", async () => {
    const html = await (await app.fetch(new Request("http://localhost:8642/guide.md"))).text();
    expect(html).toContain('"edit":"/__comarkserv/edit"');
    expect(html).toContain('"lines":{"guide":4,"install":6,"install-deep-dive":12}');
    expect(html).toContain("data-cms-edit");
  });

  test("has no edit button when the feature is off", async () => {
    const off = createHandler({ root: fixture.root, livereload: false, editor: false });
    try {
      const html = await (await off.fetch(new Request("http://localhost/guide.md"))).text();
      expect(html).toContain('"edit":""');
      expect(html).not.toContain("data-cms-edit");
      const response = await off.fetch(
        new Request("http://localhost/__comarkserv/edit", {
          method: "POST",
          headers: { "x-comarkserv-edit": "1" },
          body: JSON.stringify({ path: "/guide.md" }),
        }),
      );
      expect(response.status).toBe(404);
    } finally {
      await off.close();
    }
  });
});

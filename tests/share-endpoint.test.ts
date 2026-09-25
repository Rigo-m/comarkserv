import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { createHandler } from "../src/handler.ts";
import type { ComarkservHandler } from "../src/handler.ts";
import { createShareService } from "../src/share.ts";
import { createFixture, sampleFiles } from "./fixture.ts";
import type { Fixture } from "./fixture.ts";

let fixture: Fixture;
let app: ComarkservHandler;
let installed: boolean;
let tunnels: string[];

beforeAll(async () => {
  fixture = await createFixture(sampleFiles);
  app = createHandler({
    root: fixture.root,
    livereload: false,
    openEditor: async () => {},
    shareService: createShareService({
      isInstalled: () => installed,
      startTunnel: async ({ url }) => {
        tunnels.push(url);
        return {
          getURL: async () => "https://quiet-forest.trycloudflare.com",
          close: async () => {},
        };
      },
    }),
  });
});

beforeEach(() => {
  installed = true;
  tunnels = [];
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

const local = (headers: Record<string, string> = {}, host = "localhost:8642") =>
  app.fetch(new Request(`http://${host}/__comarkserv/local`, { headers }));

const share = (body: unknown, headers: Record<string, string> = {}, host = "localhost:8642") =>
  app.fetch(
    new Request(`http://${host}/__comarkserv/share`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-comarkserv-action": "1", ...headers },
      body: JSON.stringify(body),
    }),
  );

describe("the local check", () => {
  test("tells a local page which actions it can use", async () => {
    const response = await local();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      edit: true,
      share: { state: "off", needsConsent: false },
    });
  });

  test("rejects a request through a tunnel or a proxy, even from 127.0.0.1", async () => {
    for (const header of [
      "cf-ray",
      "cf-connecting-ip",
      "x-forwarded-for",
      "forwarded",
      "x-real-ip",
    ]) {
      expect((await local({ [header]: "1" }, "127.0.0.1:8642")).status).toBe(403);
    }
  });

  test("rejects a host name that is not local", async () => {
    expect((await local({}, "quiet-forest.trycloudflare.com")).status).toBe(403);
  });
});

describe("the share endpoint", () => {
  test("starts a tunnel to the origin of the page, and returns a QR code for the page", async () => {
    const response = await share({ action: "start", path: "/docs/api.md" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      state: string;
      url: string;
      qr: string;
      page: string;
    };
    expect(body.state).toBe("on");
    expect(body.url).toBe("https://quiet-forest.trycloudflare.com");
    expect(body.page).toBe("https://quiet-forest.trycloudflare.com/docs/api.md");
    expect(body.qr).toMatch(/^<svg/);
    expect(tunnels).toEqual(["http://localhost:8642"]);
    expect(await (await local()).json()).toMatchObject({ share: { state: "on" } });
    await share({ action: "stop" });
  });

  test("asks for consent when cloudflared is not installed", async () => {
    installed = false;
    const response = await share({ action: "start" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      needsConsent: true,
      links: { license: expect.any(String) },
    });
    expect(tunnels).toEqual([]);
    expect((await share({ action: "start", accept: true })).status).toBe(200);
    expect(tunnels).toHaveLength(1);
    await share({ action: "stop" });
  });

  test("stops the tunnel", async () => {
    await share({ action: "start" });
    const response = await share({ action: "stop" });
    expect(await response.json()).toMatchObject({ state: "off" });
  });

  test("rejects a request without the header, from another origin, or through the tunnel", async () => {
    const plain = await app.fetch(
      new Request("http://localhost:8642/__comarkserv/share", {
        method: "POST",
        body: JSON.stringify({ action: "start" }),
      }),
    );
    expect(plain.status).toBe(403);
    expect((await share({ action: "start" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await share({ action: "stop" }, { "cf-connecting-ip": "203.0.113.9" })).status).toBe(
      403,
    );
    expect(tunnels).toEqual([]);
  });

  test("accepts only POST", async () => {
    expect((await app.fetch(new Request("http://localhost:8642/__comarkserv/share"))).status).toBe(
      405,
    );
  });
});

describe("the edit endpoint through a tunnel", () => {
  test("is rejected, so a visitor cannot open files in the editor", async () => {
    const response = await app.fetch(
      new Request("http://localhost:8642/__comarkserv/edit", {
        method: "POST",
        headers: { "x-comarkserv-action": "1", "cf-ray": "8a1b2c3d" },
        body: JSON.stringify({ path: "/guide.md" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("the page", () => {
  test("has hidden Edit and Share buttons, and the URL of the local check", async () => {
    const html = await (await app.fetch(new Request("http://localhost:8642/guide.md"))).text();
    expect(html).toContain('"local":"/__comarkserv/local"');
    expect(html).toMatch(/data-cms-share[^>]*hidden/);
    expect(html).toMatch(/data-cms-edit[^>]*hidden/);
  });

  test("has no Share button when sharing is off", async () => {
    const off = createHandler({ root: fixture.root, livereload: false, share: false });
    try {
      const html = await (await off.fetch(new Request("http://localhost/guide.md"))).text();
      expect(html).not.toContain("data-cms-share");
      expect(
        await (await off.fetch(new Request("http://localhost/__comarkserv/local"))).json(),
      ).toMatchObject({
        share: null,
      });
    } finally {
      await off.close();
    }
  });
});

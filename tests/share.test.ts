import { describe, expect, test } from "vite-plus/test";
import { createShareService, ShareConsentError } from "../src/share.ts";
import type { StartTunnel } from "../src/share.ts";

function fakeTunnel() {
  const calls: { url: string; accept: boolean }[] = [];
  let closed = 0;
  const start: StartTunnel = async (options) => {
    calls.push({ url: options.url, accept: options.acceptCloudflareNotice });
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      getURL: async () => "https://quiet-forest.trycloudflare.com",
      close: async () => {
        closed++;
      },
    };
  };
  return { start, calls, closed: () => closed };
}

describe("createShareService", () => {
  test("starts a tunnel to the origin and returns the public URL", async () => {
    const tunnel = fakeTunnel();
    const share = createShareService({ startTunnel: tunnel.start, isInstalled: () => true });
    expect(share.status()).toEqual({ state: "off", needsConsent: false });
    expect(await share.start({ origin: "http://localhost:8642" })).toBe(
      "https://quiet-forest.trycloudflare.com",
    );
    expect(share.status()).toEqual({
      state: "on",
      url: "https://quiet-forest.trycloudflare.com",
      needsConsent: false,
    });
    expect(tunnel.calls).toEqual([{ url: "http://localhost:8642", accept: false }]);
  });

  test("starts one tunnel for calls at the same time", async () => {
    const tunnel = fakeTunnel();
    const share = createShareService({ startTunnel: tunnel.start, isInstalled: () => true });
    const first = share.start({ origin: "http://localhost:1" });
    expect(share.status().state).toBe("starting");
    await Promise.all([first, share.start({ origin: "http://localhost:1" })]);
    expect(tunnel.calls).toHaveLength(1);
  });

  test("needs consent before it installs cloudflared", async () => {
    const tunnel = fakeTunnel();
    const share = createShareService({ startTunnel: tunnel.start, isInstalled: () => false });
    expect(share.status().needsConsent).toBe(true);
    await expect(share.start({ origin: "http://localhost:1" })).rejects.toBeInstanceOf(
      ShareConsentError,
    );
    expect(tunnel.calls).toEqual([]);
    await share.start({ origin: "http://localhost:1", accept: true });
    expect(tunnel.calls).toEqual([{ url: "http://localhost:1", accept: true }]);
  });

  test("stops the tunnel", async () => {
    const tunnel = fakeTunnel();
    const share = createShareService({ startTunnel: tunnel.start, isInstalled: () => true });
    await share.start({ origin: "http://localhost:1" });
    await share.stop();
    expect(tunnel.closed()).toBe(1);
    expect(share.status().state).toBe("off");
  });

  test("tells the listeners about each change", async () => {
    const tunnel = fakeTunnel();
    const share = createShareService({ startTunnel: tunnel.start, isInstalled: () => true });
    const states: string[] = [];
    share.subscribe((status) => states.push(status.state));
    await share.start({ origin: "http://localhost:1" });
    await share.stop();
    expect(states).toEqual(["starting", "on", "off"]);
  });

  test("reports a tunnel that does not start, and can try again", async () => {
    let fail = true;
    const share = createShareService({
      isInstalled: () => true,
      startTunnel: async () => {
        if (fail) throw new Error("cloudflared exited");
        return { getURL: async () => "https://x.trycloudflare.com", close: async () => {} };
      },
    });
    await expect(share.start({ origin: "http://localhost:1" })).rejects.toThrow(
      /cloudflared exited/,
    );
    expect(share.status()).toEqual({
      state: "off",
      needsConsent: false,
      error: "cloudflared exited",
    });
    fail = false;
    expect(await share.start({ origin: "http://localhost:1" })).toBe("https://x.trycloudflare.com");
  });
});

import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The Cloudflare documents that a user must accept before untun installs cloudflared. */
export const CLOUDFLARE_LINKS = {
  license:
    "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/license/",
  terms: "https://www.cloudflare.com/terms/",
  privacy: "https://www.cloudflare.com/privacypolicy/",
};

export interface Tunnel {
  getURL: () => Promise<string>;
  close: () => Promise<void>;
}

/** Starts a tunnel. The default is `startTunnel` of untun. */
export type StartTunnel = (options: {
  url: string;
  acceptCloudflareNotice: boolean;
}) => Promise<Tunnel | undefined>;

export interface ShareStatus {
  state: "off" | "starting" | "on";
  /** The public URL, when the state is "on". */
  url?: string;
  /** True when cloudflared is not installed, so the user must accept the Cloudflare license first. */
  needsConsent: boolean;
  /** The error of the last start that failed. */
  error?: string;
}

export interface ShareService {
  status: () => ShareStatus;
  /** Starts the tunnel to `origin`, or returns the URL of the tunnel that runs. */
  start: (options: { origin: string; accept?: boolean }) => Promise<string>;
  stop: () => Promise<void>;
  subscribe: (listener: (status: ShareStatus) => void) => () => void;
}

export interface ShareServiceOptions {
  startTunnel?: StartTunnel;
  /** Returns true when cloudflared is installed. */
  isInstalled?: () => boolean;
}

/** The error when cloudflared must be installed and the user did not accept the Cloudflare license. */
export class ShareConsentError extends Error {
  constructor() {
    super("Accept the Cloudflare license before comarkserv installs cloudflared.");
    this.name = "ShareConsentError";
  }
}

/** Returns true when untun installed cloudflared already, so no consent is necessary. */
export function isCloudflaredInstalled(): boolean {
  const directory = join(tmpdir(), "node-untun");
  return (
    existsSync(directory) && readdirSync(directory).some((name) => name.startsWith("cloudflared"))
  );
}

const untunTunnel: StartTunnel = async (options) => {
  const { startTunnel } = await import("untun");
  return startTunnel(options);
};

export function createShareService(options: ShareServiceOptions = {}): ShareService {
  const startTunnel = options.startTunnel ?? untunTunnel;
  const isInstalled = options.isInstalled ?? isCloudflaredInstalled;
  const listeners = new Set<(status: ShareStatus) => void>();
  let tunnel: Tunnel | undefined;
  let url: string | undefined;
  let starting: Promise<string> | undefined;
  let error: string | undefined;

  const status = (): ShareStatus => ({
    state: url ? "on" : starting ? "starting" : "off",
    ...(url ? { url } : {}),
    needsConsent: !isInstalled(),
    ...(error ? { error } : {}),
  });
  const notify = () => {
    const current = status();
    for (const listener of listeners) listener(current);
  };

  const start = async (request: { origin: string; accept?: boolean }): Promise<string> => {
    if (url) return url;
    if (starting) return starting;
    // untun answers its own prompt with yes when there is no terminal, so the
    // consent must come from the caller, before cloudflared is installed.
    const accept = request.accept === true;
    if (!accept && !isInstalled()) throw new ShareConsentError();
    error = undefined;
    starting = (async () => {
      const started = await startTunnel({ url: request.origin, acceptCloudflareNotice: accept });
      if (!started) throw new Error("The tunnel did not start.");
      const publicUrl = await started.getURL();
      tunnel = started;
      url = publicUrl;
      return publicUrl;
    })();
    notify();
    try {
      return await starting;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      starting = undefined;
      notify();
    }
  };

  const stop = async () => {
    const running = tunnel;
    tunnel = undefined;
    url = undefined;
    if (running) {
      await running.close();
      notify();
    }
  };

  return {
    status,
    start,
    stop,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

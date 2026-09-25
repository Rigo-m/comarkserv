import { styleText } from "node:util";
import { checkPort, getPort } from "get-port-please";
import { serve } from "srvx";
import type { ServerMiddleware } from "srvx";
import { createHandler, INTERNAL_PREFIX } from "./handler.ts";
import type { ComarkservHandler, ComarkservOptions } from "./handler.ts";

export interface ServeOptions extends ComarkservOptions {
  /** The port to listen on. @default 8642 */
  port?: number;
  /** The host to listen on. Use `0.0.0.0` to accept connections from the network. @default "localhost" */
  host?: string;
  /** Fail when the port is in use. When false, the server uses the next free port. @default false */
  strictPort?: boolean;
  /** Print a line for each request. @default false */
  log?: boolean;
}

export interface ComarkservServer {
  /** The URL of the server, with a trailing slash. */
  url: string;
  port: number;
  host: string;
  handler: ComarkservHandler;
  /** Stops the server, the file watcher and the open connections. */
  close: () => Promise<void>;
}

export const DEFAULT_PORT = 8642;

/** Returns the first free port from `start`. With `strict`, it rejects when `start` is in use. */
export async function findPort(start: number, host: string, strict: boolean): Promise<number> {
  if (start === 0) return 0;
  if (!strict) {
    return getPort({
      port: start,
      portRange: [start, start + 20],
      alternativePortRange: [start + 21, start + 100],
      host,
    });
  }
  if (await checkPort(start, host)) return start;
  throw new Error(`Port ${start} is in use. Choose another port, or remove --strict-port.`);
}

function statusColor(status: number): "green" | "cyan" | "yellow" | "red" {
  if (status >= 500) return "red";
  if (status >= 400) return "yellow";
  if (status >= 300) return "cyan";
  return "green";
}

const logger: ServerMiddleware = async (request, next) => {
  const started = performance.now();
  const response = await next();
  const { pathname, search } = new URL(request.url);
  if (!pathname.startsWith(INTERNAL_PREFIX)) {
    const time = new Date().toLocaleTimeString("en-GB");
    const ms = (performance.now() - started).toFixed(1);
    console.log(
      `${styleText("dim", time)} ${styleText(statusColor(response.status), String(response.status))} ` +
        `${request.method} ${decodeURIComponent(pathname)}${search} ${styleText("dim", `${ms} ms`)}`,
    );
  }
  return response;
};

/** Starts a comarkserv server with srvx. */
export async function startServer(options: ServeOptions = {}): Promise<ComarkservServer> {
  const host = options.host ?? "localhost";
  const port = await findPort(options.port ?? DEFAULT_PORT, host, options.strictPort ?? false);
  const handler = createHandler(options);
  const server = serve({
    fetch: handler.fetch,
    port,
    hostname: host,
    silent: true,
    gracefulShutdown: false,
    middleware: options.log ? [logger] : [],
  });
  try {
    await server.ready();
  } catch (error) {
    await handler.close();
    throw error;
  }
  // The renderer loads after this function returns, so the caller can print its banner
  // first. Node can evaluate a dynamic import before the caller continues.
  setImmediate(() => void handler.warmup());
  const url = new URL(server.url ?? `http://${host}:${port}/`);
  // Show "localhost", not the address that it resolved to, such as [::1].
  if (host === "localhost" || url.hostname === "0.0.0.0" || url.hostname === "[::]") {
    url.hostname = "localhost";
  }
  return {
    url: url.href,
    port: Number(url.port) || port,
    host,
    handler,
    close: async () => {
      await handler.close();
      await server.close(true);
    },
  };
}

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { styleText } from "node:util";
import { defineCommand, runMain } from "citty";
import { basename, dirname, relative, resolve } from "pathe";
import { DEFAULT_PORT, startServer } from "./server.ts";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

function fail(message: string): never {
  console.error(styleText("red", `✖ ${message}`));
  process.exit(1);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function display(path: string): string {
  const local = relative(process.cwd(), path);
  return local === "" ? "." : local.startsWith("..") ? path : `./${local}`;
}

function networkUrls(port: number): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => `http://${address?.address}:${port}/`);
}

function openBrowser(url: string): void {
  const [command, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  spawn(command ?? "open", args, { stdio: "ignore", detached: true })
    .on("error", () => console.error(styleText("yellow", `Could not open a browser. Open ${url}`)))
    .unref();
}

const commonArgs = {
  "line-numbers": { type: "boolean", description: "Show line numbers on all code blocks" },
  dotfiles: { type: "boolean", description: "Include dotfiles, such as .github/" },
} as const;

const serveCommand = defineCommand({
  meta: {
    name: "comarkserv",
    version,
    description:
      "Serve markdown as HTML, with live reload. For a static site, run `comarkserv build --help`.",
  },
  args: {
    path: {
      type: "positional",
      description: "The directory or markdown file to serve",
      default: ".",
    },
    port: {
      type: "string",
      alias: "p",
      description: "The port. When it is in use, comarkserv uses the next free port",
      default: String(DEFAULT_PORT),
    },
    host: {
      type: "string",
      alias: "H",
      description: "The host. Use 0.0.0.0 to accept connections from the network",
      default: "localhost",
    },
    open: { type: "boolean", alias: "o", description: "Open the page in the browser" },
    livereload: {
      type: "boolean",
      default: true,
      description: "Update open pages when files change",
      negativeDescription: "Do not watch the files",
    },
    "strict-port": { type: "boolean", description: "Stop when the port is in use" },
    silent: { type: "boolean", alias: "s", description: "Do not print the requests" },
    ...commonArgs,
  },
  async run({ args }) {
    const target = resolve(args.path);
    if (!existsSync(target)) fail(`There is no file or directory at ${target}.`);
    const isFile = statSync(target).isFile();
    const port = Number(args.port);
    if (!Number.isInteger(port) || port < 0 || port > 65_535)
      fail("--port must be a number from 0 to 65535.");

    const server = await startServer({
      root: isFile ? dirname(target) : target,
      port,
      host: args.host,
      strictPort: args["strict-port"],
      livereload: args.livereload,
      lineNumbers: args["line-numbers"],
      dotfiles: args.dotfiles,
      log: !args.silent,
    }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
    const url = isFile
      ? new URL(encodeURIComponent(basename(target)), server.url).href
      : server.url;

    const label = (name: string) => styleText("dim", name.padEnd(9));
    const lines = [
      "",
      `  ${styleText("bold", styleText("magenta", "comarkserv"))} ${styleText("dim", `v${version}`)}  ` +
        styleText("dim", `ready in ${Math.round(performance.now())} ms`),
      "",
      `  ${label("Local")}${styleText("cyan", url)}`,
      ...(args.host === "0.0.0.0" || args.host === "::"
        ? networkUrls(server.port).map(
            (address) => `  ${label("Network")}${styleText("cyan", address)}`,
          )
        : []),
      `  ${label("Root")}${display(server.handler.root)}`,
      `  ${label("Reload")}${args.livereload ? "on" : "off"}`,
      "",
      styleText("dim", "  Press Ctrl+C to stop."),
      "",
    ];
    console.log(lines.join("\n"));
    if (server.port !== port && port !== 0) {
      console.log(
        styleText("yellow", `  Port ${port} is in use, so comarkserv uses port ${server.port}.\n`),
      );
    }
    if (args.open) openBrowser(url);

    const stop = () => {
      void server.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  },
});

const buildCommand = defineCommand({
  meta: {
    name: "comarkserv build",
    version,
    description: "Build a static HTML site from a directory of markdown",
  },
  args: {
    path: { type: "positional", description: "The directory to build", default: "." },
    out: {
      type: "string",
      alias: "o",
      description: "The output directory. comarkserv deletes an earlier build in it",
      default: "dist",
    },
    ...commonArgs,
  },
  async run({ args }) {
    const root = resolve(args.path);
    if (!existsSync(root) || !statSync(root).isDirectory())
      fail(`There is no directory at ${root}.`);
    // The build module loads only for this command.
    const { build } = await import("./build.ts");
    const result = await build({
      root,
      outDir: resolve(args.out),
      lineNumbers: args["line-numbers"],
      dotfiles: args.dotfiles,
    }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
    console.log(
      `${styleText("green", "✓")} Built ${plural(result.pages, "page")} and copied ${plural(result.files, "file")} ` +
        `to ${display(result.outDir)} in ${Math.round(result.ms)} ms`,
    );
  },
});

// citty reads a path argument as a subcommand name, so the build command is found here.
const argv = process.argv.slice(2);
if (argv[0] === "build") await runMain(buildCommand, { rawArgs: argv.slice(1) });
else await runMain(serveCommand, { rawArgs: argv });

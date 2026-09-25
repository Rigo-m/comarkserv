// Compares comarkserv with markserv: install size, startup, memory and render speed.
//
//   vp run bench                 # pack comarkserv, run the benchmark, print a table
//   vp run bench --update-readme # also write the table into README.md
//
// Both servers run as installed from npm, with the same Node.js, the same
// corpus and their default options (live reload on). The client asks for no
// compression, so the numbers show the work of the servers.

import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { Agent, get } from "node:http";
import { createServer } from "node:net";
import { arch, cpus, platform, release, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { writeCorpus } from "./corpus.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const cache = join(here, ".cache");
const MARKSERV_VERSION = "1.20.0";
const PAGE = "/docs/page-042.md";
const HEADERS = { "accept-encoding": "identity" };

const { values: options } = parseArgs({
  options: {
    runs: { type: "string", default: "5" },
    seconds: { type: "string", default: "5" },
    concurrency: { type: "string", default: "16" },
    "update-readme": { type: "boolean", default: false },
  },
});
const RUNS = Number(options.runs);
const SECONDS = Number(options.seconds);
const CONCURRENCY = Number(options.concurrency);

interface Contender {
  name: string;
  version: string;
  bin: string;
  args: (root: string, port: number) => string[];
  footprint: { megabytes: number; packages: number };
}

interface Result {
  install: string;
  startup: number;
  idle: number;
  cold: number;
  warm: number;
  large: number;
  edit: number;
  rps: number;
  peak: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

const log = (message: string) => process.stderr.write(`${message}\n`);

async function times(count: number, task: (index: number) => Promise<number>): Promise<number[]> {
  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(await task(i));
  return values;
}

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function countPackages(modules: string): Promise<number> {
  if (!existsSync(modules)) return 0;
  let count = 0;
  for (const name of await readdir(modules)) {
    if (name.startsWith(".")) continue;
    const names = name.startsWith("@")
      ? (await readdir(join(modules, name))).map((scoped) => `${name}/${scoped}`)
      : [name];
    for (const pkg of names) {
      if (!existsSync(join(modules, pkg, "package.json"))) continue;
      count += 1 + (await countPackages(join(modules, pkg, "node_modules")));
    }
  }
  return count;
}

async function installFrom(spec: string, directory: string) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), '{ "private": true }\n');
  run("npm", ["install", "--no-audit", "--no-fund", "--silent", spec], directory);
  const kilobytes = Number(run("du", ["-sk", "node_modules"], directory).split(/\s/)[0]);
  return {
    megabytes: kilobytes / 1024,
    packages: await countPackages(join(directory, "node_modules")),
  };
}

async function prepare(): Promise<Contender[]> {
  await mkdir(cache, { recursive: true });
  const { version } = JSON.parse(await readFile(join(repo, "package.json"), "utf8")) as {
    version: string;
  };
  log("Packing comarkserv...");
  const packed = join(cache, "pack");
  await rm(packed, { recursive: true, force: true });
  run("pnpm", ["pack", "--pack-destination", packed], repo);
  const tarball = join(packed, (await readdir(packed)).find((name) => name.endsWith(".tgz")) ?? "");
  log("Installing comarkserv from the tarball...");
  const comarkserv = join(cache, "comarkserv");
  const comarkservFootprint = await installFrom(tarball, comarkserv);
  const markserv = join(cache, `markserv-${MARKSERV_VERSION}`);
  log(`Installing markserv ${MARKSERV_VERSION}...`);
  const markservFootprint = await installFrom(`markserv@${MARKSERV_VERSION}`, markserv);
  return [
    {
      name: "comarkserv",
      version,
      bin: join(comarkserv, "node_modules/comarkserv/dist/cli.mjs"),
      args: (root, port) => [root, "--port", String(port), "--strict-port", "--silent"],
      footprint: comarkservFootprint,
    },
    {
      name: "markserv",
      version: MARKSERV_VERSION,
      bin: join(markserv, "node_modules/markserv/lib/cli.js"),
      args: (root, port) => [root, "--port", String(port), "--no-browser", "--silent"],
      footprint: markservFootprint,
    },
  ];
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "localhost", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => done(port));
    });
  });
}

// node:http, not fetch: the fetch of Node.js 24 can throw an uncaught error on a
// socket that closes while a server starts. Keep-alive sockets make the numbers
// show the server, not the TCP handshakes.
const agent = new Agent({ keepAlive: true, maxSockets: 256 });

function request(port: number, path: string, keepAlive = true): Promise<number> {
  return new Promise((done, fail) => {
    const started = performance.now();
    const outgoing = get(
      { host: "localhost", port, path, headers: HEADERS, agent: keepAlive ? agent : false },
      (response) => {
        response.resume();
        response.on("error", fail);
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 500)
            fail(new Error(`${path} answered ${response.statusCode}`));
          else done(performance.now() - started);
        });
      },
    );
    outgoing.on("error", fail);
  });
}

async function start(contender: Contender, root: string) {
  const port = await freePort();
  const started = performance.now();
  const child = spawn(process.execPath, [contender.bin, ...contender.args(root, port)], {
    stdio: "ignore",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  for (;;) {
    if (child.exitCode !== null)
      throw new Error(`${contender.name} stopped with code ${child.exitCode}`);
    try {
      await request(port, "/", false);
      return { child, port, startup: performance.now() - started };
    } catch {
      await new Promise((done) => setTimeout(done, 5));
    }
  }
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((done) => setTimeout(done, 3000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function rss(pid: number | undefined): number {
  if (!pid) return Number.NaN;
  return Number(run("ps", ["-o", "rss=", "-p", String(pid)], repo).trim()) / 1024;
}

async function load(port: number, pid: number | undefined, paths: string[]) {
  const end = performance.now() + SECONDS * 1000;
  let done = 0;
  let peak = rss(pid);
  const sampler = setInterval(() => (peak = Math.max(peak, rss(pid))), 100);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async (_, worker) => {
      for (let i = worker; performance.now() < end; i += CONCURRENCY) {
        await request(port, paths[i % paths.length] ?? PAGE);
        done++;
      }
    }),
  );
  clearInterval(sampler);
  return { rps: done / SECONDS, peak };
}

async function measure(contender: Contender, root: string, pages: string[]): Promise<Result> {
  log(`\n${contender.name} ${contender.version}`);
  // Each run starts a fresh process: the startup time, then the first render of a
  // page that the server has not rendered before, after a short idle time.
  const startups: number[] = [];
  const colds: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const { child, port, startup } = await start(contender, root);
    startups.push(startup);
    await new Promise((done) => setTimeout(done, 500));
    colds.push(await request(port, PAGE));
    await stop(child);
  }
  log(`  startup: ${startups.map((ms) => ms.toFixed(0)).join(", ")} ms`);
  log(`  first render: ${colds.map((ms) => ms.toFixed(0)).join(", ")} ms`);

  const { child, port } = await start(contender, root);
  try {
    await new Promise((done) => setTimeout(done, 1000));
    const idle = rss(child.pid);
    await request(port, PAGE);
    const warm = median(await times(200, () => request(port, PAGE)));
    await request(port, "/large.md");
    const large = median(await times(20, () => request(port, "/large.md")));
    const file = join(root, PAGE);
    const edit = median(
      await times(20, async (i) => {
        await appendFile(file, `\nAn edit, number ${i}.\n`);
        return request(port, PAGE);
      }),
    );
    for (const page of pages) await request(port, page);
    const { rps, peak } = await load(port, child.pid, pages);
    const result: Result = {
      install: `${contender.footprint.megabytes.toFixed(0)} MB, ${contender.footprint.packages} packages`,
      startup: median(startups),
      idle,
      cold: median(colds),
      warm,
      large,
      edit,
      rps,
      peak,
    };
    log(`  ${JSON.stringify(result)}`);
    return result;
  } finally {
    await stop(child);
  }
}

function environment(): string {
  let system = `${platform()} ${release()}`;
  if (platform() === "darwin") {
    try {
      system = `macOS ${run("sw_vers", ["-productVersion"], repo).trim()}`;
    } catch {
      // sw_vers is not available.
    }
  }
  const cpu = cpus()[0]?.model.trim() ?? "unknown CPU";
  const memory = Math.round(totalmem() / 1024 ** 3);
  return `${system} (${arch()}), ${cpu}, ${memory} GB, Node.js ${process.versions.node}`;
}

function table(contenders: Contender[], results: Result[]): string {
  const [a, b] = results as [Result, Result];
  const ms = (value: number) => (value < 10 ? `${value.toFixed(1)} ms` : `${value.toFixed(0)} ms`);
  const mb = (value: number) => `${value.toFixed(0)} MB`;
  // The last column says how much better comarkserv is than markserv.
  // A difference of 10% or less is in the noise between runs.
  const compare = (x: number, y: number, better: string, worse: string) => {
    const ratio = Math.max(x, y) / Math.min(x, y);
    if (ratio < 1.1) return "about the same";
    return `${ratio.toFixed(1)}× ${x <= y ? better : worse}`;
  };
  const lower = (x: number, y: number) => compare(x, y, "less", "more");
  const faster = (x: number, y: number) => compare(x, y, "faster", "slower");
  const [ca, cb] = contenders as [Contender, Contender];
  const rows = [
    ["Install size", a.install, b.install, lower(ca.footprint.megabytes, cb.footprint.megabytes)],
    ["Startup, to the first response", ms(a.startup), ms(b.startup), faster(a.startup, b.startup)],
    ["Memory at idle (RSS)", mb(a.idle), mb(b.idle), lower(a.idle, b.idle)],
    ["First render of a page", ms(a.cold), ms(b.cold), faster(a.cold, b.cold)],
    ["Page, repeated request (median)", ms(a.warm), ms(b.warm), faster(a.warm, b.warm)],
    ["Page after an edit (median)", ms(a.edit), ms(b.edit), faster(a.edit, b.edit)],
    [`Large page, ${LARGE_KB} KB (median)`, ms(a.large), ms(b.large), faster(a.large, b.large)],
    [
      `Throughput, ${CONCURRENCY} connections`,
      `${a.rps.toFixed(0)} req/s`,
      `${b.rps.toFixed(0)} req/s`,
      faster(1 / a.rps, 1 / b.rps),
    ],
    ["Peak memory under load (RSS)", mb(a.peak), mb(b.peak), lower(a.peak, b.peak)],
  ];
  const header = `| | comarkserv ${ca.version} | markserv ${cb.version} | comarkserv |\n| --- | ---: | ---: | --- |`;
  return `${header}\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}`;
}

const contenders = await prepare();
const root = await mkdtemp(join(tmpdir(), "comarkserv-bench-"));
let LARGE_KB = 0;
try {
  await writeCorpus(root);
  LARGE_KB = Math.round((await stat(join(root, "large.md"))).size / 1024);
  const pages = (await readdir(join(root, "docs"))).map((name) => `/docs/${name}`);
  const results: Result[] = [];
  for (const contender of contenders) {
    // Each server gets a fresh copy of the corpus, because the edit test changes a page.
    await rm(root, { recursive: true, force: true });
    await writeCorpus(root);
    results.push(await measure(contender, root, pages));
  }
  const date = new Date().toISOString().slice(0, 10);
  const output = `${table(contenders, results)}\n\n_${environment()}, ${date}. Run \`vp run bench\` to measure on your machine._`;
  console.log(`\n${output}`);
  if (options["update-readme"]) {
    const readme = join(repo, "README.md");
    const text = await readFile(readme, "utf8");
    const next = text.replace(
      /<!-- bench:start -->[\s\S]*<!-- bench:end -->/,
      `<!-- bench:start -->\n${output}\n<!-- bench:end -->`,
    );
    if (next === text)
      throw new Error("README.md has no <!-- bench:start --> and <!-- bench:end --> markers.");
    await writeFile(readme, next);
    log("\nREADME.md updated.");
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

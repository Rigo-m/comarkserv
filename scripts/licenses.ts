// Writes dist/THIRD_PARTY_LICENSES.md with the licenses of the packages that
// `vp pack` bundles into dist/. The MIT license asks that its notice stays with
// the code, and the bundled code has no node_modules to carry the notice.
//
// The bundled packages are the devDependencies that are not tools, and their
// dependencies.

import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Manifest {
  name: string;
  version: string;
  license?: string;
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const TOOLS = new Set(["@types/node", "bumpp", "typescript", "vite-plus"]);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function findPackage(name: string, from: string): string | undefined {
  for (let directory = from; ; directory = dirname(directory)) {
    const manifest = join(directory, "node_modules", name, "package.json");
    if (existsSync(manifest)) return realpathSync(dirname(manifest));
    if (dirname(directory) === directory) return undefined;
  }
}

function readManifest(directory: string): Manifest {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as Manifest;
}

function licenseText(directory: string): string | undefined {
  const file = readdirSync(directory).find((name) =>
    /^(licen[cs]e|copying)(\.[a-z]+)?$/i.test(name),
  );
  return file ? readFileSync(join(directory, file), "utf8").trim() : undefined;
}

const project = readManifest(root);
const found = new Map<string, { manifest: Manifest; directory: string }>();
const queue = Object.keys(project.devDependencies ?? {})
  .filter((name) => !TOOLS.has(name))
  .map((name) => ({ name, from: root }));

while (queue.length > 0) {
  const next = queue.shift();
  if (!next) break;
  const directory = findPackage(next.name, next.from);
  if (!directory) throw new Error(`Cannot find the package ${next.name}. Run vp install.`);
  const manifest = readManifest(directory);
  const key = `${manifest.name}@${manifest.version}`;
  if (found.has(key)) continue;
  found.set(key, { manifest, directory });
  for (const name of Object.keys(manifest.dependencies ?? {}))
    queue.push({ name, from: directory });
}

const sections = [...found.values()]
  .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  .map(({ manifest, directory }) => {
    const repository =
      typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
    const text =
      licenseText(directory) ??
      `The package has no license file. Its license is ${manifest.license ?? "not given"}.`;
    return [
      `## ${manifest.name} ${manifest.version}`,
      "",
      `License: ${manifest.license ?? "not given"}${repository ? `  \nRepository: ${repository}` : ""}`,
      "",
      "```text",
      text,
      "```",
    ].join("\n");
  });

const output = join(root, "dist", "THIRD_PARTY_LICENSES.md");
writeFileSync(
  output,
  `# Third-party licenses\n\ncomarkserv bundles these ${sections.length} packages into dist/. Their licenses follow.\n\n${sections.join("\n\n")}\n`,
);
console.log(
  `Wrote the licenses of ${sections.length} bundled packages to dist/THIRD_PARTY_LICENSES.md.`,
);

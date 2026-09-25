import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface Fixture {
  root: string;
  write: (path: string, content: string) => Promise<void>;
  cleanup: () => Promise<void>;
}

/** Makes a temporary directory with the given files. */
export async function createFixture(files: Record<string, string>): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "comarkserv-"));
  const write = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  for (const [path, content] of Object.entries(files)) await write(path, content);
  return { root, write, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export const sampleFiles: Record<string, string> = {
  "README.md": "# Sample project\n\nRead me first.\n",
  "guide.md":
    "---\ntitle: The Guide\n---\n# Guide\n\n## Install\n\n```ts\nconst a = 1\n```\n\n### Deep **dive**\n\nSee [api](./docs/api.md).\n",
  "docs/api.md": "# API\n\n## createHandler\n\n## createHandler\n",
  "docs/notes.markdown": "# Notes\n",
  "site/index.md": "# Site home\n",
  "static/index.html":
    "<!doctype html><html><head><title>x</title></head><body>static</body></html>",
  "style.css": "body { color: red }\n",
  "big.md": `# Big\n\n${"Some paragraph text that repeats. ".repeat(400)}\n`,
  ".env": "SECRET=1\n",
  ".hidden/secret.md": "# Secret\n",
  "node_modules/pkg/readme.md": "# Dependency\n",
};

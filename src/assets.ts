import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { styles } from "./assets/styles.ts";
import { clientScript } from "./client.ts";

export interface Asset {
  body: string;
  type: string;
  /** A short content hash for the URL, so the browser can cache the file for a long time. */
  version: string;
}

export interface Assets {
  "app.css": Asset;
  "app.js": Asset;
  /** The directory with `katex.min.css` and the KaTeX fonts. */
  katexDir: string;
  /** A hash of the KaTeX stylesheet, for its URL. */
  katexVersion: string;
}

const require = createRequire(import.meta.url);

function hash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 10);
}

function asset(body: string, type: string): Asset {
  return { body, type, version: hash(body) };
}

let assets: Assets | undefined;

/** Returns the assets. The first call reads the theme from disk. Later calls use the cache. */
export function getAssets(): Assets {
  if (assets) return assets;
  const katexDir = dirname(require.resolve("katex"));
  assets = {
    "app.css": asset(
      `${styles}\n${readFileSync(require.resolve("@twinkleplop/theme-github"), "utf8")}`,
      "text/css; charset=utf-8",
    ),
    "app.js": asset(clientScript, "text/javascript; charset=utf-8"),
    katexDir,
    katexVersion: hash(readFileSync(join(katexDir, "katex.min.css"), "utf8")),
  };
  return assets;
}

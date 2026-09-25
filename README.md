<div align="center">

# comarkserv

**See your markdown as a web page while you write it.**

comarkserv serves a folder of markdown as HTML pages that update block by block while you type.
It is a modern [markserv](https://github.com/markserv/markserv), built on [Comark](https://comark.dev), [twinkleplop](https://twinkleplop.pngwn.at) and [srvx](https://srvx.h3.dev).

[![npm](https://img.shields.io/npm/v/comarkserv?color=8250df&label=npm)](https://www.npmjs.com/package/comarkserv)
[![node](https://img.shields.io/badge/node-%E2%89%A520.19-8250df)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-8250df)](./LICENSE)

</div>

```bash
npx comarkserv ./docs
```

![comarkserv shows a markdown page with highlighted code and a table of contents, in the Tokyo Night theme](https://raw.githubusercontent.com/Rigo-m/comarkserv/main/.github/media/hero.png)

## Why comarkserv

- **Fast.** The server is ready in about 130 ms. A repeated page takes less than 1 ms, and the throughput is about 9× that of markserv. See the [benchmarks](#benchmarks).
- **Small.** 22 MB and 28 packages installed, 12× less than markserv.
- **Live.** When you save, the page replaces only the blocks that changed and flashes them. The scroll position stays.
- **Modern markdown.** GFM, GitHub alerts, Comark components, code with titles and line highlights, math and Mermaid diagrams. The server renders math and diagrams, so the browser loads no JavaScript for them.
- **Search.** <kbd>⌘</kbd> <kbd>K</kbd> finds pages and headings in the whole folder.
- **580+ themes.** All base16, base24 and Omarchy themes, loaded when you choose one. comarkserv can also follow your Omarchy theme live.
- **Edit in place.** The Edit button, or <kbd>E</kbd>, opens the file in your editor at the section on the screen.
- **Share.** `--share` gives your colleagues a public URL and a QR code, through a Cloudflare tunnel.
- **Terminal.** `comarkserv cat` shows a markdown file in the terminal, with colored code and diagrams.
- **Static sites.** `comarkserv build` makes a site that works on any static host.
- **A library too.** A web-standard `fetch` handler for srvx, Bun, Deno or any server.

## Quick start

```bash
npx comarkserv                   # serve the current directory
npx comarkserv ./docs --open     # serve a directory and open the browser
npx comarkserv ./docs/guide.md   # serve the directory of a file, and open that file
npx comarkserv readme            # open the closest README, from here or a parent directory
npx comarkserv ./docs --share    # share the folder with a public URL
npx comarkserv cat README.md     # show a file in the terminal
```

Or install it:

```bash
pnpm add -g comarkserv           # or: npm install -g comarkserv
```

comarkserv needs Node.js 20.19 or later.

## comarkserv and markserv

### Features

| Feature                                                   | markserv 1.20              | comarkserv                                                       |
| --------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| Markdown                                                  | GFM (markdown-it)          | GFM and Comark components                                        |
| Syntax highlighting                                       | highlight.js               | twinkleplop, 15 languages, loaded on first use                   |
| Code block titles, line and word highlights, line numbers | —                          | ✓                                                                |
| GitHub alerts (`> [!NOTE]`)                               | —                          | ✓                                                                |
| Components: alerts, code groups, details                  | —                          | ✓                                                                |
| Math                                                      | MathJax, in the browser    | KaTeX, on the server                                             |
| Mermaid diagrams                                          | —                          | SVG, on the server                                               |
| Table of contents                                         | `[[toc]]` in the page      | Sidebar that marks the current section                           |
| Heading anchors                                           | ✓                          | ✓                                                                |
| Directory listing                                         | ✓                          | ✓, with the README below it                                      |
| Live reload                                               | Replaces the whole content | Replaces only the changed blocks, flashes them, keeps the scroll |
| Search of pages and headings                              | —                          | ✓                                                                |
| Themes                                                    | 4                          | GitHub light and dark, 580+ base16, base24 and Omarchy themes    |
| Live Omarchy theme sync                                   | —                          | ✓                                                                |
| Includes and templates (Markdown, HTML, LESS)             | ✓ (`--templates`)          | —                                                                |
| Open the closest README                                   | ✓ (`readme`)               | ✓ (`comarkserv readme`)                                          |
| Open the file in your editor, at the current section      | —                          | ✓                                                                |
| Share with a public URL and a QR code                     | —                          | ✓ (`--share`)                                                    |
| Show markdown in the terminal                             | —                          | ✓ (`comarkserv cat`)                                             |
| Static site build                                         | —                          | ✓                                                                |
| Library API                                               | —                          | ✓                                                                |

### Benchmarks

<!-- bench:start -->

|                                 |   comarkserv 0.1.0 |      markserv 1.20.0 | comarkserv  |
| ------------------------------- | -----------------: | -------------------: | ----------- |
| Install size                    | 22 MB, 28 packages | 276 MB, 277 packages | 12.4× less  |
| Startup, to the first response  |             131 ms |               235 ms | 1.8× faster |
| Memory at idle (RSS)            |              91 MB |               112 MB | 1.2× less   |
| First render of a page          |              24 ms |                31 ms | 1.3× faster |
| Page, repeated request (median) |             0.3 ms |               1.6 ms | 5.4× faster |
| Page after an edit (median)     |             1.4 ms |               1.7 ms | 1.2× faster |
| Large page, 301 KB (median)     |             4.0 ms |                35 ms | 8.7× faster |
| Throughput, 16 connections      |        10050 req/s |           1136 req/s | 8.8× faster |
| Peak memory under load (RSS)    |             310 MB |               353 MB | 1.1× less   |

_macOS 26.2 (arm64), Apple M4 Pro, 24 GB, Node.js 24.21.0, 2026-09-25. Run `vp run bench` to measure on your machine._
<!-- bench:end -->

**How the benchmark works** ([bench/run.ts](./bench/run.ts)):

- Both servers run as installed from npm: markserv from the registry, comarkserv from a packed tarball. They use the same Node.js and their default options, with live reload on.
- The corpus has 100 GFM pages of about 4 KB each, with code in four languages, and one large page. It uses no comarkserv syntax, so both servers do the same work.
- "Startup" and "First render" are medians of five fresh processes. The other rows come from one process: 200 repeated requests, 20 edits, and 5 seconds of load on 16 keep-alive connections over all 100 pages. The client runs on the same machine and asks for no compression.
- comarkserv keeps each rendered page until the file changes, and markserv renders the page on each request. That is the main reason for the difference in the "repeated request" and "throughput" rows. The "after an edit" row shows the real render cost. It is close for both servers, and it changes a little between runs.
- Peak memory under load changes more between runs than the other rows.

## Command line

### Serve

```bash
comarkserv [path] [options]
```

| Option                | Default     | Effect                                                                                |
| --------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `-p`, `--port <port>` | `8642`      | The port. When it is in use, comarkserv uses the next free port.                      |
| `--strict-port`       | off         | Stop when the port is in use.                                                         |
| `-H`, `--host <host>` | `localhost` | The host. Use `0.0.0.0` to accept connections from the network.                       |
| `-o`, `--open`        | off         | Open the page in the browser.                                                         |
| `--theme <name>`      | `github`    | The default theme. See [Themes](#themes).                                             |
| `--no-livereload`     | on          | Do not watch the files.                                                               |
| `--line-numbers`      | off         | Show line numbers on all code blocks.                                                 |
| `--dotfiles`          | off         | Serve and list dotfiles, such as `.github/`.                                          |
| `--share`             | off         | Share the pages at a public URL. See [Share with colleagues](#share-with-colleagues). |
| `-s`, `--silent`      | off         | Do not print the requests.                                                            |

Add `?raw` to the URL of a markdown file to get its source. The code button in the top bar does the same.

### Build a static site

```bash
comarkserv build ./docs --out site --theme base16:nord
```

The build writes one HTML page for each markdown file, a listing page for each directory without an `index.md`, the search index, the theme list, and the assets. It copies all other files.

- All links are relative, so the site works on any static host, in a subdirectory too.
- Links to `.md` files change to `.html`.
- You can open the pages from `file://`, but the search needs a server.
- The build deletes an earlier build in the output directory. It does not write to a directory that has other files.

### Open the closest README

```bash
comarkserv readme            # from the current directory
comarkserv readme ./src      # from another directory
```

`comarkserv readme` looks for a README in the directory, then in each parent directory, and serves the first one that it finds. It opens the browser. Use `--no-open` to stop that. It accepts the same options as `comarkserv`.

### Share with colleagues

```bash
comarkserv ./docs --share
```

`--share` starts a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) with [untun](https://github.com/unjs/untun), and prints a public URL and a QR code.

- Anyone with the URL can read the files in the folder, until you stop comarkserv. Dotfiles stay hidden.
- The Edit button is off, so nobody can open files in your editor.
- The first `--share` installs `cloudflared`. untun asks you to accept the Cloudflare license first, so run it one time in a terminal. With no terminal, comarkserv stops, unless you set `UNTUN_ACCEPT_CLOUDFLARE_NOTICE=1` to accept the license.

For a colleague on the same network, `--host 0.0.0.0` is enough. comarkserv then prints the network URL and a QR code for your phone.

### Show markdown in the terminal

```bash
comarkserv cat README.md
comarkserv cat docs/guide.md --no-pager | head
```

`comarkserv cat` uses the same parser and the same twinkleplop grammars as the server. It colors code, draws Mermaid diagrams as text, and shows alerts, tables and footnotes. A long file opens in `less`. Use `--no-pager` to print it, and `--no-color` to remove the colors.

### List the themes

```bash
comarkserv themes            # all themes
comarkserv themes gruvbox    # the themes with "gruvbox" in the id or the name
comarkserv theme base16:nord # the colors of one theme
```

Add `--json` to both commands for output that other tools can read.

### Keyboard shortcuts

| Keys                                                                    | Effect                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| <kbd>⌘</kbd> <kbd>K</kbd>, <kbd>Ctrl</kbd> <kbd>K</kbd> or <kbd>/</kbd> | Search the pages and headings                                                                |
| <kbd>↑</kbd> <kbd>↓</kbd>, <kbd>↵</kbd>                                 | Move in the results and open one                                                             |
| <kbd>⌘</kbd> <kbd>↵</kbd>                                               | Open the result in a new tab                                                                 |
| <kbd>E</kbd>                                                            | Open the file in your editor, at the section at the top of the screen                        |
| The palette button in the top bar                                       | Choose a theme: <kbd>↑</kbd> <kbd>↓</kbd> preview, <kbd>↵</kbd> keep, <kbd>esc</kbd> restore |

### Raycast

The [Raycast extension](./extras/raycast-extension) has three commands:

- **Preview Markdown** opens the file or folder that is selected in Finder.
- **Markdown Previews** shows the running previews and the recent folders. You can open, copy, stop and restart them.
- **Search Markdown Themes** searches the 580+ themes, shows their colors, and sets the default theme for new previews.

The extension is not in the Raycast Store yet. To use it now, run `npm install && npm run dev` in `extras/raycast-extension`. Raycast then loads it.

Two [Raycast script commands](https://github.com/raycast/script-commands) in [extras/raycast](./extras/raycast) do the basic part with no extension:

- **Preview Markdown** opens the file or folder that you select in Finder, or a path that you type. Each folder gets its own server, and a second preview of the same folder uses the server that runs.
- **Stop Markdown Previews** stops these servers.

To install them, put the two scripts in a folder, and add the folder in Raycast: **Settings → Extensions → Script Commands → Add Directories**.

```bash
mkdir -p ~/.config/raycast/comarkserv && cd ~/.config/raycast/comarkserv
curl -fsSLO https://raw.githubusercontent.com/Rigo-m/comarkserv/main/extras/raycast/comarkserv-preview.sh \
     -fsSLO https://raw.githubusercontent.com/Rigo-m/comarkserv/main/extras/raycast/comarkserv-stop.sh
chmod +x *.sh
```

The scripts use `comarkserv` when it is installed, and else `npx comarkserv`. To give more options, such as a theme, edit the `COMARKSERV_ARGS` line at the top of `comarkserv-preview.sh`, for example `COMARKSERV_ARGS="--theme omarchy"`.

## Writing markdown

comarkserv uses [Comark syntax](https://comark.dev): CommonMark, GFM, frontmatter and components. The [feature showcase](./playground/showcase.md) uses all of it.

### Code

````md
```ts {2} /total/ [math.ts]
const total = add(1, 2);
export { total };
```
````

- `{1,3-5}`: highlight lines
- `/word/`: highlight a word
- `[file.ts]` or `title="file.ts"`: a title
- `:line-numbers`, `:line-numbers=10`, `:no-line-numbers`: line numbers
- `` `const a = 1{:ts}` ``: highlighted inline code

The languages are Bash, CSS, Go, HTML, JavaScript, JSON, Markdown, Python, Rust, SQL, Svelte, TOML, TSX, TypeScript and YAML, with the common aliases (`sh`, `js`, `ts`, `py`, `yml`, `rs`, …). Other languages show as plain text. A fence with incorrect meta, such as a line number that is not in the block, shows the error on the page.

### Components

````md
> [!WARNING]
> GitHub alerts: NOTE, TIP, IMPORTANT, WARNING, CAUTION.

::tip{title="Optional title"}
Also ::note, ::info, ::warning, ::caution, ::danger, ::success, ::callout, ::alert{type="…"}.
::

::code-group

```bash [pnpm]
pnpm add comarkserv
```

```bash [npm]
npm install comarkserv
```

::

::details{summary="More"}
Hidden content.
::
````

Code groups remember the tab that you select, on all pages.

### Math and diagrams

Write math between `$…$` or `$$…$$`, and diagrams in a `mermaid` fence. The server renders both, so the browser loads no Mermaid or KaTeX JavaScript. The page loads the KaTeX stylesheet only when it has math.

## Themes

![The theme picker shows Rose Pine themes with color swatches, and the page shows a live preview of Rose Pine Dawn](https://raw.githubusercontent.com/Rigo-m/comarkserv/main/.github/media/picker.png)

The GitHub theme is built in, with light, dark and system modes. comarkserv also loads more than 580 themes from their own repositories, when you choose one:

| `--theme` value                     | Themes                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `github` (default)                  | Built in                                                                                    |
| `base16:<id>`                       | 351 base16 schemes from [tinted-theming/schemes](https://github.com/tinted-theming/schemes) |
| `base24:<id>`                       | 209 base24 schemes from the same repository                                                 |
| `omarchy:<id>`                      | The 22 themes of [Omarchy](https://github.com/basecamp/omarchy)                             |
| `omarchy`                           | The current Omarchy theme of this machine, live                                             |
| `./my-scheme.yaml`, `./colors.toml` | A local base16 or base24 scheme, or an Omarchy `colors.toml`, live                          |
| `https://…`                         | A scheme at a URL                                                                           |

- **The picker.** Click the palette button in the top bar, and type a part of a name. The arrow keys preview each theme on the whole page. <kbd>↵</kbd> keeps the theme in this browser, and <kbd>esc</kbd> restores the theme from before. **Default** follows the server again.
- **How it works.** A theme is 16 base16 colors. comarkserv maps the page colors and the syntax colors to the 16 slots, so each base16 and base24 scheme works. The keys of an Omarchy `colors.toml` map one-to-one to the slots, and its `accent` is used too.
- **Just in time.** comarkserv contains no theme data. The server downloads a theme the first time it is needed: the lists from [UNGH](https://ungh.cc), the files from `raw.githubusercontent.com`. It keeps them in `~/.cache/comarkserv/themes` (or `$XDG_CACHE_HOME`) and serves them to the browser. So the browser contacts no other server, and a theme works offline after its first use. The browser keeps the chosen palette, so each later page gets its theme before the first paint, with no request.
- **Omarchy sync.** With `--theme omarchy`, or with **Omarchy (live)** in the picker, open pages change their theme when you run `omarchy-theme-set`.
- **For theme authors.** With `--theme ./my-scheme.yaml`, comarkserv watches the file. Each save updates the open pages.
- **Static builds** contain the default theme in each page. Their picker loads the other themes from GitHub directly.

## Library

```ts
import { serve } from "srvx";
import { createHandler } from "comarkserv";

const app = createHandler({ root: "./docs", theme: "base16:nord" });
serve({ fetch: app.fetch });
```

`createHandler` returns a web-standard `fetch` handler, so it works with srvx, Bun, Deno, or any server that uses `Request` and `Response`.

| Export                                                    | Use                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `createHandler(options)`                                  | The request handler: pages, listings, assets, search, themes and live reload.            |
| `startServer(options)`                                    | Starts a server with srvx: port search, request log, clean shutdown.                     |
| `build(options)`                                          | Builds a static site.                                                                    |
| `createMarkdownRenderer(options)`                         | Markdown to HTML, with the title, the TOC, the frontmatter and the features of the page. |
| `createCodeHighlighter(options)`                          | The twinkleplop components for Comark, for your own renderer.                            |
| `createThemeStore(options)`, `parseTheme(text, id, name)` | Load, cache and read base16, base24 and Omarchy themes.                                  |
| `loadLanguage`, `resolveLanguage`                         | The lazy grammar registry.                                                               |

`createHandler`, `startServer` and `build` accept these options:

- `root`: the directory to serve or build
- `plugins`: more Comark plugins
- `components`: more Comark components, or replacements for the built-in ones
- `lineNumbers`, `dotfiles`, `livereload`
- `theme`: the default theme, as for `--theme`
- `themeStore`: replaces the store that downloads and caches the themes, for example to use no network
- `omarchyPath`: the `colors.toml` of the current Omarchy theme
- `editor`: show the Edit button (default `true`). Turn it off when other machines can reach the server.
- `openEditor`: replaces the function that opens a file in the editor

## How it stays fast

- The server listens before it imports Comark. The renderer loads right after that, before the first request needs it.
- Each twinkleplop grammar, KaTeX and the Mermaid renderer load only when a page needs them.
- A rendered page stays in memory until its file changes. A repeated request gets `304 Not Modified`.
- Pages are compressed with brotli or gzip one time, and the compressed bytes are cached.
- The assets have content hashes in their URLs, so browsers cache them for one year.
- Live reload sends only the changed paths. The page fetches itself and replaces only the changed blocks.
- The search index reads only titles and headings, with no full parse. After a change, it reads only the changed files.
- Mermaid SVGs are cached by source, so an edit elsewhere on the page does not render the diagram again.
- Themes load on first use, and from a disk cache after that. The theme list loads only when the picker opens, and each row loads its colors only when it comes into view.

Each response has a `Server-Timing` header with the render time.

## Security

comarkserv is a tool for your own files. It binds to `localhost` by default, and it does not serve dotfiles or files outside the root. Markdown can contain raw HTML and scripts, as on markserv. Do not serve markdown that you do not trust on a network.

The Edit button opens files in your editor, so its endpoint accepts only a POST from the page itself: the host name must be local (against DNS rebinding), the origin must match, and a custom header must be present (so another site needs a preflight, which the server does not answer). The path must be a visible file in the root. The CLI turns the button off for `--share` and for a host that is not local.

Theme files come from the network, and their colors go into CSS. So comarkserv accepts only hex colors from a theme, in the server and in the browser. The theme endpoint of the server downloads files only from the two theme repositories, so it is not an open proxy.

## Development

```bash
vp install         # install the dependencies
vp test            # run the tests
vp check           # format, lint and type check
vp pack            # build dist/
vp run playground  # serve playground/ from the source
vp run bench       # compare with markserv
```

To write a new benchmark table into this README, run `vp pack && node bench/run.ts --update-readme`.

## Credits

comarkserv builds on [markserv](https://github.com/markserv/markserv), [Comark](https://github.com/comarkdown/comark), [twinkleplop](https://github.com/pngwn/twinkleplop), [srvx](https://github.com/h3js/srvx), [KaTeX](https://katex.org), [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid), [chokidar](https://github.com/paulmillr/chokidar), [tinyglobby](https://github.com/SuperchupuDev/tinyglobby), [citty](https://github.com/unjs/citty), [get-port-please](https://github.com/unjs/get-port-please), [pathe](https://github.com/unjs/pathe) and [UNGH](https://github.com/unjs/ungh). The themes come from [tinted-theming](https://github.com/tinted-theming/schemes) and [Omarchy](https://github.com/basecamp/omarchy).

## License

[MIT](./LICENSE)

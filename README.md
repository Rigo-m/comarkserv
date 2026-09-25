# comarkserv

Serve a directory of markdown as fast HTML pages that update while you type. comarkserv is a modern [markserv](https://github.com/markserv/markserv): it renders with [Comark](https://comark.dev), highlights code with [twinkleplop](https://twinkleplop.pngwn.at), and serves with [srvx](https://srvx.h3.dev).

```bash
npx comarkserv ./docs
```

## Features

| Feature                                                         |     markserv     |                                    comarkserv                                    |
| --------------------------------------------------------------- | :--------------: | :------------------------------------------------------------------------------: |
| GitHub flavored markdown, frontmatter                           |        ✓         |                                        ✓                                         |
| Directory listing                                               |        ✓         |                           ✓, with the README below it                            |
| Live reload                                                     | Reloads the page | Replaces only the changed blocks, keeps the scroll position, flashes the change  |
| Syntax highlighting                                             |   highlight.js   |                  twinkleplop, 15 languages, loaded on first use                  |
| Code block meta: titles, line and word highlights, line numbers |                  |                                        ✓                                         |
| Components (`::tip`, `::code-group`, `::details`, …)            |                  |                                        ✓                                         |
| GitHub alerts (`> [!NOTE]`)                                     |                  |                                        ✓                                         |
| Math (KaTeX)                                                    |                  |                            ✓, rendered on the server                             |
| Mermaid diagrams                                                |                  |                         ✓, rendered to SVG on the server                         |
| Search of pages and headings (<kbd>⌘</kbd> <kbd>K</kbd>)        |                  |                                        ✓                                         |
| Table of contents with the current section                      |                  |                                        ✓                                         |
| Themes                                                          |                  | GitHub light and dark, 580+ base16, base24 and Omarchy themes, live Omarchy sync |
| Static site build                                               |                  |                                        ✓                                         |
| Library API (`fetch` handler)                                   |                  |                                        ✓                                         |

## Install

```bash
pnpm add -g comarkserv   # or: npm install -g comarkserv
```

comarkserv needs Node.js 20.19 or later.

## Serve

```bash
comarkserv                  # serve the current directory
comarkserv ./docs --open    # serve a directory and open the browser
comarkserv ./docs/guide.md  # serve the directory of a file, and open that file
```

| Option                | Default     | Effect                                                           |
| --------------------- | ----------- | ---------------------------------------------------------------- |
| `-p`, `--port <port>` | `8642`      | The port. When it is in use, comarkserv uses the next free port. |
| `--strict-port`       | off         | Stop when the port is in use.                                    |
| `-H`, `--host <host>` | `localhost` | The host. Use `0.0.0.0` to accept connections from the network.  |
| `-o`, `--open`        | off         | Open the page in the browser.                                    |
| `--no-livereload`     | on          | Do not watch the files.                                          |
| `--line-numbers`      | off         | Show line numbers on all code blocks.                            |
| `--dotfiles`          | off         | Serve and list dotfiles, such as `.github/`.                     |
| `--theme <name>`      | `github`    | The default theme. See [Themes](#themes).                        |
| `-s`, `--silent`      | off         | Do not print the requests.                                       |

Add `?raw` to the URL of a markdown file to get its source. The code button in the top bar does the same.

### Keyboard shortcuts

| Keys                                                                    | Effect                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| <kbd>⌘</kbd> <kbd>K</kbd>, <kbd>Ctrl</kbd> <kbd>K</kbd> or <kbd>/</kbd> | Search the pages and headings                                                                |
| <kbd>↑</kbd> <kbd>↓</kbd>, <kbd>↵</kbd>                                 | Move in the results and open one                                                             |
| <kbd>⌘</kbd> <kbd>↵</kbd>                                               | Open the result in a new tab                                                                 |
| The palette button in the top bar                                       | Choose a theme: <kbd>↑</kbd> <kbd>↓</kbd> preview, <kbd>↵</kbd> keep, <kbd>esc</kbd> restore |

## Build a static site

```bash
comarkserv build ./docs --out site
```

The build writes one HTML page for each markdown file, a listing page for each directory without an `index.md`, the search index, and the assets. It copies all other files. All links are relative, so the site works on any static host, in a subdirectory too. You can also open the pages from `file://`, but the search needs a server. Links to `.md` files change to `.html`.

The build deletes an earlier build in the output directory. It does not write to a directory that has other files.

## Themes

The GitHub theme is built in, with light, dark and system modes. comarkserv also loads more than 580 themes from their own repositories, when a page needs them:

| `--theme` value                     | Themes                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `github` (default)                  | Built in                                                                                    |
| `base16:<id>`                       | 351 base16 schemes from [tinted-theming/schemes](https://github.com/tinted-theming/schemes) |
| `base24:<id>`                       | 209 base24 schemes from the same repository                                                 |
| `omarchy:<id>`                      | The 22 themes of [Omarchy](https://github.com/basecamp/omarchy)                             |
| `omarchy`                           | The current Omarchy theme of this machine, live                                             |
| `./my-scheme.yaml`, `./colors.toml` | A local base16 or base24 scheme, or an Omarchy `colors.toml`, live                          |
| `https://…`                         | A scheme at a URL                                                                           |

```bash
comarkserv themes gruvbox                         # find the id of a theme
comarkserv ./docs --theme base16:gruvbox-dark-hard
```

**The theme picker.** Click the palette button in the top bar, and type a part of a name. The arrow keys preview each theme on the whole page. <kbd>↵</kbd> keeps the theme in this browser, and <kbd>esc</kbd> restores the theme from before. **Default** follows the server again.

**How it works.** A theme is 16 base16 colors. comarkserv maps the page colors and the syntax colors to the 16 slots, so each base16 and base24 scheme works. The keys of an Omarchy `colors.toml` map one-to-one to the slots, and its `accent` is used too.

**Just in time.** comarkserv contains no theme data. The server downloads a theme the first time it is needed: the lists from [UNGH](https://ungh.cc), the files from `raw.githubusercontent.com`. It keeps them in `~/.cache/comarkserv/themes` (or `$XDG_CACHE_HOME`), and it serves them to the browser. So the browser contacts no other server, and a theme works offline after its first use. The browser keeps the chosen palette, so each later page gets its theme before the first paint, with no request.

**Omarchy sync.** With `--theme omarchy`, or with **Omarchy (live)** in the picker, open pages change their theme when you run `omarchy-theme-set`.

**For theme authors.** With `--theme ./my-scheme.yaml`, comarkserv watches the file. Each save updates the open pages.

**Static builds** contain the default theme in each page. Their picker loads the other themes from GitHub directly.

## Markdown

comarkserv uses [Comark syntax](https://comark.dev): CommonMark, GFM, frontmatter, and components.

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

## Library

```ts
import { serve } from "srvx";
import { createHandler } from "comarkserv";

const app = createHandler({ root: "./docs" });
serve({ fetch: app.fetch });
```

`createHandler` returns a web-standard `fetch` handler, so it works with srvx, Bun, Deno, or any server that uses `Request` and `Response`.

| Export                            | Use                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `createHandler(options)`          | The request handler: pages, listings, assets, search, and live reload.           |
| `startServer(options)`            | Starts a server with srvx: port search, request log, clean shutdown.             |
| `build(options)`                  | Builds a static site.                                                            |
| `createMarkdownRenderer(options)` | Markdown to HTML, with the title, TOC, frontmatter and the features of the page. |
| `createCodeHighlighter(options)`  | The twinkleplop components for Comark, for your own renderer.                    |
| `loadLanguage`, `resolveLanguage` | The lazy grammar registry.                                                       |

`createHandler`, `startServer` and `build` accept these options:

- `plugins`: more Comark plugins
- `components`: more Comark components, or replacements for the built-in ones
- `lineNumbers`, `dotfiles`, `livereload`
- `theme`: the default theme, as for `--theme`
- `themeStore`: replaces the store that downloads and caches the themes, for example to use no network
- `omarchyPath`: the `colors.toml` of the current Omarchy theme

## Performance

- The server listens before it imports Comark. The renderer loads right after, before the first request needs it.
- Each twinkleplop grammar, KaTeX and the Mermaid renderer load only when a page needs them.
- Rendered pages stay in memory until the file changes. A repeated request gets `304 Not Modified`.
- Pages are compressed with brotli or gzip one time, and the compressed bytes are cached.
- The assets have content hashes in their URLs, so browsers cache them for one year.
- Live reload sends only the changed paths. The page fetches itself and replaces only the changed blocks.
- The search index reads only titles and headings, with no full parse. After a change, it reads only the changed files.
- Mermaid SVGs are cached by source, so an edit elsewhere on the page does not render the diagram again.
- Themes load on first use, from a disk cache after that. The theme list loads only when the picker opens, and each row loads its colors only when it comes into view.

In local tests (macOS, Node.js 24), the server is ready 50–60 ms after the process starts with the default theme. A render of the [feature showcase](./playground/showcase.md) after an edit takes about 3 ms, and a cached response takes less than 1 ms. Each response has a `Server-Timing` header with the render time.

## Security

comarkserv is a tool for your own files. It binds to `localhost` by default, and it does not serve dotfiles or files outside the root. Markdown can contain raw HTML and scripts, as on markserv. Do not serve markdown that you do not trust on a network.

Theme files come from the network, and their colors go into CSS. So comarkserv accepts only hex colors from a theme, in the server and in the browser. The theme endpoint of the server downloads files only from the two theme repositories, so it is not an open proxy.

## Development

```bash
vp install         # install the dependencies
vp test            # run the tests
vp check           # format, lint and type check
vp pack            # build dist/
vp run playground  # serve playground/ from the source
```

## Credits

comarkserv builds on [markserv](https://github.com/markserv/markserv), [Comark](https://github.com/comarkdown/comark), [twinkleplop](https://github.com/pngwn/twinkleplop), [srvx](https://github.com/h3js/srvx), [KaTeX](https://katex.org), [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid), [chokidar](https://github.com/paulmillr/chokidar), [tinyglobby](https://github.com/SuperchupuDev/tinyglobby), [citty](https://github.com/unjs/citty), [get-port-please](https://github.com/unjs/get-port-please) and [pathe](https://github.com/unjs/pathe).

## License

MIT

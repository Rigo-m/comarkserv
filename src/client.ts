import { parseTheme } from "./theme-parse.ts";
import type { Palette } from "./theme-parse.ts";

/** Settings that the page gives to the client script, in the `#cms-config` JSON element. */
export interface ClientConfig {
  /** The URL prefix of the site root: `/` on the server, a relative path in a static build. */
  root: string;
  /** The URL of the search index. */
  search: string;
  /** The URL of the live reload event stream, or an empty string when live reload is off. */
  events: string;
  /** The URL of the theme catalog, or an empty string when there is none. */
  themes: string;
  /** The URL of the endpoint that opens the source in the editor, or an empty string when it is off. */
  edit: string;
  /** The source line of each heading, by heading id, so the editor opens at the section on the screen. */
  lines?: Record<string, number>;
  /** The URL path of the source of this page, from the site root. Live reload compares changes with it. */
  source: string;
  /** The type of page. */
  kind: "markdown" | "directory" | "html" | "status";
}

/** A theme choice: a palette, or a mode of the built-in GitHub theme. */
export type ThemeChoice = Palette | { mode: "system" | "light" | "dark" };

/** The theme functions that the head script gives to the client script. */
export interface ThemeRuntime {
  /** The theme of the server, or `null` for the built-in GitHub theme. */
  defaultTheme: Palette | null;
  /** Returns the choice of the viewer, or `null` when the viewer follows the default. */
  read: () => ThemeChoice | null;
  apply: (theme: ThemeChoice | null) => void;
  /** Returns the theme to show: the choice of the viewer, else the default. */
  current: () => ThemeChoice;
}

declare global {
  interface Window {
    __cms?: ThemeRuntime;
  }
}

/**
 * Applies the theme before the first paint, so the page does not flash. The page
 * puts it inline in the head, with the default theme of the server as its argument.
 * It must not use anything from outside its body.
 */
export function themeBoot(defaultTheme: Palette | null): void {
  const root = document.documentElement;
  const media = matchMedia("(prefers-color-scheme: dark)");
  const hex = /^#[0-9a-f]{6}$/i;
  const slots = "0123456789ABCDEF".split("").map((slot) => `--b0${slot}`);
  const isPalette = (theme: ThemeChoice | null): theme is Palette =>
    !!theme &&
    "colors" in theme &&
    Array.isArray(theme.colors) &&
    theme.colors.length === 16 &&
    theme.colors.every((color) => hex.test(color));
  const read = (): ThemeChoice | null => {
    try {
      const raw = localStorage.getItem("cms-theme");
      if (!raw) return null;
      return JSON.parse(raw) as ThemeChoice;
    } catch {
      return null;
    }
  };
  const apply = (theme: ThemeChoice | null) => {
    for (const slot of slots) root.style.removeProperty(slot);
    root.style.removeProperty("--b-accent");
    if (isPalette(theme)) {
      theme.colors.forEach((color, index) => root.style.setProperty(slots[index] ?? "", color));
      if (theme.accent && hex.test(theme.accent))
        root.style.setProperty("--b-accent", theme.accent);
      root.dataset.cmsPalette = theme.id;
      root.dataset.theme = "palette";
      root.classList.toggle("dark", theme.variant === "dark");
      return;
    }
    const mode = theme && "mode" in theme ? theme.mode : "system";
    delete root.dataset.cmsPalette;
    root.dataset.theme = mode;
    root.classList.toggle("dark", mode === "dark" || (mode === "system" && media.matches));
  };
  const runtime: ThemeRuntime = {
    defaultTheme,
    read,
    apply,
    current: () => read() ?? runtime.defaultTheme ?? { mode: "system" },
  };
  window.__cms = runtime;
  media.addEventListener("change", () => apply(runtime.current()));
  apply(runtime.current());
}

// The client runs in the browser. The server sends `client.toString()` with
// `parseTheme.toString()` as its argument, so the function must not use
// anything from outside its body.
export function client(parse: typeof parseTheme): void {
  const doc = document;
  const configText = doc.getElementById("cms-config")?.textContent;
  const config = JSON.parse(configText ?? "{}") as ClientConfig;
  const themes = window.__cms;
  const all = <T extends Element>(selector: string, scope: ParentNode = doc): T[] => [
    ...scope.querySelectorAll<T>(selector),
  ];
  const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  const svg = (paths: string) =>
    `<svg class="cms-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const ICON_COPY = svg(
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  );
  const ICON_CHECK = svg('<path d="m5 12 5 5L20 7"/>');
  const store = {
    get: (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key: string, value: string | null) => {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // Storage is not available, for example in a private window.
      }
    },
  };

  // Content: heading anchors, copy buttons and code group tabs.
  const content = doc.getElementById("cms-content");
  let pristine = content ? [...content.children].map((child) => child.outerHTML) : [];

  const copyText = async (text: string) => {
    if (navigator.clipboard && isSecureContext) return navigator.clipboard.writeText(text);
    const area = doc.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.append(area);
    area.select();
    doc.execCommand("copy");
    area.remove();
  };

  const enhance = (scope: ParentNode) => {
    for (const heading of all<HTMLElement>(":is(h1, h2, h3, h4, h5, h6)[id]", scope)) {
      if (heading.querySelector(".cms-anchor")) continue;
      const anchor = doc.createElement("a");
      anchor.className = "cms-anchor";
      anchor.href = `#${heading.id}`;
      anchor.textContent = "#";
      anchor.setAttribute("aria-label", "Link to this section");
      heading.prepend(anchor);
    }
    for (const pre of all<HTMLPreElement>("pre", scope)) {
      if (pre.closest(".cms-code-error, .cms-code") || !pre.querySelector("code")) continue;
      let host = pre.parentElement;
      if (!host?.matches("figure.twinkleplop-block")) {
        host = doc.createElement("div");
        host.className = "cms-code";
        pre.replaceWith(host);
        host.append(pre);
      }
      if (host.querySelector(":scope > .cms-copy")) continue;
      const button = doc.createElement("button");
      button.className = "cms-copy";
      button.type = "button";
      button.title = "Copy";
      button.innerHTML = ICON_COPY;
      host.append(button);
    }
    const tab = store.get("cms-tab");
    if (tab) selectTab(tab, scope);
  };

  const selectTab = (label: string, scope: ParentNode = doc) => {
    for (const group of all(".cms-code-group", scope)) {
      const buttons = all<HTMLButtonElement>(".cms-tabs button", group);
      const index = buttons.findIndex((button) => button.textContent === label);
      if (index < 0) continue;
      const panels = all<HTMLElement>(':scope > [role="tabpanel"]', group);
      buttons.forEach((button, i) => button.setAttribute("aria-selected", String(i === index)));
      panels.forEach((panel, i) => (panel.hidden = i !== index));
    }
  };

  doc.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const copy = target?.closest<HTMLButtonElement>(".cms-copy");
    if (copy) {
      const code = copy.parentElement?.querySelector("pre code")?.cloneNode(true);
      if (!(code instanceof Element)) return;
      for (const number of all(".ln", code)) number.remove();
      void copyText(code.textContent ?? "").then(() => {
        copy.innerHTML = ICON_CHECK;
        copy.dataset.copied = "";
        setTimeout(() => {
          copy.innerHTML = ICON_COPY;
          delete copy.dataset.copied;
        }, 1500);
      });
      return;
    }
    const tabButton = target?.closest<HTMLButtonElement>(".cms-tabs button");
    if (tabButton) {
      const label = tabButton.textContent ?? "";
      store.set("cms-tab", label);
      selectTab(label);
      return;
    }
    if (target?.closest("[data-cms-edit]")) void openEditor();
    else if (target?.closest("[data-cms-theme]")) openPalette("theme");
    else if (target?.closest("[data-cms-search]")) openPalette("search");
  });

  // Table of contents: marks the section that is at the top of the screen.
  let spyFrame = 0;
  const spy = () => {
    spyFrame = 0;
    const links = all<HTMLAnchorElement>("#cms-toc a");
    let active: HTMLAnchorElement | undefined;
    for (const link of links) {
      const target = doc.getElementById(decodeURIComponent(link.hash.slice(1)));
      if (target && target.getBoundingClientRect().top < 120) active = link;
    }
    active ??= links[0];
    for (const link of links) link.setAttribute("aria-current", String(link === active));
  };
  addEventListener("scroll", () => (spyFrame ||= requestAnimationFrame(spy)), { passive: true });

  // Edit: opens the source in the editor, at the section at the top of the screen.
  const editButton = doc.querySelector<HTMLButtonElement>("[data-cms-edit]");
  const currentLine = () => {
    let line = 1;
    for (const heading of all<HTMLElement>(":is(h1, h2, h3, h4, h5, h6)[id]", content ?? doc)) {
      if (heading.getBoundingClientRect().top > 120) break;
      line = config.lines?.[heading.id] ?? line;
    }
    return line;
  };
  const openEditor = async () => {
    if (!config.edit || config.kind !== "markdown") return;
    const response = await fetch(config.edit, {
      method: "POST",
      headers: { "content-type": "application/json", "x-comarkserv-edit": "1" },
      body: JSON.stringify({ path: config.source, line: currentLine() }),
    }).catch(() => undefined);
    if (!editButton) return;
    const error = response?.ok
      ? undefined
      : ((await response?.json().catch(() => undefined)) as { error?: string } | undefined)?.error;
    editButton.dataset.state = response?.ok ? "ok" : "error";
    editButton.title = response?.ok
      ? "Edit in your editor (E)"
      : (error ?? "The editor did not open");
    setTimeout(() => delete editButton.dataset.state, 1500);
  };

  // Fuzzy matching for the palette.
  const isBoundary = (char: string | undefined) => !char || /[\s/._\-›:]/.test(char);
  const fuzzy = (query: string, text: string): { score: number; hits: number[] } | undefined => {
    const lower = text.toLowerCase();
    const at = lower.indexOf(query);
    if (at >= 0) {
      const hits = Array.from({ length: query.length }, (_, i) => at + i);
      return {
        score: 100 + (isBoundary(lower[at - 1]) ? 40 : 0) - at * 0.5 - lower.length * 0.05,
        hits,
      };
    }
    const hits: number[] = [];
    let score = 0;
    let from = 0;
    for (const char of query) {
      if (char === " ") continue;
      const i = lower.indexOf(char, from);
      if (i < 0) return undefined;
      const last = hits.at(-1);
      score += last !== undefined && i === last + 1 ? 6 : isBoundary(lower[i - 1]) ? 4 : 1;
      hits.push(i);
      from = i + 1;
    }
    return { score: score - lower.length * 0.05, hits };
  };
  // The hits are UTF-16 indices from indexOf, so the loop uses the same indices.
  const mark = (text: string, hits: number[]) => {
    const set = new Set(hits);
    let html = "";
    for (let i = 0; i < text.length; i++) {
      const char = escape(text.charAt(i));
      html += set.has(i) ? `<mark>${char}</mark>` : char;
    }
    return html;
  };

  // Search: pages and headings.
  interface Entry {
    url: string;
    title: string;
    headings: { id: string; text: string; depth: number }[];
  }
  interface Item {
    title: string;
    path: string;
    url: string;
    page: boolean;
  }
  let index: Promise<Item[]> | undefined;
  const loadIndex = () =>
    (index ??= fetch(config.search)
      .then((response) => response.json() as Promise<Entry[]>)
      .then((entries) =>
        entries.flatMap((entry) => [
          {
            title: entry.title,
            path: entry.url,
            url: config.root + entry.url.slice(1),
            page: true,
          },
          ...entry.headings
            .filter((heading) => heading.depth > 1)
            .map((heading) => ({
              title: heading.text,
              path: `${entry.title} › ${entry.url}`,
              url: `${config.root}${entry.url.slice(1)}#${heading.id}`,
              page: false,
            })),
        ]),
      )
      .catch(() => {
        index = undefined;
        return [];
      }));

  const searchResults = async (needle: string) => {
    const items = await loadIndex();
    if (!needle) {
      return items
        .filter((item) => item.page)
        .map((item) => ({ item, titleHits: [], pathHits: [] }));
    }
    const results: { item: Item; score: number; titleHits: number[]; pathHits: number[] }[] = [];
    for (const item of items) {
      const title = fuzzy(needle, item.title);
      const path = fuzzy(needle, item.path);
      if (!title && !path) continue;
      const score =
        Math.max((title?.score ?? -Infinity) + 10, path?.score ?? -Infinity) + (item.page ? 8 : 0);
      results.push({
        item,
        score,
        titleHits: title?.hits ?? [],
        pathHits: title ? [] : (path?.hits ?? []),
      });
    }
    return results.sort((a, b) => b.score - a.score);
  };

  // Themes: the built-in GitHub modes, the server default and the catalog.
  interface ThemeEntry {
    id: string;
    name: string;
    source: string;
    url?: string;
    choice?: ThemeChoice;
    /** The swatches of a built-in theme. */
    colors?: string[];
  }
  const GITHUB_LIGHT = [
    "#ffffff",
    "#1f2328",
    "#cf222e",
    "#953800",
    "#9a6700",
    "#1a7f37",
    "#0969da",
    "#8250df",
  ];
  const GITHUB_DARK = [
    "#0d1117",
    "#e6edf3",
    "#ff7b72",
    "#ffa657",
    "#d29922",
    "#3fb950",
    "#58a6ff",
    "#d2a8ff",
  ];
  const builtIns = (): ThemeEntry[] => [
    ...(themes?.defaultTheme
      ? [
          {
            id: "default",
            name: `Default: ${themes.defaultTheme.name}`,
            source: "server",
            choice: themes.defaultTheme,
          },
        ]
      : []),
    {
      id: "github-system",
      name: "GitHub",
      source: "system",
      choice: { mode: "system" },
      colors: GITHUB_LIGHT,
    },
    {
      id: "github-light",
      name: "GitHub Light",
      source: "built-in",
      choice: { mode: "light" },
      colors: GITHUB_LIGHT,
    },
    {
      id: "github-dark",
      name: "GitHub Dark",
      source: "built-in",
      choice: { mode: "dark" },
      colors: GITHUB_DARK,
    },
  ];
  let catalog: Promise<ThemeEntry[]> | undefined;
  const loadCatalog = () =>
    (catalog ??= (config.themes ? fetch(config.themes) : Promise.reject(new Error("no catalog")))
      .then((response) => (response.ok ? (response.json() as Promise<ThemeEntry[]>) : []))
      .catch(() => {
        catalog = undefined;
        return [];
      }));
  const palettes = new Map<string, Promise<Palette | undefined>>();
  const loadTheme = (entry: ThemeEntry): Promise<ThemeChoice | undefined> => {
    if (entry.choice) return Promise.resolve(entry.choice);
    if (!entry.url) return Promise.resolve(undefined);
    let palette = palettes.get(entry.url);
    if (!palette) {
      palette = fetch(entry.url)
        .then((response) => (response.ok ? response.text() : ""))
        .then((text) => parse(text, entry.id, entry.name))
        .catch(() => undefined);
      palettes.set(entry.url, palette);
    }
    return palette;
  };
  // The swatches show the background, the text, then red, orange, yellow, green, blue and purple.
  const swatches = (colors: string[]) =>
    colors.map((color) => `<i style="background:${escape(color)}"></i>`).join("");
  const paletteSwatches = (theme: ThemeChoice) =>
    "colors" in theme
      ? [0, 5, 8, 9, 10, 11, 13, 14].map((slot) => theme.colors[slot] ?? "")
      : theme.mode === "dark"
        ? GITHUB_DARK
        : GITHUB_LIGHT;
  const choiceId = (theme: ThemeChoice | null) => {
    if (!theme) return themes?.defaultTheme ? "default" : "github-system";
    return "colors" in theme ? theme.id : `github-${theme.mode}`;
  };

  let themeEntries: ThemeEntry[] = [];
  const themeResults = async (needle: string) => {
    themeEntries = [...builtIns(), ...(await loadCatalog())];
    if (!needle) return themeEntries.map((entry) => ({ entry, hits: [] as number[] }));
    const results: { entry: ThemeEntry; score: number; hits: number[] }[] = [];
    for (const entry of themeEntries) {
      const match = fuzzy(needle, `${entry.name} ${entry.source}`);
      // The pinned entries come first when they match, before a catalog theme with a similar name.
      const pinned = !entry.url || entry.source === "omarchy-live";
      if (match)
        results.push({
          entry,
          score: match.score + (pinned ? 50 : 0),
          hits: match.hits.filter((hit) => hit < entry.name.length),
        });
    }
    return results.sort((a, b) => b.score - a.score);
  };

  // The palette dialog, in search mode or in theme mode.
  let palette: HTMLDialogElement | undefined;
  let mode: "search" | "theme" = "search";
  let selected = 0;
  let committed = false;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let swatchObserver: IntersectionObserver | undefined;

  const items = () => all<HTMLLIElement>("li[role=option]", palette);
  const select = (next: number) => {
    const list = items();
    selected = (next + list.length) % Math.max(list.length, 1);
    list.forEach((item, i) => item.setAttribute("aria-selected", String(i === selected)));
    list[selected]?.scrollIntoView({ block: "nearest" });
    if (mode === "theme") {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => void preview(list[selected]), 40);
    }
  };
  const entryOf = (item: Element | undefined) =>
    themeEntries[Number((item as HTMLElement | undefined)?.dataset.entry)];
  const preview = async (item: Element | undefined) => {
    const entry = entryOf(item);
    const theme = entry && (await loadTheme(entry));
    if (theme && item?.getAttribute("aria-selected") === "true") themes?.apply(theme);
  };
  const commitTheme = async (item: Element | undefined) => {
    const entry = entryOf(item);
    const theme = entry && (await loadTheme(entry));
    if (!entry || !theme) return;
    committed = true;
    store.set("cms-theme", entry.id === "default" ? null : JSON.stringify(theme));
    themes?.apply(themes.current());
    palette?.close();
  };

  const openPalette = (next: "search" | "theme") => {
    if (next === "theme" && !themes) return;
    if (!palette) {
      palette = doc.createElement("dialog");
      palette.className = "cms-palette";
      palette.innerHTML =
        '<input type="search" aria-label="Search" autocomplete="off" spellcheck="false">' +
        '<ul role="listbox"></ul>' +
        '<div class="cms-hint"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> <span class="cms-hint-enter">open</span></span><span><kbd>esc</kbd> close</span></div>';
      doc.body.append(palette);
      const input = palette.querySelector("input")!;
      input.addEventListener("input", () => void renderResults(input.value));
      input.addEventListener("keydown", (event) => {
        // A search input clears its text on the first Escape. The palette closes at once instead.
        if (event.key === "Escape") {
          event.preventDefault();
          palette?.close();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          select(selected + (event.key === "ArrowDown" ? 1 : -1));
        } else if (event.key === "Enter") {
          event.preventDefault();
          const item = items()[selected];
          if (mode === "theme") return void commitTheme(item);
          const link = item?.querySelector("a");
          if (!link) return;
          if (event.metaKey || event.ctrlKey) open(link.href, "_blank");
          else location.href = link.href;
          palette?.close();
        }
      });
      palette.addEventListener("click", (event) => {
        if (event.target === palette) return palette.close();
        const item =
          event.target instanceof Element ? event.target.closest("li[role=option]") : null;
        if (mode === "theme" && item) void commitTheme(item);
      });
      palette.addEventListener("mousemove", (event) => {
        const item =
          event.target instanceof Element ? event.target.closest("li[role=option]") : null;
        const index = item ? items().indexOf(item as HTMLLIElement) : -1;
        if (index >= 0 && index !== selected) select(index);
      });
      // Closing the theme mode with no choice shows the theme from before again.
      palette.addEventListener("close", () => {
        clearTimeout(previewTimer);
        if (mode === "theme" && !committed) themes?.apply(themes.current());
      });
    }
    mode = next;
    committed = false;
    const input = palette.querySelector("input")!;
    input.value = "";
    input.placeholder = mode === "theme" ? "Search 580+ themes" : "Search pages and headings";
    const enter = palette.querySelector(".cms-hint-enter");
    if (enter) enter.textContent = mode === "theme" ? "keep" : "open";
    palette.showModal();
    input.focus();
    void renderResults("");
  };

  // Each theme loads its swatches when it comes into view, so the list stays fast.
  const observeSwatches = (list: HTMLUListElement) => {
    swatchObserver?.disconnect();
    swatchObserver = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          swatchObserver?.unobserve(record.target);
          const entry = entryOf(record.target);
          const target = record.target.querySelector(".cms-swatches");
          if (!entry || !target) continue;
          if (entry.colors) target.innerHTML = swatches(entry.colors);
          else
            void loadTheme(entry).then(
              (theme) => theme && (target.innerHTML = swatches(paletteSwatches(theme))),
            );
        }
      },
      { root: list },
    );
    for (const item of items()) swatchObserver.observe(item);
  };

  const renderResults = async (query: string) => {
    const list = palette?.querySelector("ul");
    if (!list) return;
    const needle = query.trim().toLowerCase();
    const current = mode;
    let html: string;
    if (current === "theme") {
      const results = await themeResults(needle);
      const active = choiceId(themes?.read() ?? null);
      html = results
        .map(
          ({ entry, hits }, i) =>
            `<li role="option" aria-selected="${i === 0}" data-entry="${themeEntries.indexOf(entry)}"${entry.id === active ? " data-active" : ""}>` +
            `<div class="cms-hit cms-theme-hit"><span class="cms-hit-title">${mark(entry.name, hits)}<small>${escape(entry.source)}</small></span>` +
            `<span class="cms-swatches"></span></div></li>`,
        )
        .join("");
    } else {
      const results = await searchResults(needle);
      html = results
        .slice(0, 60)
        .map(
          ({ item, titleHits, pathHits }, i) =>
            `<li role="option" aria-selected="${i === 0}"><a class="cms-hit" href="${escape(item.url)}">` +
            `<span class="cms-hit-title">${item.page ? "" : "# "}${mark(item.title, titleHits)}</span>` +
            `<span class="cms-hit-path">${mark(item.path, pathHits)}</span></a></li>`,
        )
        .join("");
    }
    if (current !== mode) return;
    selected = 0;
    list.innerHTML = html || '<li class="cms-none">No results</li>';
    list.scrollTop = 0;
    if (current !== "theme") return;
    observeSwatches(list);
    // With no query, the list opens at the theme that is active now.
    const active = items().findIndex((item) => item.hasAttribute("data-active"));
    if (!needle && active > 0) select(active);
  };

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  for (const key of all("[data-cms-search] kbd")) key.textContent = isMac ? "⌘K" : "Ctrl K";
  addEventListener("keydown", (event) => {
    const typing =
      event.target instanceof HTMLElement &&
      event.target.closest("input, textarea, select, [contenteditable]");
    const modifier = event.metaKey || event.ctrlKey || event.altKey;
    if (event.key === "e" && !typing && !modifier && !palette?.open) {
      event.preventDefault();
      void openEditor();
      return;
    }
    if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
      event.preventDefault();
      if (palette?.open) palette.close();
      else openPalette("search");
    }
  });

  // Live reload.
  const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);
  let updating: Promise<void> | undefined;
  let again = false;

  const update = async () => {
    const started = performance.now();
    const response = await fetch(location.href, { cache: "no-store" });
    const next = new DOMParser().parseFromString(await response.text(), "text/html");
    const incoming = next.getElementById("cms-content");
    if (!content || !incoming) return location.reload();
    const nextPristine = [...incoming.children].map((child) => child.outerHTML);
    // Replace only the blocks between the same start and the same end.
    let start = 0;
    while (
      start < pristine.length &&
      start < nextPristine.length &&
      pristine[start] === nextPristine[start]
    )
      start++;
    let endOld = pristine.length;
    let endNew = nextPristine.length;
    while (endOld > start && endNew > start && pristine[endOld - 1] === nextPristine[endNew - 1]) {
      endOld--;
      endNew--;
    }
    const current = [...content.children];
    const added = [...incoming.children].slice(start, endNew);
    for (const child of current.slice(start, endOld)) child.remove();
    const anchor = content.children[start] ?? null;
    for (const child of added) content.insertBefore(doc.importNode(child, true), anchor);
    pristine = nextPristine;
    // An edit can move the headings, so the Edit button needs the new lines.
    const nextConfig = next.getElementById("cms-config")?.textContent;
    if (nextConfig) config.lines = (JSON.parse(nextConfig) as ClientConfig).lines;
    enhance(content);
    doc.title = next.title;
    const toc = doc.getElementById("cms-toc");
    const nextToc = next.getElementById("cms-toc");
    if (toc && nextToc) toc.innerHTML = nextToc.innerHTML;
    spy();
    // Flash each new block, and scroll to the first one when it is not on the screen.
    const inserted = [...content.children].slice(start, start + added.length);
    for (const block of inserted) {
      block.classList.remove("cms-changed");
      void (block as HTMLElement).offsetWidth;
      block.classList.add("cms-changed");
    }
    const box = inserted[0]?.getBoundingClientRect();
    if (box && (box.bottom < 64 || box.top > innerHeight)) {
      inserted[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    console.info(`[comarkserv] updated in ${Math.round(performance.now() - started)}ms`);
  };

  const scheduleUpdate = () => {
    if (updating) {
      again = true;
      return;
    }
    updating = update().finally(() => {
      updating = undefined;
      if (again) {
        again = false;
        scheduleUpdate();
      }
    });
  };

  const onChange = (paths: string[]) => {
    index = undefined;
    const source = config.source;
    const affected = paths.some(
      (path) => path === source || (config.kind === "directory" && parentOf(path) === source),
    );
    if (affected) {
      if (config.kind === "markdown" || config.kind === "directory") scheduleUpdate();
      else location.reload();
      return;
    }
    const changed = new Set(paths);
    for (const link of all<HTMLLinkElement>('link[rel="stylesheet"]')) {
      const url = new URL(link.href);
      if (!changed.has(url.pathname)) continue;
      const fresh = link.cloneNode() as HTMLLinkElement;
      url.searchParams.set("t", String(Date.now()));
      fresh.href = url.href;
      fresh.addEventListener("load", () => link.remove(), { once: true });
      link.after(fresh);
    }
    for (const image of all<HTMLImageElement>("img")) {
      const url = new URL(image.src);
      if (!changed.has(decodeURIComponent(url.pathname))) continue;
      url.searchParams.set("t", String(Date.now()));
      image.src = url.href;
    }
  };

  // A theme changed on the server: the default theme file, or the current Omarchy theme.
  const onTheme = (theme: Palette) => {
    if (!themes) return;
    const chosen = themes.read();
    if (chosen && "colors" in chosen && chosen.id === theme.id) {
      store.set("cms-theme", JSON.stringify(theme));
    } else if (!chosen && themes.defaultTheme?.id === theme.id) {
      themes.defaultTheme = theme;
    } else {
      return;
    }
    if (!(mode === "theme" && palette?.open)) themes.apply(themes.current());
  };

  if (config.events) {
    const indicator = doc.querySelector<HTMLElement>(".cms-live");
    let serverId: string | undefined;
    const events = new EventSource(config.events);
    events.addEventListener("hello", (event) => {
      const id = (JSON.parse(event.data) as { id: string }).id;
      // A new server id means that the server restarted, maybe with new options.
      if (serverId && serverId !== id) location.reload();
      serverId = id;
      if (indicator) {
        indicator.dataset.state = "open";
        indicator.title = "Live reload is on";
      }
    });
    events.addEventListener("change", (event) =>
      onChange((JSON.parse(event.data) as { paths: string[] }).paths),
    );
    events.addEventListener("theme", (event) =>
      onTheme((JSON.parse(event.data) as { theme: Palette }).theme),
    );
    events.addEventListener("error", () => {
      if (indicator) {
        indicator.dataset.state = "closed";
        indicator.title = "Live reload is off: the server does not answer";
      }
    });
    addEventListener("pagehide", () => events.close());
  }

  if (content) enhance(content);
  spy();
}

/** The client script, ready to serve. */
export const clientScript = `(${client.toString()})(${parseTheme.toString()});\n`;

/** The inline head script, with the default theme of the server. */
export function themeScript(defaultTheme: Palette | undefined): string {
  const json = JSON.stringify(defaultTheme ?? null).replace(/</g, "\\u003c");
  return `(${themeBoot.toString()})(${json});`;
}

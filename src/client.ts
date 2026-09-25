/** Settings that the page gives to the client script, in the `#cms-config` JSON element. */
export interface ClientConfig {
  /** The URL prefix of the site root: `/` on the server, a relative path in a static build. */
  root: string;
  /** The URL of the search index. */
  search: string;
  /** The URL of the live reload event stream, or an empty string when live reload is off. */
  events: string;
  /** The URL path of the source of this page, from the site root. Live reload compares changes with it. */
  source: string;
  /** The type of page. */
  kind: "markdown" | "directory" | "html" | "status";
}

// The client runs in the browser. The server sends `client.toString()`, so the
// function must not use anything from outside its body.
export function client(): void {
  const doc = document;
  const root = doc.documentElement;
  const configText = doc.getElementById("cms-config")?.textContent;
  const config = JSON.parse(configText ?? "{}") as ClientConfig;
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
    set: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Storage is not available, for example in a private window.
      }
    },
  };

  // Theme: system, light or dark. The inline head script sets it before the first paint.
  const media = matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = (theme: string) => {
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
  };
  media.addEventListener("change", () => applyTheme(store.get("cms-theme") ?? "system"));
  applyTheme(store.get("cms-theme") ?? "system");
  const nextTheme: Record<string, string> = { system: "light", light: "dark", dark: "system" };

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
    if (target?.closest("[data-cms-theme]")) {
      const theme = nextTheme[store.get("cms-theme") ?? "system"] ?? "system";
      store.set("cms-theme", theme);
      applyTheme(theme);
      return;
    }
    if (target?.closest("[data-cms-search]")) openPalette();
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

  // Search palette.
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

  const isBoundary = (char: string | undefined) => !char || /[\s/._\-›]/.test(char);
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

  let palette: HTMLDialogElement | undefined;
  let selected = 0;
  const openPalette = () => {
    if (!palette) {
      palette = doc.createElement("dialog");
      palette.className = "cms-palette";
      palette.innerHTML =
        '<input type="search" placeholder="Search pages and headings" aria-label="Search" autocomplete="off" spellcheck="false">' +
        '<ul role="listbox"></ul>' +
        '<div class="cms-hint"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>';
      doc.body.append(palette);
      const input = palette.querySelector("input")!;
      input.addEventListener("input", () => void renderResults(input.value));
      input.addEventListener("keydown", (event) => {
        const items = all<HTMLLIElement>("li[role=option]", palette);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          selected =
            (selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            Math.max(items.length, 1);
          items.forEach((item, i) => item.setAttribute("aria-selected", String(i === selected)));
          items[selected]?.scrollIntoView({ block: "nearest" });
        } else if (event.key === "Enter") {
          const link = items[selected]?.querySelector("a");
          if (!link) return;
          event.preventDefault();
          if (event.metaKey || event.ctrlKey) open(link.href, "_blank");
          else location.href = link.href;
          palette?.close();
        }
      });
      palette.addEventListener("click", (event) => {
        if (event.target === palette) palette.close();
      });
      palette.addEventListener("mousemove", (event) => {
        const item =
          event.target instanceof Element ? event.target.closest("li[role=option]") : null;
        if (!item) return;
        const items = all("li[role=option]", palette);
        selected = items.indexOf(item);
        items.forEach((other, i) => other.setAttribute("aria-selected", String(i === selected)));
      });
    }
    palette.showModal();
    const input = palette.querySelector("input")!;
    input.select();
    void renderResults(input.value);
  };
  const renderResults = async (query: string) => {
    const items = await loadIndex();
    const list = palette?.querySelector("ul");
    if (!list) return;
    const needle = query.trim().toLowerCase();
    let results: { item: Item; score: number; titleHits: number[]; pathHits: number[] }[];
    if (!needle) {
      results = items
        .filter((item) => item.page)
        .map((item) => ({ item, score: 0, titleHits: [], pathHits: [] }));
    } else {
      results = [];
      for (const item of items) {
        const title = fuzzy(needle, item.title);
        const path = fuzzy(needle, item.path);
        if (!title && !path) continue;
        const score =
          Math.max((title?.score ?? -Infinity) + 10, path?.score ?? -Infinity) +
          (item.page ? 8 : 0);
        results.push({
          item,
          score,
          titleHits: title?.hits ?? [],
          pathHits: title ? [] : (path?.hits ?? []),
        });
      }
      results.sort((a, b) => b.score - a.score);
    }
    selected = 0;
    list.innerHTML = results.length
      ? results
          .slice(0, 60)
          .map(
            ({ item, titleHits, pathHits }, i) =>
              `<li role="option" aria-selected="${i === 0}"><a href="${escape(item.url)}">` +
              `<span class="cms-hit-title">${item.page ? "" : "# "}${mark(item.title, titleHits)}</span>` +
              `<span class="cms-hit-path">${mark(item.path, pathHits)}</span></a></li>`,
          )
          .join("")
      : '<li class="cms-none">No results</li>';
  };

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  for (const key of all("[data-cms-search] kbd")) key.textContent = isMac ? "⌘K" : "Ctrl K";
  addEventListener("keydown", (event) => {
    const typing =
      event.target instanceof HTMLElement &&
      event.target.closest("input, textarea, select, [contenteditable]");
    if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
      event.preventDefault();
      if (palette?.open) palette.close();
      else openPalette();
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
export const clientScript = `(${client.toString()})();\n`;

/**
 * Sets the theme class before the first paint, so a dark page does not flash
 * light while it loads. The page puts it inline in the head.
 */
export const themeScript =
  '(()=>{try{var t=localStorage.getItem("cms-theme")||"system",d=document.documentElement;' +
  'd.dataset.theme=t;if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark")}catch(e){}})()';

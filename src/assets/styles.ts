// The stylesheet of each page. The server adds the twinkleplop GitHub theme
// after it, and serves both as one file.
export const styles = String.raw`
:root {
  color-scheme: light;
  --cms-bg: #ffffff;
  --cms-fg: #1f2328;
  --cms-muted: #59636e;
  --cms-border: #d1d9e0;
  --cms-subtle: #f6f8fa;
  --cms-hover: #eff2f5;
  --cms-accent: #0969da;
  --cms-accent-soft: #ddf4ff;
  --cms-note: #0969da;
  --cms-tip: #1a7f37;
  --cms-important: #8250df;
  --cms-warning: #9a6700;
  --cms-caution: #cf222e;
  --cms-shadow: 0 16px 48px rgb(31 35 40 / 0.18), 0 2px 6px rgb(31 35 40 / 0.08);
  --cms-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --cms-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --cms-width: 860px;
  --cms-radius: 8px;
}
.dark {
  color-scheme: dark;
  --cms-bg: #0d1117;
  --cms-fg: #e6edf3;
  --cms-muted: #9198a1;
  --cms-border: #30363d;
  --cms-subtle: #151b23;
  --cms-hover: #1f2630;
  --cms-accent: #4493f8;
  --cms-accent-soft: #121d2f;
  --cms-note: #4493f8;
  --cms-tip: #3fb950;
  --cms-important: #ab7df8;
  --cms-warning: #d29922;
  --cms-caution: #f85149;
  --cms-shadow: 0 16px 48px rgb(1 4 9 / 0.6), 0 0 0 1px #30363d;
}
*, *::before, *::after { box-sizing: border-box; }
html { background: var(--cms-bg); scroll-padding-top: 72px; }
body {
  margin: 0;
  background: var(--cms-bg);
  color: var(--cms-fg);
  font: 16px/1.6 var(--cms-font);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
a { color: var(--cms-accent); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 0.2em; }
kbd {
  display: inline-block;
  padding: 0.1em 0.4em;
  font: 0.75em/1.4 var(--cms-mono);
  color: var(--cms-fg);
  background: var(--cms-subtle);
  border: 1px solid var(--cms-border);
  border-bottom-width: 2px;
  border-radius: 6px;
}
.cms-icon { width: 1em; height: 1em; flex: none; vertical-align: -0.125em; }

/* Top bar */
.cms-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 max(16px, env(safe-area-inset-left));
  background: color-mix(in srgb, var(--cms-bg) 82%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--cms-border);
}
.cms-logo { display: flex; color: var(--cms-fg); }
.cms-logo svg { width: 22px; height: 22px; }
.cms-crumbs {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 2px;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  mask-image: linear-gradient(to left, transparent, #000 24px);
  -webkit-mask-image: linear-gradient(to left, transparent, #000 24px);
  padding-right: 24px;
}
.cms-crumbs a, .cms-crumbs span { padding: 4px 6px; border-radius: 6px; color: var(--cms-muted); }
.cms-crumbs a:hover { background: var(--cms-hover); color: var(--cms-fg); text-decoration: none; }
.cms-crumbs span:last-child { color: var(--cms-fg); font-weight: 600; }
.cms-crumbs .cms-sep { padding: 0; color: var(--cms-border); }
.cms-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.cms-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  font: 500 13px var(--cms-font);
  color: var(--cms-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.cms-button:hover { color: var(--cms-fg); background: var(--cms-hover); text-decoration: none; }
.cms-search {
  min-width: 200px;
  justify-content: flex-start;
  border-color: var(--cms-border);
  background: var(--cms-subtle);
}
.cms-search kbd { margin-left: auto; }
.cms-live {
  width: 8px;
  height: 8px;
  margin: 0 6px;
  border-radius: 50%;
  background: var(--cms-border);
  transition: background 0.3s;
}
.cms-live[data-state="open"] { background: var(--cms-tip); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cms-tip) 25%, transparent); }
.cms-live[data-state="closed"] { background: var(--cms-caution); }

/* Layout */
.cms-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-content: center;
  gap: 48px;
  max-width: calc(var(--cms-width) + 320px);
  margin: 0 auto;
  padding: 40px max(16px, env(safe-area-inset-left)) 64px;
}
.cms-main { min-width: 0; max-width: var(--cms-width); width: 100%; margin: 0 auto; }
.cms-toc { display: none; }
@media (min-width: 1200px) {
  .cms-layout:has(.cms-toc nav:not(:empty)) { grid-template-columns: minmax(0, var(--cms-width)) 240px; }
  .cms-toc { display: block; }
}
.cms-toc nav {
  position: sticky;
  top: 88px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  font-size: 13px;
}
.cms-toc p { margin: 0 0 8px; font-weight: 600; color: var(--cms-fg); }
.cms-toc ul { margin: 0; padding: 0; list-style: none; }
.cms-toc ul ul { padding-left: 12px; }
.cms-toc a {
  display: block;
  padding: 4px 0 4px 12px;
  color: var(--cms-muted);
  border-left: 2px solid var(--cms-border);
  line-height: 1.4;
}
.cms-toc a:hover { color: var(--cms-fg); text-decoration: none; }
.cms-toc a[aria-current="true"] { color: var(--cms-accent); border-left-color: var(--cms-accent); }
.cms-footer {
  max-width: var(--cms-width);
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-size: 12px;
  color: var(--cms-muted);
  text-align: center;
}
.cms-footer a { color: inherit; }

/* Markdown */
.cms-markdown { overflow-wrap: break-word; }
.cms-markdown > :first-child { margin-top: 0 !important; }
.cms-markdown > :last-child { margin-bottom: 0 !important; }
.cms-markdown :is(p, ul, ol, blockquote, table, pre, details, figure, dl, .cms-alert, .cms-code-group, .cms-code) { margin: 0 0 16px; }
.cms-markdown :is(h1, h2, h3, h4, h5, h6) {
  position: relative;
  margin: 32px 0 16px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.cms-markdown h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--cms-border); letter-spacing: -0.02em; }
.cms-markdown h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--cms-border); }
.cms-markdown h3 { font-size: 1.25em; }
.cms-markdown h4 { font-size: 1em; }
.cms-markdown h5 { font-size: 0.875em; }
.cms-markdown h6 { font-size: 0.85em; color: var(--cms-muted); }
.cms-anchor {
  position: absolute;
  left: -1.1em;
  padding-right: 0.3em;
  color: var(--cms-muted);
  opacity: 0;
  font-weight: 400;
  transition: opacity 0.15s;
}
.cms-markdown :is(h1, h2, h3, h4, h5, h6):hover .cms-anchor, .cms-anchor:focus { opacity: 1; text-decoration: none; }
.cms-markdown :is(ul, ol) { padding-left: 2em; }
.cms-markdown li + li { margin-top: 0.25em; }
.cms-markdown li > :is(ul, ol) { margin: 0.25em 0 0; }
.cms-markdown .contains-task-list { list-style: none; padding-left: 1.2em; }
.cms-markdown .task-list-item-checkbox { margin: 0 0.4em 0 -1.2em; vertical-align: middle; accent-color: var(--cms-accent); }
.cms-markdown blockquote { margin-left: 0; padding: 0 1em; color: var(--cms-muted); border-left: 0.25em solid var(--cms-border); }
.cms-markdown hr { height: 0.25em; margin: 24px 0; padding: 0; background: var(--cms-border); border: 0; border-radius: 2px; }
.cms-markdown img { max-width: 100%; height: auto; border-radius: 4px; }
.cms-markdown table { display: block; width: max-content; max-width: 100%; overflow: auto; border-spacing: 0; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.cms-markdown :is(th, td) { padding: 6px 13px; border: 1px solid var(--cms-border); }
.cms-markdown th { font-weight: 600; text-align: start; background: var(--cms-subtle); }
.cms-markdown tr:nth-child(2n) td { background: color-mix(in srgb, var(--cms-subtle) 60%, transparent); }
.cms-markdown :not(pre) > code {
  padding: 0.2em 0.4em;
  font: 85%/1 var(--cms-mono);
  background: color-mix(in srgb, var(--cms-muted) 14%, transparent);
  border-radius: 6px;
}
.cms-markdown details { padding: 8px 16px; border: 1px solid var(--cms-border); border-radius: var(--cms-radius); }
.cms-markdown summary { cursor: pointer; font-weight: 600; }
.cms-markdown details[open] summary { margin-bottom: 8px; }
.cms-markdown mark { background: #fff8c5; color: inherit; padding: 0 2px; border-radius: 2px; }
.dark .cms-markdown mark { background: #bb800966; }
.cms-markdown .footnotes { font-size: 0.875em; color: var(--cms-muted); }
.cms-markdown .footnotes h2 { font-size: 1em; border: 0; }
.cms-markdown .footnotes hr { height: 1px; }
.cms-markdown .footnote-ref a { font-size: 0.75em; }

/* Code */
.cms-markdown pre, .cms-code-error pre {
  position: relative;
  padding: 16px 0;
  overflow: auto;
  font: 13.5px/1.6 var(--cms-mono);
  color: var(--twp-identifier, var(--cms-fg));
  background: var(--twp-background, var(--cms-subtle));
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius);
  tab-size: 2;
}
.cms-markdown pre > code { display: block; min-width: max-content; padding: 0 16px; }
.twinkleplop code:has(> .l) { padding: 0; }
.twinkleplop .l { display: inline-block; min-width: 100%; padding: 0 16px; }
.twinkleplop .l.highlight {
  background: color-mix(in srgb, var(--cms-accent) 12%, transparent);
  box-shadow: inset 3px 0 var(--cms-accent);
}
.twinkleplop.has-highlight .l:not(.highlight) { opacity: 0.72; }
.twinkleplop .ln {
  display: inline-block;
  width: 2.5ch;
  margin-right: 20px;
  color: var(--cms-muted);
  text-align: right;
  opacity: 0.6;
  user-select: none;
}
.twinkleplop .highlighted-word {
  padding: 1px 3px;
  margin: -1px -3px;
  background: color-mix(in srgb, var(--cms-warning) 22%, transparent);
  border-radius: 4px;
}
.twinkleplop-block { margin: 0 0 16px; }
.twinkleplop-block > pre { margin: 0 !important; border-top-left-radius: 0; border-top-right-radius: 0; }
.twinkleplop-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font: 12px/1.5 var(--cms-mono);
  color: var(--cms-muted);
  background: var(--cms-subtle);
  border: 1px solid var(--cms-border);
  border-bottom: 0;
  border-radius: var(--cms-radius) var(--cms-radius) 0 0;
}
.twinkleplop-caption { margin-top: 6px; font-size: 13px; color: var(--cms-muted); text-align: center; }
.cms-code { position: relative; }
.cms-code > pre { margin: 0; }
.cms-copy {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--cms-muted);
  background: var(--cms-bg);
  border: 1px solid var(--cms-border);
  border-radius: 6px;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s, color 0.15s;
}
.cms-code:hover .cms-copy, .cms-copy:focus-visible { opacity: 1; }
.cms-copy:hover { color: var(--cms-fg); }
.cms-copy[data-copied] { color: var(--cms-tip); opacity: 1; }
.cms-copy .cms-icon { width: 16px; height: 16px; }
.twinkleplop-block .cms-copy { top: 44px; }
.cms-code-error { margin: 0 0 16px; }
.cms-code-error figcaption {
  padding: 8px 12px;
  font: 12px/1.5 var(--cms-mono);
  color: var(--cms-caution);
  background: color-mix(in srgb, var(--cms-caution) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--cms-caution) 40%, transparent);
  border-bottom: 0;
  border-radius: var(--cms-radius) var(--cms-radius) 0 0;
}
.cms-code-error pre { margin: 0; border-top-left-radius: 0; border-top-right-radius: 0; }
.cms-code-error pre > code { padding: 0 16px; }

/* Code groups */
.cms-code-group { overflow: hidden; border: 1px solid var(--cms-border); border-radius: var(--cms-radius); }
.cms-tabs { display: flex; overflow-x: auto; background: var(--cms-subtle); border-bottom: 1px solid var(--cms-border); }
.cms-tabs button {
  padding: 8px 14px;
  font: 12px/1.5 var(--cms-mono);
  color: var(--cms-muted);
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
}
.cms-tabs button:hover { color: var(--cms-fg); }
.cms-tabs button[aria-selected="true"] { color: var(--cms-fg); border-bottom-color: var(--cms-accent); }
.cms-code-group :is(pre, .cms-code, .twinkleplop-block) { margin: 0 !important; }
.cms-code-group pre { border: 0; border-radius: 0; }
.cms-code-group .twinkleplop-title { display: none; }
.cms-code-group .twinkleplop-block .cms-copy { top: 8px; }

/* Alerts */
.cms-alert {
  --cms-alert: var(--cms-note);
  padding: 8px 16px;
  border-left: 0.25em solid var(--cms-alert);
  border-radius: 0 var(--cms-radius) var(--cms-radius) 0;
  background: color-mix(in srgb, var(--cms-alert) 7%, transparent);
}
.cms-alert > :last-child { margin-bottom: 0; }
.cms-alert-title { display: flex; align-items: center; gap: 8px; margin: 0 0 4px !important; font-weight: 600; color: var(--cms-alert); }
.cms-alert-tip { --cms-alert: var(--cms-tip); }
.cms-alert-important { --cms-alert: var(--cms-important); }
.cms-alert-warning { --cms-alert: var(--cms-warning); }
.cms-alert-caution { --cms-alert: var(--cms-caution); }

/* Math and diagrams */
.cms-math-block { margin: 0 0 16px; overflow-x: auto; overflow-y: hidden; padding: 4px 0; }
.cms-mermaid { --accent: var(--cms-accent); display: flex; justify-content: center; margin: 0 0 16px; padding: 16px; overflow-x: auto; border: 1px solid var(--cms-border); border-radius: var(--cms-radius); }
.cms-mermaid svg { max-width: 100%; height: auto; }

/* Directory listing */
.cms-listing { width: 100%; margin: 0 0 32px; border: 1px solid var(--cms-border); border-radius: var(--cms-radius); border-spacing: 0; overflow: hidden; font-size: 14px; }
.cms-listing th { padding: 10px 16px; font-weight: 600; text-align: left; background: var(--cms-subtle); border-bottom: 1px solid var(--cms-border); }
.cms-listing td { padding: 8px 16px; border-top: 1px solid var(--cms-border); }
.cms-listing tbody tr:first-child td { border-top: 0; }
.cms-listing tbody tr:hover td { background: var(--cms-hover); }
.cms-listing td:first-child a { display: flex; align-items: center; gap: 10px; color: var(--cms-fg); }
.cms-listing td:first-child .cms-icon { color: var(--cms-muted); width: 16px; height: 16px; }
.cms-listing tr[data-kind="dir"] .cms-icon { color: var(--cms-accent); }
.cms-listing tr[data-kind="markdown"] .cms-icon { color: var(--cms-important); }
.cms-listing :is(th, td):not(:first-child) { width: 1%; color: var(--cms-muted); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cms-listing .cms-empty { color: var(--cms-muted); text-align: center; }
.cms-readme { border: 1px solid var(--cms-border); border-radius: var(--cms-radius); }
.cms-readme > header { display: flex; align-items: center; gap: 8px; padding: 10px 16px; font-size: 14px; font-weight: 600; border-bottom: 1px solid var(--cms-border); }
.cms-readme > .cms-markdown { padding: 24px 32px 32px; }

/* Status pages */
.cms-status { padding: 64px 0; text-align: center; }
.cms-status h1 { margin: 0 0 8px; font-size: 64px; letter-spacing: -0.04em; border: 0; }
.cms-status p { color: var(--cms-muted); }
.cms-status pre { text-align: left; }

/* Search palette */
.cms-palette {
  width: min(640px, calc(100vw - 32px));
  max-height: min(560px, 72vh);
  margin: 12vh auto auto;
  padding: 0;
  overflow: hidden;
  color: var(--cms-fg);
  background: var(--cms-bg);
  border: 1px solid var(--cms-border);
  border-radius: 12px;
  box-shadow: var(--cms-shadow);
}
.cms-palette[open] { display: flex; flex-direction: column; }
.cms-palette::backdrop { background: rgb(1 4 9 / 0.4); backdrop-filter: blur(2px); }
.cms-palette input {
  width: 100%;
  padding: 16px 18px;
  font: 16px var(--cms-font);
  color: inherit;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--cms-border);
  outline: none;
}
.cms-palette ul { flex: 1; margin: 0; padding: 6px; overflow-y: auto; list-style: none; }
.cms-palette .cms-hit { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; color: inherit; border-radius: 8px; cursor: pointer; }
.cms-palette .cms-hit:hover { text-decoration: none; }
.cms-palette li[aria-selected="true"] > .cms-hit { background: var(--cms-accent-soft); }
.cms-palette li[aria-selected="true"] .cms-hit-title { color: var(--cms-accent); }
.cms-palette .cms-theme-hit { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
.cms-palette .cms-hit-title small { margin-left: 8px; font: 11px var(--cms-mono); color: var(--cms-muted); }
.cms-palette li[data-active] .cms-hit-title::after { content: "✓"; margin-left: 8px; color: var(--cms-tip); }
.cms-swatches { display: flex; flex: none; gap: 3px; min-height: 14px; }
.cms-swatches i { width: 14px; height: 14px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgb(127 127 127 / 0.3); }
.cms-palette .cms-hit-title { font-weight: 500; }
.cms-palette .cms-hit-path { font: 12px var(--cms-mono); color: var(--cms-muted); }
.cms-palette mark { color: var(--cms-accent); background: none; font-weight: 700; }
.cms-palette .cms-hint { display: flex; gap: 16px; padding: 8px 16px; font-size: 12px; color: var(--cms-muted); border-top: 1px solid var(--cms-border); }
.cms-palette .cms-none { padding: 24px; color: var(--cms-muted); text-align: center; }

/* Live reload */
@keyframes cms-flash {
  from { background: color-mix(in srgb, var(--cms-accent) 20%, transparent); box-shadow: 0 0 0 6px color-mix(in srgb, var(--cms-accent) 20%, transparent); }
  to { background: transparent; box-shadow: 0 0 0 6px transparent; }
}
.cms-changed { animation: cms-flash 1.4s ease-out; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { .cms-changed { animation: none; } }

@media (max-width: 720px) {
  .cms-search { min-width: 0; }
  .cms-search span, .cms-search kbd { display: none; }
  .cms-layout { padding-top: 24px; }
  .cms-readme > .cms-markdown { padding: 16px; }
  .cms-listing :is(th, td):nth-child(3) { display: none; }
}
@media print {
  .cms-bar, .cms-toc, .cms-footer, .cms-copy { display: none !important; }
  .cms-layout { display: block; padding: 0; }
  .cms-markdown pre { white-space: pre-wrap; }
}
`;

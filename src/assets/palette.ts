// Maps the page colors and the twinkleplop token colors to the 16 base16 slots,
// `--b00` to `--b0F`. A theme then sets only the 16 slots. The rules apply only
// when a palette is active, so the built-in GitHub theme does not change.

type Slot =
  | "00"
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08"
  | "09"
  | "0A"
  | "0B"
  | "0C"
  | "0D"
  | "0E"
  | "0F";

// The slot of each twinkleplop token, from the base16 styling guidelines:
// 03 comments, 05 text, 08 variables and tags, 09 numbers and constants,
// 0A types, 0B strings, 0C regex and escapes, 0D functions and headings, 0E keywords.
const TOKEN_SLOTS: Record<string, Slot> = {
  background: "01",
  comment: "03",
  doctype: "03",
  hash: "03",
  label: "03",
  strike: "03",
  hr: "03",
  hard_break: "03",
  doc_marker: "03",
  blockquote_marker: "03",
  code_fence: "03",
  front_matter_marker: "03",
  prompt_prefix: "03",
  carriage_return: "03",
  newline: "03",
  space: "03",
  tab: "03",
  output: "04",
  identifier: "05",
  punctuation: "05",
  expression: "05",
  lifetime: "08",
  parameter: "08",
  property: "08",
  variable: "08",
  tag_name: "08",
  css_variable: "08",
  deleted: "08",
  deleted_marker: "08",
  link_text: "08",
  boolean: "09",
  number: "09",
  constant: "09",
  null: "09",
  unit: "09",
  bit: "09",
  datetime: "09",
  attribute: "09",
  attr_name: "09",
  variant: "09",
  autolink: "09",
  url: "09",
  url_link: "09",
  type: "0A",
  class_name: "0A",
  namespace: "0A",
  decorator: "0A",
  selector_class: "0A",
  array_table_header: "0A",
  tag: "0A",
  bold: "0A",
  code_language: "0A",
  string: "0B",
  template: "0B",
  inserted: "0B",
  inserted_marker: "0B",
  code: "0B",
  code_block: "0B",
  url_title: "0B",
  plain_scalar: "0B",
  operator: "0C",
  regex: "0C",
  builtin: "0C",
  entity: "0C",
  escape: "0C",
  string_escape: "0C",
  format: "0C",
  attr_sigil: "0C",
  selector_pseudo: "0C",
  svelte_directive: "0C",
  function: "0D",
  heading: "0D",
  heading_marker: "0D",
  selector_id: "0D",
  prompt: "0D",
  keyword: "0E",
  selector: "0E",
  changed: "0E",
  changed_marker: "0E",
  italic: "0E",
  list_marker: "0E",
  task_marker: "0E",
  svelte_block: "0E",
  block_scalar_header: "0E",
  directive: "0E",
};

const PAGE_COLORS: Record<string, string> = {
  "--cms-bg": "var(--b00)",
  "--cms-subtle": "var(--b01)",
  "--cms-hover": "color-mix(in srgb, var(--b02) 55%, var(--b00))",
  "--cms-border": "var(--b02)",
  "--cms-muted": "var(--b04)",
  "--cms-fg": "var(--b05)",
  "--cms-accent": "var(--b-accent, var(--b0D))",
  "--cms-accent-soft": "color-mix(in srgb, var(--cms-accent) 16%, var(--b00))",
  "--cms-note": "var(--b0D)",
  "--cms-tip": "var(--b0B)",
  "--cms-important": "var(--b0E)",
  "--cms-warning": "var(--b0A)",
  "--cms-caution": "var(--b08)",
};

/** Returns the color tokens of a twinkleplop theme. Style tokens, such as `bold-font-weight`, have a `-`. */
export function themeTokenNames(themeCss: string): string[] {
  const root = /:root\s*\{([^}]*)\}/.exec(themeCss)?.[1] ?? "";
  const names = [...root.matchAll(/--twp-([a-z0-9_-]+)\s*:/g)].map((match) => match[1] ?? "");
  return [...new Set(names)].filter((name) => name && !name.includes("-"));
}

function slotFor(name: string): Slot {
  if (Object.hasOwn(TOKEN_SLOTS, name)) return TOKEN_SLOTS[name] ?? "05";
  if (/_(open|close|marker)$/.test(name)) return "03";
  return "05";
}

/** Returns the CSS that maps the page and token colors to the slots of the active palette. */
export function paletteStyles(tokenNames: readonly string[]): string {
  const declarations = [
    ...Object.entries(PAGE_COLORS).map(([name, value]) => `  ${name}: ${value};`),
    ...tokenNames.map((name) => `  --twp-${name}: var(--b${slotFor(name)});`),
  ];
  return `:root[data-cms-palette] {
${declarations.join("\n")}
}
:root[data-cms-palette] ::selection { background: color-mix(in srgb, var(--b02) 85%, transparent); }
:root[data-cms-palette] .cms-markdown mark { background: color-mix(in srgb, var(--b0A) 35%, transparent); }
`;
}

/** A color theme with the 16 base16 slots, from `base00` to `base0F`. */
export interface Palette {
  id: string;
  name: string;
  variant: "light" | "dark";
  /** The 16 slots as `#rrggbb`, from `base00` to `base0F`. */
  colors: string[];
  /** An accent color. Omarchy themes have one. Other themes use `base0D`. */
  accent?: string;
}

/**
 * Reads a base16 or base24 scheme (YAML) or an Omarchy `colors.toml`.
 * Returns `undefined` when the text is not a complete scheme.
 *
 * The colors go into CSS, and the text can come from the network, so the
 * function accepts only hex colors. The browser gets this function with
 * `toString()`, so it must not use anything from outside its body.
 */
export function parseTheme(text: string, id: string, fallbackName: string): Palette | undefined {
  const hex = (value: string | undefined): string | undefined => {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? "").trim());
    if (!match?.[1]) return undefined;
    const digits = match[1].toLowerCase();
    return `#${digits.length === 3 ? digits.replace(/./g, "$&$&") : digits}`;
  };
  // Removes a trailing comment and the quotes. A "#" in a quoted color has no space before it.
  const unquote = (value: string) =>
    value
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
  const isDark = (color: string) => {
    const [r, g, b] = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255);
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0) < 0.5;
  };

  let colors: (string | undefined)[];
  let name: string | undefined;
  let variant: string | undefined;
  let accent: string | undefined;

  if (/^\s*base0[0-9a-f]\s*:/im.test(text)) {
    // A base16 or base24 YAML scheme. base24 adds base10 to base17, which the regex skips.
    const slots: Record<string, string | undefined> = {};
    for (const match of text.matchAll(/^\s*base0([0-9a-f])\s*:\s*(["']?)#?([0-9a-f]+)\2/gim)) {
      slots[(match[1] ?? "").toLowerCase()] = hex(match[3]);
    }
    colors = "0123456789abcdef".split("").map((slot) => slots[slot]);
    name = /^(?:name|scheme)\s*:\s*(.+?)\s*$/m.exec(text)?.[1];
    variant = /^variant\s*:\s*(.+?)\s*$/m.exec(text)?.[1];
  } else if (/^\s*background\s*=/m.test(text)) {
    // An Omarchy colors.toml, with named colors.
    const keys: Record<string, string> = {};
    for (const match of text.matchAll(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/gm)) {
      keys[match[1] ?? ""] = unquote(match[2] ?? "");
    }
    const first = (...names: string[]) => {
      for (const key of names) {
        const color = hex(keys[key]);
        if (color) return color;
      }
      return undefined;
    };
    const background = first("background");
    const foreground = first("foreground");
    colors = [
      background,
      first("lighter_background", "dark_background", "selection") ?? background,
      first("selection", "lighter_background") ?? background,
      first("muted", "dark_foreground", "bright_black"),
      first("dark_foreground", "muted", "light_foreground") ?? foreground,
      foreground,
      first("light_foreground", "bright_foreground") ?? foreground,
      first("bright_foreground", "light_foreground") ?? foreground,
      first("red"),
      first("orange", "bright_red", "red"),
      first("yellow"),
      first("green"),
      first("cyan"),
      first("blue"),
      first("magenta"),
      first("brown", "orange", "red"),
    ];
    // A color that is still missing comes from a color that has a similar role.
    colors[3] ??= colors[4] ?? colors[2];
    const fallback = colors[13] ?? colors[5];
    for (const index of [8, 9, 10, 11, 12, 13, 14, 15]) colors[index] ??= fallback;
    variant = keys.mode;
    accent = first("accent");
  } else {
    return undefined;
  }

  if (colors.length !== 16 || colors.some((color) => color === undefined)) return undefined;
  const complete = colors as string[];
  const cleanName = unquote(name ?? "").slice(0, 80) || fallbackName;
  const mode = unquote(variant ?? "").toLowerCase();
  return {
    id,
    name: cleanName,
    variant:
      mode === "light" || mode === "dark" ? mode : isDark(complete[0] ?? "") ? "dark" : "light",
    colors: complete,
    ...(accent ? { accent } : {}),
  };
}

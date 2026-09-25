import { watch } from "chokidar";
import { relative } from "pathe";

export type ChangeListener = (paths: string[]) => void;

export interface Watcher {
  /** Resolves when the watcher has read the tree and reports changes. */
  ready: Promise<void>;
  /** Calls the listener with the URL paths (from the root, with a leading `/`) of changed files. */
  subscribe: (listener: ChangeListener) => () => void;
  close: () => Promise<void>;
}

export interface WatchOptions {
  /** Returns true for a path from the root, with `/` separators, that the watcher must skip. */
  ignore: (path: string) => boolean;
  /** Collects changes for this many milliseconds before it calls the listeners. @default 30 */
  debounce?: number;
}

export function watchTree(root: string, options: WatchOptions): Watcher {
  const listeners = new Set<ChangeListener>();
  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (path) => {
      const local = relative(root, path);
      return local !== "" && options.ignore(local);
    },
  });

  const flush = () => {
    timer = undefined;
    const paths = [...pending];
    pending = new Set();
    for (const listener of listeners) listener(paths);
  };

  watcher.on("all", (_event, path) => {
    pending.add(`/${relative(root, path)}`);
    timer ??= setTimeout(flush, options.debounce ?? 30);
  });
  // An error, such as a directory without read permission, must not stop the server.
  watcher.on("error", () => {});

  return {
    ready: new Promise((resolve) => watcher.once("ready", () => resolve())),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => {
      if (timer) clearTimeout(timer);
      listeners.clear();
      await watcher.close();
    },
  };
}

import launchEditor from "launch-editor";

/** Opens a file in the editor of the user, at a line when one is given. */
export type OpenEditor = (file: string, line?: number) => Promise<void>;

/**
 * Opens a file with launch-editor. It uses `LAUNCH_EDITOR`, `VISUAL` or `EDITOR`,
 * or else an editor that runs, such as VS Code, Cursor, Zed or WebStorm.
 */
export const openInEditor: OpenEditor = (file, line) =>
  new Promise((resolve, reject) => {
    launchEditor(line ? `${file}:${line}` : file, undefined, (_file, message) => {
      reject(
        new Error(
          message ||
            "comarkserv found no editor. Set the LAUNCH_EDITOR or EDITOR environment variable, for example to code or zed.",
        ),
      );
    });
    // With no editor, launch-editor calls the callback before it returns. When the
    // editor command does not exist, the spawn error comes a moment later, so the
    // promise waits a little before it reports success.
    setTimeout(resolve, 100);
  });

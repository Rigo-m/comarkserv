# Configuration

## Command line options

| Option            | Default     | Effect                                |
| ----------------- | ----------- | ------------------------------------- |
| `--port`, `-p`    | `8642`      | The port. The next free port is used. |
| `--host`, `-H`    | `localhost` | The host.                             |
| `--open`, `-o`    | off         | Open the browser.                     |
| `--no-livereload` | on          | Do not watch the files.               |
| `--line-numbers`  | off         | Line numbers on all code blocks.      |

## Library

```ts
import { serve } from "srvx";
import { createHandler } from "comarkserv";

const app = createHandler({ root: "./docs" });
serve({ fetch: app.fetch });
```

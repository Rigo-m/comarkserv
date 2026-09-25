import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { findReadme } from "../src/site.ts";
import { createFixture } from "./fixture.ts";
import type { Fixture } from "./fixture.ts";

let fixture: Fixture;

beforeAll(async () => {
  fixture = await createFixture({
    "README.md": "# Root\n",
    "packages/app/src/index.ts": "export {};\n",
    "packages/lib/readme.markdown": "# Lib\n",
    "packages/lib/README.md": "# Lib\n",
    "packages/docs/Readme.mdc": "# Docs\n",
  });
});

afterAll(() => fixture.cleanup());

describe("findReadme", () => {
  test("finds the README in the directory itself", async () => {
    expect(await findReadme(fixture.root)).toBe(join(fixture.root, "README.md"));
  });

  test("goes up to the closest directory with a README", async () => {
    expect(await findReadme(join(fixture.root, "packages/app/src"))).toBe(
      join(fixture.root, "README.md"),
    );
  });

  test("prefers README.md to the other markdown extensions", async () => {
    expect(await findReadme(join(fixture.root, "packages/lib"))).toBe(
      join(fixture.root, "packages/lib/README.md"),
    );
  });

  test("ignores the case of the name", async () => {
    expect(await findReadme(join(fixture.root, "packages/docs"))).toBe(
      join(fixture.root, "packages/docs/Readme.mdc"),
    );
  });

  test("starts from the directory of a file", async () => {
    expect(await findReadme(join(fixture.root, "packages/app/src/index.ts"))).toBe(
      join(fixture.root, "README.md"),
    );
  });
});

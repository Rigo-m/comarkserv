import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The corpus uses only GitHub flavored markdown, so both servers do the same work:
// headings, lists, tables, links and code in four languages.

const typescript = (i: number) => `\`\`\`ts
interface Item${i} {
  id: number;
  name: string;
  tags: string[];
}

export async function load${i}(url: string): Promise<Item${i}[]> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(\`Request failed: \${response.status}\`);
  const items = (await response.json()) as Item${i}[];
  return items.filter((item) => item.tags.includes("page-${i}")).sort((a, b) => a.id - b.id);
}
\`\`\``;

const python = (i: number) => `\`\`\`python
from dataclasses import dataclass, field

@dataclass
class Page${i}:
    title: str
    words: list[str] = field(default_factory=list)

    def count(self) -> int:
        return sum(1 for word in self.words if len(word) > ${i % 7})
\`\`\``;

const bash = (i: number) => `\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
for file in docs/*.md; do
  echo "page ${i}: $file" | tee -a build.log
done
\`\`\``;

const json = (i: number) => `\`\`\`json
{ "page": ${i}, "draft": false, "tags": ["guide", "api", "example"], "size": { "words": ${i * 13}, "links": ${i % 9} } }
\`\`\``;

export function page(i: number, count: number): string {
  const next = `page-${String((i + 1) % count).padStart(3, "0")}.md`;
  return `# Page ${i}

This page is number ${i} of the benchmark corpus. It has **bold** text, _italic_ text, \`inline code\`, and a [link to the next page](./${next}).

## Overview

- The first item of a list, with some text.
- The second item, with a [link](https://example.com/${i}).
- The third item.
  - A nested item.
  - Another nested item.

| Name | Value | Unit | Note |
| ---- | ----: | ---- | ---- |
| alpha | ${i} | ms | The first row |
| beta | ${i * 2} | ms | The second row |
| gamma | ${i * 3} | KB | The third row |

## Code

${typescript(i)}

${python(i)}

## Details

${"This paragraph has plain text, so the page has a realistic amount of prose between the code blocks. ".repeat(4)}

> A block quote with a short note for page ${i}.

${bash(i)}

${json(i)}

## Reference

${Array.from({ length: 3 }, (_, n) => `Paragraph ${n + 1} of the reference. It explains the options of page ${i} in plain words, with a [link](./${next}#overview) and \`code\`. `.repeat(3)).join("\n\n")}

| Option | Type | Default | Effect |
| ------ | ---- | ------- | ------ |
${Array.from({ length: 8 }, (_, n) => `| option${n} | \`string\` | \`"${n}"\` | Changes the behavior number ${n} of page ${i}. |`).join("\n")}

### Checklist

1. Read the overview.
2. Run the code.
3. Check the table.
`;
}

/** Writes the corpus: `count` pages in `docs/`, a large page and a README. */
export async function writeCorpus(root: string, count = 100): Promise<void> {
  await mkdir(join(root, "docs"), { recursive: true });
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      writeFile(join(root, "docs", `page-${String(i).padStart(3, "0")}.md`), page(i, count)),
    ),
  );
  // About 300 KB: eighty pages in one file.
  const large = Array.from({ length: 80 }, (_, i) => page(i, count).replace(/^# /m, "## ")).join(
    "\n",
  );
  await writeFile(join(root, "large.md"), `# Large page\n\n${large}`);
  await writeFile(join(root, "README.md"), "# Benchmark corpus\n\nSee [docs](./docs/).\n");
}

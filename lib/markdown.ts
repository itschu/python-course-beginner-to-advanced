import "server-only";

import rehypeShiki from "@shikijs/rehype";
import type { Element, Root } from "hast";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/** Open external links in a new tab. */
function rehypeExternalLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const href = node.properties?.href;
      if (node.tagName === "a" && typeof href === "string" && /^https?:\/\//.test(href)) {
        node.properties.target = "_blank";
        node.properties.rel = ["noopener", "noreferrer"];
      }
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeShiki, {
    themes: { light: "github-light", dark: "github-dark" },
    langs: ["python", "bash", "json", "yaml", "sql", "dockerfile", "toml", "ini", "html", "typescript"],
    langAlias: { py: "python", sh: "bash", shell: "bash", console: "bash", env: "ini" },
    defaultLanguage: "text",
    fallbackLanguage: "text",
  })
  .use(rehypeExternalLinks)
  .use(rehypeStringify);

const cache = new Map<string, Promise<string>>();

export function renderMarkdown(markdown: string): Promise<string> {
  if (!markdown.trim()) return Promise.resolve("");
  let html = cache.get(markdown);
  if (!html) {
    html = processor.process(markdown).then((file) => String(file));
    cache.set(markdown, html);
  }
  return html;
}

/** Render inline markdown (quiz options, short titles) without a wrapping <p>. */
export async function renderInlineMarkdown(markdown: string): Promise<string> {
  const html = await renderMarkdown(markdown);
  const match = html.match(/^<p>([\s\S]*)<\/p>\s*$/);
  return match ? match[1] : html;
}

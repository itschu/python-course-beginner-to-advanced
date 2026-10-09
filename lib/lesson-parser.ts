/**
 * Parser for the lesson file format (see content/README.md).
 *
 * A lesson is Markdown with a few extra block types:
 *
 *   ```python            -> runnable, editable code cell
 *   ```python static     -> highlighted, not runnable
 *   :::exercise <id> <title>  ... @@starter / @@solution / @@tests / @@hint ... :::
 *   :::quiz <id> <title> ... ? question / - [ ] option / - [x] correct / > explanation ... :::
 *   :::note|tip|warning|info|colab <title> ... :::
 *
 * This file only splits the source into raw blocks. Rendering Markdown to
 * HTML happens in lib/content.ts. scripts/validate_content.py mirrors this
 * logic in Python, so keep the two in sync.
 */

export interface RawQuizQuestion {
  prompt: string;
  options: { text: string; correct: boolean }[];
  explanation: string;
}

export type RawBlock =
  | { kind: "md"; text: string }
  | { kind: "code"; code: string; meta: string[] }
  | {
      kind: "exercise";
      id: string;
      title: string;
      prompt: string;
      starter: string;
      solution: string;
      tests: string;
      hints: string[];
    }
  | { kind: "quiz"; id: string; title: string; questions: RawQuizQuestion[] }
  | {
      kind: "callout";
      variant: "note" | "tip" | "warning" | "colab" | "info";
      title: string;
      body: string;
    };

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*(.*)$/;
const DIRECTIVE_RE = /^:::(\w+)\s*(.*)$/;
const CALLOUTS = new Set(["note", "tip", "warning", "colab", "info"]);

export class LessonParseError extends Error {}

function trimBlankLines(text: string): string {
  const lines = text.split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join("\n");
}

function isFenceClose(line: string, fence: string): boolean {
  const t = line.trim();
  return t.length >= fence.length && t[0] === fence[0] && /^(`+|~+)$/.test(t);
}

export function parseLessonBody(source: string, file = "lesson"): RawBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: RawBlock[] = [];
  let md: string[] = [];

  const flushMd = () => {
    const text = md.join("\n").trim();
    if (text) blocks.push({ kind: "md", text });
    md = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(FENCE_RE);

    if (fence && fence[1] === "") {
      const [, , marker, lang, meta] = fence;
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !isFenceClose(lines[j], marker)) {
        body.push(lines[j]);
        j++;
      }
      if (j >= lines.length) {
        throw new LessonParseError(`${file}: unclosed code fence starting on line ${i + 1}`);
      }
      if (lang === "python" || lang === "py") {
        flushMd();
        blocks.push({
          kind: "code",
          code: body.join("\n"),
          meta: meta.split(/\s+/).filter(Boolean),
        });
      } else {
        md.push(...lines.slice(i, j + 1));
      }
      i = j + 1;
      continue;
    }

    const directive = line.match(DIRECTIVE_RE);
    if (directive) {
      flushMd();
      const [, type, rest] = directive;
      const body: string[] = [];
      let j = i + 1;
      let inFence: string | null = null;
      let codeSection = false;
      while (j < lines.length) {
        const l = lines[j];
        if (!inFence && l.trim() === ":::") break;
        if (type === "exercise" && !inFence && /^@@\w+\s*$/.test(l)) {
          const name = l.trim().slice(2);
          codeSection = name === "starter" || name === "solution" || name === "tests";
        } else if (!codeSection) {
          const f = l.match(FENCE_RE);
          if (f) {
            if (inFence && isFenceClose(l, inFence)) inFence = null;
            else if (!inFence) inFence = f[2];
          }
        }
        body.push(l);
        j++;
      }
      if (j >= lines.length) {
        throw new LessonParseError(`${file}: unclosed :::${type} starting on line ${i + 1}`);
      }
      blocks.push(parseDirective(type, rest.trim(), body, file, i + 1));
      i = j + 1;
      continue;
    }

    md.push(line);
    i++;
  }
  flushMd();
  return blocks;
}

function parseDirective(
  type: string,
  rest: string,
  body: string[],
  file: string,
  lineNo: number,
): RawBlock {
  if (type === "exercise") {
    const [id, ...titleParts] = rest.split(/\s+/);
    if (!id) throw new LessonParseError(`${file}:${lineNo}: exercise needs an id`);
    const sections: Record<string, string[]> = { prompt: [] };
    const hints: string[][] = [];
    let current: string[] = sections.prompt;
    for (const l of body) {
      const m = l.match(/^@@(\w+)\s*$/);
      if (m) {
        const name = m[1];
        if (name === "hint") {
          current = [];
          hints.push(current);
        } else if (["starter", "solution", "tests"].includes(name)) {
          if (sections[name]) {
            throw new LessonParseError(`${file}:${lineNo}: duplicate @@${name} in exercise ${id}`);
          }
          current = sections[name] = [];
        } else {
          throw new LessonParseError(`${file}:${lineNo}: unknown section @@${name}`);
        }
        continue;
      }
      current.push(l);
    }
    for (const required of ["starter", "solution", "tests"]) {
      if (!sections[required]) {
        throw new LessonParseError(`${file}:${lineNo}: exercise ${id} is missing @@${required}`);
      }
    }
    return {
      kind: "exercise",
      id,
      title: titleParts.join(" ") || "Exercise",
      prompt: sections.prompt.join("\n").trim(),
      starter: trimBlankLines(sections.starter.join("\n")),
      solution: trimBlankLines(sections.solution.join("\n")),
      tests: trimBlankLines(sections.tests.join("\n")),
      hints: hints.map((h) => h.join("\n").trim()).filter(Boolean),
    };
  }

  if (type === "quiz") {
    const [id, ...titleParts] = rest.split(/\s+/);
    if (!id) throw new LessonParseError(`${file}:${lineNo}: quiz needs an id`);
    const questions: RawQuizQuestion[] = [];
    let q: { prompt: string[]; options: RawQuizQuestion["options"]; explanation: string[] } | null =
      null;
    const finish = () => {
      if (!q) return;
      if (q.options.length < 2 || !q.options.some((o) => o.correct)) {
        throw new LessonParseError(
          `${file}:${lineNo}: quiz ${id} question "${q.prompt[0]}" needs 2+ options and a correct one`,
        );
      }
      questions.push({
        prompt: q.prompt.join("\n").trim(),
        options: q.options,
        explanation: q.explanation.join("\n").trim(),
      });
    };
    for (const l of body) {
      if (l.startsWith("? ")) {
        finish();
        q = { prompt: [l.slice(2)], options: [], explanation: [] };
        continue;
      }
      if (!q) continue;
      const opt = l.match(/^- \[( |x|X)\] (.*)$/);
      if (opt) {
        q.options.push({ text: opt[2], correct: opt[1].toLowerCase() === "x" });
      } else if (l.startsWith("> ") || l === ">") {
        q.explanation.push(l.slice(2));
      } else if (q.options.length === 0) {
        q.prompt.push(l);
      } else if (q.explanation.length > 0) {
        q.explanation.push(l);
      }
    }
    finish();
    if (questions.length === 0) {
      throw new LessonParseError(`${file}:${lineNo}: quiz ${id} has no questions`);
    }
    return { kind: "quiz", id, title: titleParts.join(" ") || "Quick check", questions };
  }

  if (CALLOUTS.has(type)) {
    return {
      kind: "callout",
      variant: type as "note",
      title: rest,
      body: body.join("\n").trim(),
    };
  }

  throw new LessonParseError(`${file}:${lineNo}: unknown block :::${type}`);
}

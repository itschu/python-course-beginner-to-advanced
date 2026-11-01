/**
 * Validate every lesson of the mobile course (content/mobile/).
 *
 * For each lesson this script:
 *   * parses it with lib/lesson-parser.ts, the same parser the site uses, and checks the frontmatter,
 *   * runs every runnable ```tsx cell in the React Native simulator (lib/mobile/rn-runtime.mjs, the
 *     same code the browser runs): it must not fail (unless marked expect-error) or print warnings
 *     (unless marked expect-warning), and a cell with `export default` must render something,
 *   * runs each exercise's solution against its tests (all must pass, with no warnings),
 *   * runs each exercise's starter against its tests (at least one must fail).
 *
 * Usage:  node scripts/validate_mobile.mjs [--phase SLUG] [-k TEXT] [--verbose]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";
import { transform } from "sucrase";

import { parseLessonBody } from "../lib/lesson-parser.ts";
import { runCode } from "../lib/mobile/rn-runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COURSE = path.join(ROOT, "content", "mobile");
const FILE_RE = /^(\d+)-([a-z0-9-]+)\.md$/;
const KINDS = new Set(["lesson", "project", "checkpoint"]);
const ID_RE = /^[a-z0-9-]{1,80}$/;
const STARTER_MS = 5000;

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyPhase = option("--phase");
const keyword = option("-k");
const verbose = args.includes("--verbose");

const errors = [];
const counts = { lessons: 0, cells: 0, exercises: 0 };

const curriculum = fs.readFileSync(path.join(COURSE, "curriculum.ts"), "utf8");
const slugs = [...curriculum.matchAll(/^\s{4}slug: "([a-z0-9-]+)"/gm)].map((m) => m[1]);
const folders = fs.readdirSync(COURSE, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const folder of folders) {
  if (!slugs.includes(folder)) errors.push(`content/mobile/${folder}: folder isn't a phase in content/mobile/curriculum.ts`);
}

/** Line number of each block in the file, for error messages. */
function blockLines(source) {
  const found = [];
  let inDirective = false;
  let fence = null;
  source.split("\n").forEach((line, i) => {
    if (fence) {
      if (line.trim().startsWith(fence)) fence = null;
      return;
    }
    if (inDirective) {
      if (line.trim() === ":::") inDirective = false;
      return;
    }
    const opening = line.match(/^(`{3,}|~{3,})\s*([\w+-]*)/);
    if (opening) {
      fence = opening[1];
      if (opening[2] === "tsx") found.push(i + 1);
      return;
    }
    const directive = line.match(/^:::(\w+)/);
    if (directive) {
      inDirective = true;
      if (directive[1] === "exercise") found.push(i + 1);
    }
  });
  return found;
}

async function run(code, tests) {
  const output = { stdout: "", stderr: "" };
  const started = Date.now();
  const result = await runCode({ code, tests, transform, log: (stream, text) => (output[stream] += text) });
  result.app?.dispose();
  return { result, output, ms: Date.now() - started, rendered: Boolean(result.app) };
}

const summarize = (tests) =>
  (tests ?? []).filter((t) => !t.passed).map((t) => `\n    ✗ ${t.description}: ${String(t.error).split("\n").slice(0, 6).join("\n      ")}`).join("");

for (const slug of slugs) {
  if (onlyPhase && slug !== onlyPhase) continue;
  const dir = path.join(COURSE, slug);
  if (!fs.existsSync(dir)) continue;
  const numbers = new Set();
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".md")) continue;
    const rel = path.relative(ROOT, path.join(dir, file));
    const m = file.match(FILE_RE);
    if (!m) {
      errors.push(`${rel}: file name must look like 01-lesson-slug.md`);
      continue;
    }
    if (numbers.has(m[1])) errors.push(`${rel}: duplicate lesson number ${m[1]}`);
    numbers.add(m[1]);
    if (keyword && !rel.includes(keyword)) continue;

    const source = fs.readFileSync(path.join(dir, file), "utf8");
    let data, body, blocks;
    try {
      ({ data, content: body } = matter(source));
      blocks = parseLessonBody(body, rel);
    } catch (error) {
      errors.push(`${rel}: ${error.message}`);
      continue;
    }
    counts.lessons++;
    for (const key of ["title", "summary", "minutes"]) if (!data[key]) errors.push(`${rel}: frontmatter is missing '${key}'`);
    if (data.kind && !KINDS.has(data.kind)) errors.push(`${rel}: unknown kind ${data.kind}`);
    const hasExercises = blocks.some((b) => b.kind === "exercise");
    if (hasExercises && data.language !== "tsx") errors.push(`${rel}: lessons with exercises need 'language: tsx' in the frontmatter`);

    const offset = source.slice(0, source.length - body.length).split("\n").length - 1;
    const lines = blockLines(body).map((l) => l + offset);
    let lineIndex = 0;
    const ids = [];
    const started = Date.now();

    for (const block of blocks) {
      if (block.kind === "code") {
        if (block.language !== "tsx") {
          errors.push(`${rel}: the mobile course only runs tsx code; mark other code as static text (\`\`\`${block.language} static is not supported here, use \`\`\`text or \`\`\`bash)`);
          continue;
        }
        const line = lines[lineIndex++];
        if (block.meta.includes("static")) continue;
        counts.cells++;
        const { result, output, rendered } = await run(block.code);
        const expectError = block.meta.includes("expect-error");
        if (result.ok === expectError) {
          errors.push(`${rel}:${line}: tsx cell ${expectError ? "should fail but ran fine" : `failed:\n${result.error}`}${output.stdout ? `\n--- output ---\n${output.stdout.slice(-800)}` : ""}`);
        }
        if (output.stderr && !block.meta.includes("expect-warning") && !expectError) {
          errors.push(`${rel}:${line}: tsx cell prints a warning learners would see:\n${output.stderr.slice(0, 800)}`);
        }
        if (result.ok && /\bexport\s+default\b/.test(block.code) && !rendered) {
          errors.push(`${rel}:${line}: tsx cell exports a default component but nothing was rendered`);
        }
      } else if (block.kind === "exercise") {
        const line = lines[lineIndex++];
        ids.push(block.id);
        counts.exercises++;
        const solution = await run(block.solution, block.tests);
        if (!solution.result.ok) {
          errors.push(`${rel}:${line}: exercise ${block.id}: solution failed:\n${solution.result.error}`);
        } else if (!solution.result.tests.every((t) => t.passed)) {
          errors.push(`${rel}:${line}: exercise ${block.id}: solution fails tests:${summarize(solution.result.tests)}`);
        }
        if (solution.output.stderr) {
          errors.push(`${rel}:${line}: exercise ${block.id}: solution prints a warning:\n${solution.output.stderr.slice(0, 800)}`);
        }
        const starter = await run(block.starter, block.tests);
        if (starter.result.ok && starter.result.tests.every((t) => t.passed)) {
          errors.push(`${rel}:${line}: exercise ${block.id}: starter code already passes every test`);
        }
        if (starter.ms > STARTER_MS) {
          errors.push(`${rel}:${line}: exercise ${block.id}: the starter takes ${starter.ms} ms to fail; make the tests fail fast`);
        }
        // The starter must at least compile, so learners start from working code.
        if (!starter.result.ok && /^SyntaxError/.test(starter.result.error ?? "")) {
          errors.push(`${rel}:${line}: exercise ${block.id}: the starter doesn't compile:\n${starter.result.error}`);
        }
      } else if (block.kind === "quiz") {
        ids.push(block.id);
      }
    }
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) errors.push(`${rel}: duplicate ids ${dupes.join(", ")}`);
    for (const id of ids) if (!ID_RE.test(id)) errors.push(`${rel}: id ${id} must be lowercase letters, digits and dashes`);
    if (verbose) console.error(`  ${rel} (${Date.now() - started} ms)`);
  }
}

console.error(`Checked ${counts.lessons} mobile lessons, ${counts.cells} code cells, ${counts.exercises} exercises.`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`✗ ${e}\n`);
  process.exit(1);
}
console.error("All mobile content is valid.");

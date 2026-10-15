"use client";

import type { RunResult, TestResult } from "@/lib/python-runner";

/**
 * Runs Rust on the official Rust Playground (https://play.rust-lang.org), which
 * compiles and runs code on its servers. Exercises are graded with `cargo test`:
 * the learner's code is followed by the exercise's tests inside a `mod tests`,
 * exactly as scripts/validate_content.py does locally with rustc.
 */

const PLAYGROUND_URL = (process.env.NEXT_PUBLIC_RUST_PLAYGROUND_URL ?? "https://play.rust-lang.org").replace(/\/$/, "");
const TIMEOUT_MS = 45_000;
export const RUST_EDITION = "2024";

interface PlaygroundResponse {
  success: boolean;
  exitDetail?: string;
  stdout: string;
  stderr: string;
}

export interface RustRunOptions {
  code: string;
  tests?: string;
  signal?: AbortSignal;
}

/** The code sent for grading: learner code first (so line numbers match), then the tests. */
export function buildTestCrate(code: string, tests: string): string {
  const indented = tests
    .split("\n")
    .map((l) => (l.trim() ? "    " + l : l))
    .join("\n");
  return `${code}\n\n#[cfg(test)]\nmod tests {\n    #![allow(unused_imports)]\n    use super::*;\n\n${indented}\n}\n`;
}

/** Cargo's progress lines aren't useful to learners. */
export function cleanStderr(stderr: string): string {
  return stderr
    .split("\n")
    .filter((l) => !/^\s*(Compiling|Finished|Running|Doc-tests|Blocking|Updating|Downloaded|Downloading)\b/.test(l))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/** Test descriptions come from the `///` doc comment above each #[test] function. */
export function testDescriptions(tests: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = tests.split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:pub\s+)?fn\s+(\w+)\s*\(/);
    if (!m) return;
    let doc: string | undefined;
    for (let j = i - 1; j >= 0; j--) {
      const t = lines[j].trim();
      if (t.startsWith("#[")) continue;
      if (t.startsWith("///")) {
        doc = t.slice(3).trim();
        // keep going up: the first line of a multi-line comment wins
        continue;
      }
      break;
    }
    result.set(m[1], doc ?? m[1].replace(/^test_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()));
  });
  return result;
}

/** Turns `cargo test` output into per-test results. Returns null if no tests ran. */
export function parseTestOutput(stdout: string, descriptions: Map<string, string>): TestResult[] | null {
  const results: TestResult[] = [];
  const failures = new Map<string, string>();

  const sections = stdout.split(/^---- tests::(\w+) stdout ----$/m);
  for (let i = 1; i < sections.length; i += 2) {
    const name = sections[i];
    const body = sections[i + 1].split(/^\n?failures:$/m)[0];
    const message = body
      .split("\n")
      .filter((l) => !/^thread '.*' panicked at /.test(l) && !/^note: run with `RUST_BACKTRACE/.test(l))
      .join("\n")
      .trim();
    failures.set(name, message || "This test failed");
  }

  for (const m of stdout.matchAll(/^test tests::(\w+)(?: - should panic)? \.\.\. (ok|FAILED|ignored)/gm)) {
    const [, name, status] = m;
    if (status === "ignored") continue;
    results.push({
      name,
      description: descriptions.get(name) ?? name,
      passed: status === "ok",
      error: status === "ok" ? null : (failures.get(name) ?? "This test failed"),
    });
  }
  if (results.length === 0) return null;
  // Show tests in the order they're written, not the order they finished.
  const order = [...descriptions.keys()];
  return results.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

async function callPlayground(body: object, signal?: AbortSignal): Promise<PlaygroundResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), TIMEOUT_MS);
  const onAbort = () => controller.abort("user");
  signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch(`${PLAYGROUND_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`The Rust Playground returned ${response.status}. ${text.slice(0, 300)}`);
    }
    return (await response.json()) as PlaygroundResponse;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function runRust({ code, tests, signal }: RustRunOptions): Promise<RunResult & { stdout: string; stderr: string }> {
  const started = performance.now();
  const grading = tests !== undefined;
  // Exercise code usually has no main. "Run only" then compiles it as a library and runs
  // any #[test] functions the learner wrote, instead of failing with "main not found".
  const library = !grading && !/\bfn\s+main\s*\(/.test(code);
  const empty = { figures: [] as string[], tests: null, stdout: "", stderr: "" };
  let response: PlaygroundResponse;
  try {
    response = await callPlayground(
      {
        channel: "stable",
        mode: "debug",
        edition: RUST_EDITION,
        crateType: grading || library ? "lib" : "bin",
        tests: grading || library,
        backtrace: false,
        code: grading ? buildTestCrate(code, tests) : code,
      },
      signal,
    );
  } catch (error) {
    if (signal?.aborted) {
      return { ok: false, error: "Stopped.", ...empty, stopped: "user" };
    }
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      error: timedOut
        ? `The Rust Playground didn't answer within ${TIMEOUT_MS / 1000} seconds. It may be busy, or your code has a loop that never ends. Try again.`
        : `Couldn't reach the Rust Playground (${PLAYGROUND_URL}). Check your connection and try again.\n${error instanceof Error ? error.message : ""}`.trim(),
      ...empty,
      stopped: timedOut ? "timeout" : undefined,
    };
  }

  const stderr = cleanStderr(response.stderr);
  const duration = Math.round(performance.now() - started);
  if (grading) {
    const results = parseTestOutput(response.stdout, testDescriptions(tests));
    if (!results) {
      return { ok: false, error: stderr || "Your code didn't compile, so the tests couldn't run.", figures: [], tests: null, duration, stdout: "", stderr: "" };
    }
    return { ok: true, error: null, figures: [], tests: results, duration, stdout: "", stderr: stderr.includes("warning") ? stderr : "" };
  }
  if (library) {
    const compiled = /^test result:/m.test(response.stdout);
    if (!compiled) {
      return { ok: false, error: stderr || "Your code didn't compile.", figures: [], tests: null, duration, stdout: "", stderr: "" };
    }
    const note = "Compiled successfully. There's no fn main() to run, so any #[test] functions you wrote were run instead:\n\n";
    return { ok: response.success, error: null, figures: [], tests: null, duration, stdout: note + response.stdout.trim() + "\n", stderr: stderr.includes("warning") ? stderr : "" };
  }
  if (!response.success) {
    return { ok: false, error: stderr || response.exitDetail || "Your program failed.", figures: [], tests: null, duration, stdout: response.stdout, stderr: "" };
  }
  return { ok: true, error: null, figures: [], tests: null, duration, stdout: response.stdout, stderr };
}

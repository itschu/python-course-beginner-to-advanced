"""Validate every lesson in content/.

For each lesson file this script:
  * checks the frontmatter and block syntax (mirrors lib/lesson-parser.ts),
  * runs every runnable ```python block (it must not raise, unless marked expect-error),
  * runs each exercise's solution against its tests (all must pass),
  * runs each exercise's starter code against its tests (at least one must fail,
    otherwise the tests don't check anything).

Code runs through public/pyodide-harness.py, the same harness the browser uses,
in a temporary working directory where "data/" points at public/data. Threads
and network access are disabled to mimic the browser (Pyodide has neither).

Usage:  python scripts/validate_content.py [--phase SLUG] [-k TEXT] [--verbose]
Needs:  numpy pandas scikit-learn scipy matplotlib statsmodels pydantic fastapi httpx sqlalchemy
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import re
import runpy
import signal
import socket
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
PUBLIC = ROOT / "public"
FILE_RE = re.compile(r"^(\d+)-([a-z0-9-]+)\.md$")
FENCE_RE = re.compile(r"^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*(.*)$")
DIRECTIVE_RE = re.compile(r"^:::(\w+)\s*(.*)$")
CALLOUTS = {"note", "tip", "warning", "colab", "info"}
KINDS = {"lesson", "project", "checkpoint"}
TIMEOUT_SECONDS = 180


@dataclass
class Exercise:
    id: str
    title: str
    starter: str
    solution: str
    tests: str
    line: int


@dataclass
class Lesson:
    path: Path
    meta: dict
    code_blocks: list[tuple[int, str, list[str]]] = field(default_factory=list)
    exercises: list[Exercise] = field(default_factory=list)
    quiz_ids: list[str] = field(default_factory=list)


class ParseError(Exception):
    pass


def phase_slugs() -> list[str]:
    text = (CONTENT / "curriculum.ts").read_text()
    return re.findall(r'^\s{4}slug: "([a-z0-9-]+)"', text, flags=re.M)


def parse_frontmatter(text: str, path: Path) -> tuple[dict, str, int]:
    if not text.startswith("---\n"):
        raise ParseError(f"{path}: missing frontmatter")
    end = text.index("\n---\n", 4)
    meta = {}
    for line in text[4:end].splitlines():
        if not line.strip():
            continue
        key, _, value = line.partition(":")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        meta[key.strip()] = value
    body_start_line = text[: end + 5].count("\n") + 1
    return meta, text[end + 5 :], body_start_line


def is_fence_close(line: str, fence: str) -> bool:
    t = line.strip()
    return len(t) >= len(fence) and t[0] == fence[0] and re.fullmatch(r"`+|~+", t) is not None


def strip_blank(text: str) -> str:
    lines = text.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines)


def parse_lesson(path: Path) -> Lesson:
    meta, body, offset = parse_frontmatter(path.read_text(), path)
    for key in ("title", "summary", "minutes"):
        if not meta.get(key):
            raise ParseError(f"{path}: frontmatter is missing '{key}'")
    if meta.get("kind", "lesson") not in KINDS:
        raise ParseError(f"{path}: unknown kind {meta['kind']!r}")
    lesson = Lesson(path=path, meta=meta)
    lines = body.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        fence = FENCE_RE.match(line)
        if fence and fence.group(1) == "":
            marker, lang, info = fence.group(2), fence.group(3), fence.group(4)
            j = i + 1
            while j < len(lines) and not is_fence_close(lines[j], marker):
                j += 1
            if j >= len(lines):
                raise ParseError(f"{path}:{i + offset}: unclosed code fence")
            if lang in ("python", "py"):
                lesson.code_blocks.append((i + offset, "\n".join(lines[i + 1 : j]), info.split()))
            i = j + 1
            continue
        directive = DIRECTIVE_RE.match(line)
        if directive:
            kind, rest = directive.group(1), directive.group(2).strip()
            j = i + 1
            in_fence = None
            code_section = False
            body_lines = []
            while j < len(lines):
                l = lines[j]
                if not in_fence and l.strip() == ":::":
                    break
                if kind == "exercise" and not in_fence and re.fullmatch(r"@@\w+\s*", l):
                    code_section = l.strip()[2:] in ("starter", "solution", "tests")
                elif not code_section:
                    f = FENCE_RE.match(l)
                    if f:
                        if in_fence and is_fence_close(l, in_fence):
                            in_fence = None
                        elif not in_fence:
                            in_fence = f.group(2)
                body_lines.append(l)
                j += 1
            if j >= len(lines):
                raise ParseError(f"{path}:{i + offset}: unclosed :::{kind}")
            if kind == "exercise":
                lesson.exercises.append(parse_exercise(rest, body_lines, path, i + offset))
            elif kind == "quiz":
                lesson.quiz_ids.append(parse_quiz(rest, body_lines, path, i + offset))
            elif kind not in CALLOUTS:
                raise ParseError(f"{path}:{i + offset}: unknown block :::{kind}")
            i = j + 1
            continue
        i += 1
    ids = [e.id for e in lesson.exercises] + lesson.quiz_ids
    dupes = {x for x in ids if ids.count(x) > 1}
    if dupes:
        raise ParseError(f"{path}: duplicate ids {sorted(dupes)}")
    for x in ids:
        if not re.fullmatch(r"[a-z0-9-]{1,80}", x):
            raise ParseError(f"{path}: id {x!r} must be lowercase letters, digits and dashes")
    return lesson


def parse_exercise(rest: str, body: list[str], path: Path, line: int) -> Exercise:
    parts = rest.split()
    if not parts:
        raise ParseError(f"{path}:{line}: exercise needs an id")
    sections: dict[str, list[str]] = {"prompt": []}
    current = sections["prompt"]
    for l in body:
        m = re.fullmatch(r"@@(\w+)\s*", l)
        if m:
            name = m.group(1)
            if name == "hint":
                current = []
                continue
            if name not in ("starter", "solution", "tests"):
                raise ParseError(f"{path}:{line}: unknown section @@{name}")
            if name in sections:
                raise ParseError(f"{path}:{line}: duplicate @@{name}")
            current = sections[name] = []
            continue
        current.append(l)
    for name in ("starter", "solution", "tests"):
        if name not in sections:
            raise ParseError(f"{path}:{line}: exercise {parts[0]} is missing @@{name}")
    if not "\n".join(sections["prompt"]).strip():
        raise ParseError(f"{path}:{line}: exercise {parts[0]} has no prompt")
    return Exercise(
        id=parts[0],
        title=" ".join(parts[1:]) or "Exercise",
        starter=strip_blank("\n".join(sections["starter"])),
        solution=strip_blank("\n".join(sections["solution"])),
        tests=strip_blank("\n".join(sections["tests"])),
        line=line,
    )


def parse_quiz(rest: str, body: list[str], path: Path, line: int) -> str:
    parts = rest.split()
    if not parts:
        raise ParseError(f"{path}:{line}: quiz needs an id")
    questions = []
    for l in body:
        if l.startswith("? "):
            questions.append({"q": l[2:], "options": []})
        elif questions and re.match(r"^- \[( |x|X)\] ", l):
            questions[-1]["options"].append(l[3].lower() == "x")
    if not questions:
        raise ParseError(f"{path}:{line}: quiz {parts[0]} has no questions")
    for q in questions:
        if len(q["options"]) < 2 or not any(q["options"]):
            raise ParseError(f"{path}:{line}: quiz question {q['q']!r} needs 2+ options and a correct answer")
    return parts[0]


# ---------------------------------------------------------------- execution


def sandbox_like_browser() -> None:
    def no_threads(self, *args, **kwargs):
        raise RuntimeError("can't start new thread (threads are not available in the browser runner)")

    def no_network(self, *args, **kwargs):
        raise OSError("network access is not available in this validator")

    threading.Thread.start = no_threads  # type: ignore[method-assign]
    socket.socket.connect = no_network  # type: ignore[method-assign]


class Timeout(Exception):
    pass


def run(harness: dict, code: str, tests: str | None = None) -> tuple[dict, str]:
    def on_alarm(signum, frame):
        raise Timeout()

    signal.signal(signal.SIGALRM, on_alarm)
    signal.alarm(TIMEOUT_SECONDS)
    buffer = io.StringIO()
    real_stdout, real_stderr = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = buffer
    try:
        result = json.loads(asyncio.run(harness["_pp_run"](code, tests)))
    except Timeout:
        result = {"ok": False, "error": f"timed out after {TIMEOUT_SECONDS}s", "tests": None}
    finally:
        sys.stdout, sys.stderr = real_stdout, real_stderr
        signal.alarm(0)
    return result, buffer.getvalue()


def summarize_tests(tests: list[dict] | None) -> str:
    if not tests:
        return "no tests ran"
    return "; ".join(f"{t['name']}: {'ok' if t['passed'] else t['error']}" for t in tests)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase")
    parser.add_argument("-k", dest="keyword")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--no-run", action="store_true", help="only check syntax")
    args = parser.parse_args()

    slugs = phase_slugs()
    unknown_dirs = {p.name for p in CONTENT.iterdir() if p.is_dir()} - set(slugs)
    errors: list[str] = []
    if unknown_dirs:
        errors.append(f"content folders not listed in curriculum.ts: {sorted(unknown_dirs)}")

    lessons: list[Lesson] = []
    for slug in slugs:
        if args.phase and slug != args.phase:
            continue
        folder = CONTENT / slug
        if not folder.exists():
            continue
        orders = set()
        for path in sorted(folder.iterdir()):
            if path.suffix != ".md":
                continue
            m = FILE_RE.match(path.name)
            if not m:
                errors.append(f"{path}: file name must look like 01-lesson-slug.md")
                continue
            if m.group(1) in orders:
                errors.append(f"{path}: duplicate lesson number {m.group(1)}")
            orders.add(m.group(1))
            if args.keyword and args.keyword not in str(path):
                continue
            try:
                lessons.append(parse_lesson(path))
            except ParseError as exc:
                errors.append(str(exc))

    counts = {"lessons": len(lessons), "cells": 0, "exercises": 0}
    if not args.no_run:
        workdir = Path(tempfile.mkdtemp(prefix="pypath-validate-"))
        (workdir / "data").symlink_to(PUBLIC / "data", target_is_directory=True)
        os.chdir(workdir)
        sandbox_like_browser()
        harness = runpy.run_path(str(PUBLIC / "pyodide-harness.py"))
        for lesson in lessons:
            rel = lesson.path.relative_to(ROOT)
            started = time.perf_counter()
            for line, code, info in lesson.code_blocks:
                if "static" in info:
                    continue
                counts["cells"] += 1
                result, out = run(harness, code)
                expect_error = "expect-error" in info
                if result["ok"] == expect_error:
                    what = "should raise an error but ran fine" if expect_error else f"raised:\n{result['error']}"
                    errors.append(f"{rel}:{line}: code cell {what}\n--- output ---\n{out[-1500:]}")
            for ex in lesson.exercises:
                counts["exercises"] += 1
                result, out = run(harness, ex.solution, ex.tests)
                if not result["ok"]:
                    errors.append(f"{rel}:{ex.line}: exercise {ex.id}: solution raised:\n{result['error']}")
                elif not result["tests"] or not all(t["passed"] for t in result["tests"]):
                    errors.append(f"{rel}:{ex.line}: exercise {ex.id}: solution fails tests: {summarize_tests(result['tests'])}")
                result, _ = run(harness, ex.starter, ex.tests)
                if result["ok"] and result["tests"] and all(t["passed"] for t in result["tests"]):
                    errors.append(f"{rel}:{ex.line}: exercise {ex.id}: starter code already passes every test")
            if args.verbose:
                print(f"  {rel} ({time.perf_counter() - started:.1f}s)", file=sys.stderr)

    print(
        f"Checked {counts['lessons']} lessons, {counts['cells']} code cells, {counts['exercises']} exercises.",
        file=sys.stderr,
    )
    if errors:
        print(f"\n{len(errors)} problem(s):\n", file=sys.stderr)
        for e in errors:
            print(f"✗ {e}\n", file=sys.stderr)
        return 1
    print("All content is valid.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

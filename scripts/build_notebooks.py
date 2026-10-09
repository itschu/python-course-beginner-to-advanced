"""Build the Colab notebooks in notebooks/ from their sources in notebooks/src/.

Sources are plain Python files in the "percent" format: a line starting with `# %%` begins a code
cell, and `# %% [markdown]` begins a Markdown cell whose lines start with `# `. Keeping sources as
.py files makes them easy to review, diff and run locally:

    python scripts/build_notebooks.py          # rebuild every notebook
    python notebooks/src/07-06-pytorch-basics.py   # run a source directly (needs PyTorch)
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "notebooks" / "src"
OUT = ROOT / "notebooks"


def parse(text: str) -> list[dict]:
    cells: list[dict] = []
    kind, lines = None, []

    def flush() -> None:
        if kind is None:
            return
        body = lines[:]
        while body and not body[-1].strip():
            body.pop()
        while body and not body[0].strip():
            body.pop(0)
        if not body:
            return
        if kind == "markdown":
            body = [line[2:] if line.startswith("# ") else line.lstrip("#") for line in body]
            cells.append({"cell_type": "markdown", "metadata": {}, "source": join(body)})
        else:
            cells.append({"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": join(body)})

    for line in text.splitlines():
        if line.startswith("# %%"):
            flush()
            kind, lines = ("markdown" if "[markdown]" in line else "code"), []
        elif kind is not None:
            lines.append(line)
    flush()
    return cells


def join(lines: list[str]) -> list[str]:
    return [line + "\n" for line in lines[:-1]] + [lines[-1]]


def build(path: Path) -> Path:
    notebook = {
        "cells": parse(path.read_text()),
        "metadata": {
            "accelerator": "GPU",
            "colab": {"provenance": [], "gpuType": "T4"},
            "kernelspec": {"display_name": "Python 3", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 0,
    }
    target = OUT / f"{path.stem}.ipynb"
    target.write_text(json.dumps(notebook, indent=1, ensure_ascii=False) + "\n")
    return target


def main() -> int:
    sources = sorted(SRC.glob("*.py"))
    if not sources:
        print("no notebook sources found", file=sys.stderr)
        return 1
    for source in sources:
        target = build(source)
        print(f"{source.relative_to(ROOT)} -> {target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

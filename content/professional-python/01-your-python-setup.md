---
title: Set up Python on your computer
summary: Install Python, VS Code and uv, learn enough terminal to be dangerous, and create your first project with a virtual environment.
minutes: 60
kind: lesson
---

The browser runner is perfect for learning, but professional work happens on your own machine: real files, real projects, version control and tools like VS Code. This lesson gets you set up. It's mostly following steps rather than writing code, and you only do it once.

:::note Your existing experience helps
If you've used Docker, git or the terminal before, much of this will feel familiar. Python's virtual environments are a lightweight cousin of containers: each project gets its own isolated set of packages.
:::

## 1. Install Python

- **Windows / macOS:** download the latest Python 3 (3.13 or newer) from [python.org/downloads](https://www.python.org/downloads/). On Windows, tick **"Add python.exe to PATH"** in the installer.
- **Linux:** Python is usually installed already. Check with `python3 --version`.

Check it worked in a terminal (Terminal on macOS, PowerShell on Windows):

```bash
python3 --version     # on Windows you may need: py --version
```

## 2. Install VS Code and the Python extension

1. Install [Visual Studio Code](https://code.visualstudio.com/).
2. Open the Extensions panel (the squares icon) and install **Python** by Microsoft. It brings syntax checking, a debugger, Jupyter notebook support, and Pylance for autocomplete and type checking.

## 3. Install uv

[uv](https://docs.astral.sh/uv/) is a fast, modern tool that installs Python packages and manages projects and virtual environments. Install it with the command from the uv website for your system, for example on macOS or Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

On Windows (PowerShell):

```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

:::info pip and venv still matter
You'll see `pip install` and `python -m venv` in most tutorials. They're the standard tools that come with Python, and they work fine. uv does the same jobs, much faster, with a single command. Learn uv, but recognise the others.
:::

## 4. Terminal survival kit

| Command (macOS/Linux) | Windows PowerShell | What it does |
| --- | --- | --- |
| `pwd` | `pwd` | Show the current folder |
| `ls` | `ls` or `dir` | List files |
| `cd folder` | `cd folder` | Move into a folder (`cd ..` goes up one) |
| `mkdir name` | `mkdir name` | Create a folder |
| `python3 file.py` | `py file.py` | Run a Python script |
| Up arrow | Up arrow | Repeat a previous command |
| `Ctrl + C` | `Ctrl + C` | Stop a running program |

## 5. Create a project

```bash
uv init betting-tools      # creates a folder with pyproject.toml, main.py and a README
cd betting-tools
uv add pandas pytest       # creates a virtual environment (.venv) and installs packages
uv run main.py             # runs a script inside the project's environment
code .                     # opens the folder in VS Code
```

`uv init` creates a **`pyproject.toml`**, the standard file that describes a Python project: its name, Python version and dependencies. `uv add` records each dependency there and pins exact versions in `uv.lock`, so anyone (or any server) can recreate the same environment with `uv sync`.

```toml
[project]
name = "betting-tools"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [
    "pandas>=3.0",
    "pytest>=9.0",
]
```

## Why virtual environments?

Without them, every project shares one global set of packages. Project A needs pandas 2, project B needs pandas 3, and one of them breaks. A **virtual environment** is a folder (`.venv`) containing its own Python and packages for one project. uv creates and uses it automatically; in VS Code, choose it with **Python: Select Interpreter** from the command palette (`Ctrl/⌘ + Shift + P`).

The classic way, for reference:

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install pandas
pip freeze > requirements.txt    # record what's installed
```

Add `.venv/` to your `.gitignore`. Environments are rebuilt from `pyproject.toml`, never committed.

## 6. Scripts and the `__main__` guard

Create `betting.py`:

```python static
def implied_probability(odds: float) -> float:
    return 1 / odds


if __name__ == "__main__":
    # Runs only when you run this file directly: `uv run betting.py`
    print(implied_probability(2.5))
```

Every module has a `__name__`. When you run a file directly it's `"__main__"`; when another file imports it, it's the module's name (`"betting"`). The guard lets one file be both an importable library and a runnable script. You'll see it in almost every Python project.

```python
print(__name__)
```

## 7. Notebooks

Jupyter notebooks (`.ipynb`) mix code, output, charts and notes, and they're popular for data exploration. VS Code opens them directly; Google Colab runs them in the cloud. Use notebooks to **explore**, then move code you want to keep into `.py` files with tests. Notebooks are hard to test, review and reuse.

## 8. Git

Put every project under version control from day one:

```bash
git init
git add .
git commit -m "Start betting tools project"
```

Then create a repository on GitHub and push it. Your GitHub profile becomes your portfolio, and Phase 9 shows you how to make it shine.

## Checklist

Before the next lesson, make sure you can:

- [ ] run `python3 --version` (or `py --version`) and see 3.13 or newer
- [ ] create a project with `uv init`, add a package with `uv add`, and run a script with `uv run`
- [ ] open the project in VS Code with the `.venv` interpreter selected
- [ ] commit the project to git

From here on, lessons still run in the browser, but try the code in your own project too.

:::quiz setup-quiz Quick check
? What is a virtual environment?
- [x] An isolated folder of Python packages for one project
- [ ] A virtual machine that runs Linux
- [ ] A cloud server
> It keeps each project's dependencies separate, so projects can't break each other.

? Which file lists a modern Python project's dependencies?
- [x] `pyproject.toml`
- [ ] `package.json`
- [ ] `Dockerfile`
> `requirements.txt` is the older convention; `pyproject.toml` is the standard now.

? When is `__name__ == "__main__"` true?
- [x] When the file is run directly as a script
- [ ] When the file is imported by another module
- [ ] Always
> When imported, `__name__` is the module's name instead.

? Should you commit your `.venv` folder to git?
- [ ] Yes, so others get the same packages
- [x] No. Commit `pyproject.toml` and the lock file; the environment is rebuilt from them
> Environments are large and machine-specific.
:::

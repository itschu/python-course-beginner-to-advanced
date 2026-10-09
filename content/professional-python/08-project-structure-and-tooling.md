---
title: Project structure, logging and configuration
summary: Organise code into packages, log properly instead of printing, build command-line tools, read configuration safely, and automate checks with CI.
minutes: 55
kind: lesson
---

A notebook full of cells is fine for exploring. A model that runs every morning in production needs structure. This lesson covers the scaffolding of a real Python project.

## A standard layout

```text
betting-tools/
├── pyproject.toml          # project metadata and dependencies
├── uv.lock                 # exact versions (commit this)
├── README.md
├── .gitignore
├── src/
│   └── betting_tools/      # your package
│       ├── __init__.py     # marks the folder as a package
│       ├── odds.py         # one module per topic
│       ├── bankroll.py
│       └── cli.py
└── tests/
    ├── test_odds.py
    └── test_bankroll.py
```

- A **module** is one `.py` file. A **package** is a folder of modules with an `__init__.py`.
- Putting the package inside `src/` (the "src layout") ensures your tests run against the installed package, not stray files, which catches packaging mistakes early. `uv init --package` sets this up for you.
- Inside the package, modules import each other with `from betting_tools.odds import implied_probability`, or relatively with `from .odds import implied_probability`.

## Logging instead of print

`print` is for output your user asked for. For messages about what the program is doing (progress, warnings, errors) use the `logging` module. Logs have **levels**, can be switched on and off without editing code, and can go to files or monitoring systems:

```python
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s", force=True)
logger = logging.getLogger("betting_tools.loader")

def load_odds(rows):
    valid = []
    for i, row in enumerate(rows):
        try:
            odds = float(row)
        except ValueError:
            logger.warning("row %d: could not parse %r, skipping", i, row)
            continue
        valid.append(odds)
    logger.info("loaded %d of %d rows", len(valid), len(rows))
    logger.debug("this won't show: the level is INFO")
    return valid

load_odds(["2.1", "x", "3.4"])
```

| Level | Use for |
| --- | --- |
| `DEBUG` | Detailed diagnostics while developing |
| `INFO` | Normal milestones: "loaded 1,140 matches", "model trained" |
| `WARNING` | Something unexpected, but the program carries on |
| `ERROR` | Something failed |
| `CRITICAL` | The program can't continue |

Conventions: create one logger per module with `logging.getLogger(__name__)`, configure logging **once** at the program's entry point, and pass values as arguments (`logger.info("loaded %d", n)`) rather than f-strings, so the message is only built if it's actually logged.

## Configuration and secrets

Don't hard-code settings like file paths, API keys or model parameters. Read them from **environment variables** (or a config file), with sensible defaults:

```python
import os

def load_settings(env=None):
    env = os.environ if env is None else env
    return {
        "data_dir": env.get("DATA_DIR", "data"),
        "max_stake": float(env.get("MAX_STAKE", "10")),
        "debug": env.get("DEBUG", "false").lower() in ("1", "true", "yes"),
    }

print(load_settings({}))
print(load_settings({"MAX_STAKE": "25", "DEBUG": "true"}))
```

:::warning Never commit secrets
API keys and passwords go in environment variables or a `.env` file that's listed in `.gitignore`, never in your code or repo. Bots scan GitHub for leaked keys within minutes of a push. If you leak one, revoke it immediately; deleting the commit isn't enough.
:::

## Command-line interfaces with argparse

Turn a script into a proper tool that accepts options:

```python
import argparse

def build_parser():
    parser = argparse.ArgumentParser(description="Evaluate a bet")
    parser.add_argument("probability", type=float, help="your estimated probability (0-1)")
    parser.add_argument("odds", type=float, help="decimal odds offered")
    parser.add_argument("--stake", type=float, default=10.0, help="stake in pounds")
    parser.add_argument("--verbose", "-v", action="store_true")
    return parser

args = build_parser().parse_args(["0.55", "2.0", "--stake", "25", "-v"])   # normally parse_args() reads sys.argv
print(args)
ev = args.probability * args.stake * (args.odds - 1) - (1 - args.probability) * args.stake
print(f"EV: £{ev:.2f}")
```

On your machine you'd run `uv run evaluate.py 0.55 2.0 --stake 25`, and `--help` is generated automatically.

## Paths with pathlib

`pathlib.Path` handles file paths across Windows, macOS and Linux:

```python
from pathlib import Path

data = Path("data")
print(data / "matches.csv")                    # join paths with /
print((data / "matches.csv").exists())
print((data / "matches.csv").suffix, (data / "matches.csv").stem)
print(sorted(p.name for p in data.glob("*.csv")))
```

## Automate the checks: CI

Continuous integration runs your tests and linters on every push, so broken code never reaches `main`. With GitHub Actions, a workflow file is all it takes:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync
      - run: uv run ruff check .
      - run: uv run pytest
```

## Practice

:::exercise cli-parser A command-line parser
Write `build_parser()` returning an `argparse.ArgumentParser` for a tool used like:

```bash
backtest matches.csv --stake 5 --min-edge 0.03 --seasons 2023-24 2024-25
```

- a required positional argument `path` (string)
- `--stake`: float, default `10.0`
- `--min-edge`: float, default `0.02` (it becomes `args.min_edge`)
- `--seasons`: one or more strings (`nargs="+"`), default an empty list
- `--dry-run`: a flag that's `False` unless given

@@starter
import argparse

def build_parser():
    parser = argparse.ArgumentParser(description="Backtest a betting strategy")
    return parser

@@solution
import argparse

def build_parser():
    parser = argparse.ArgumentParser(description="Backtest a betting strategy")
    parser.add_argument("path")
    parser.add_argument("--stake", type=float, default=10.0)
    parser.add_argument("--min-edge", type=float, default=0.02)
    parser.add_argument("--seasons", nargs="+", default=[])
    parser.add_argument("--dry-run", action="store_true")
    return parser

@@tests
def test_defaults():
    """Defaults are applied"""
    args = build_parser().parse_args(["matches.csv"])
    assert args.path == "matches.csv"
    assert args.stake == 10.0 and args.min_edge == 0.02
    assert args.seasons == [] and args.dry_run is False

def test_all_options():
    """All options are parsed with the right types"""
    args = build_parser().parse_args(["m.csv", "--stake", "5", "--min-edge", "0.03", "--seasons", "2023-24", "2024-25", "--dry-run"])
    assert args.stake == 5.0 and isinstance(args.stake, float)
    assert args.min_edge == 0.03
    assert args.seasons == ["2023-24", "2024-25"]
    assert args.dry_run is True

def test_path_required():
    """path is required"""
    try:
        build_parser().parse_args([])
    except SystemExit:
        return
    raise AssertionError("parsing with no path should fail")

@@hint
`--min-edge` is stored as `args.min_edge`: argparse turns dashes into underscores. Flags use `action="store_true"`.
:::

:::exercise logging-warnings Log bad rows
Write `clean_stakes(values)` that converts a list of strings to floats and returns the valid ones. For each value that can't be converted, or is not positive, log a **warning** with the logger named `"betting.clean"` and skip it. At the end, log an **info** message with how many values were kept.

@@starter
import logging

logger = logging.getLogger("betting.clean")

def clean_stakes(values):
    return [float(v) for v in values]

@@solution
import logging

logger = logging.getLogger("betting.clean")

def clean_stakes(values):
    kept = []
    for v in values:
        try:
            stake = float(v)
        except ValueError:
            logger.warning("not a number: %r", v)
            continue
        if stake <= 0:
            logger.warning("stake must be positive: %r", v)
            continue
        kept.append(stake)
    logger.info("kept %d of %d stakes", len(kept), len(values))
    return kept

@@tests
import logging

class Capture(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.records = []
    def emit(self, record):
        self.records.append(record)

def run(values):
    log = logging.getLogger("betting.clean")
    handler = Capture()
    log.addHandler(handler)
    old = log.level
    log.setLevel(logging.DEBUG)
    try:
        result = clean_stakes(values)
    finally:
        log.removeHandler(handler)
        log.setLevel(old)
    return result, handler.records

def test_values():
    """Returns only valid positive stakes"""
    result, _ = run(["10", "abc", "-5", "2.5", "0"])
    assert result == [10.0, 2.5]

def test_warnings():
    """Logs one warning per bad value"""
    _, records = run(["10", "abc", "-5", "2.5", "0"])
    warnings = [r for r in records if r.levelno == logging.WARNING]
    assert len(warnings) == 3, f"expected 3 warnings, got {len(warnings)}"

def test_info_summary():
    """Logs an info summary"""
    _, records = run(["1", "2"])
    assert any(r.levelno == logging.INFO for r in records), "log an info message at the end"

def test_logger_name():
    """Uses the 'betting.clean' logger"""
    _, records = run(["x"])
    assert records and all(r.name == "betting.clean" for r in records)
:::

:::exercise settings-env Typed settings
Write `load_settings(env)` that reads configuration from the dictionary `env` and returns a **frozen dataclass** `Settings` with:

- `bankroll`: float from `BANKROLL`, default `1000.0`
- `kelly_fraction`: float from `KELLY_FRACTION`, default `0.25`; raise `ValueError` if it isn't between 0 (exclusive) and 1 (inclusive)
- `leagues`: tuple of strings from `LEAGUES`, a comma-separated list like `"E0, E1"`; default empty tuple, with whitespace stripped and empty entries dropped

@@starter
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    bankroll: float
    kelly_fraction: float
    leagues: tuple[str, ...]

def load_settings(env):
    pass

@@solution
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    bankroll: float
    kelly_fraction: float
    leagues: tuple[str, ...]

def load_settings(env):
    kelly = float(env.get("KELLY_FRACTION", "0.25"))
    if not 0 < kelly <= 1:
        raise ValueError(f"KELLY_FRACTION must be in (0, 1], got {kelly}")
    leagues = tuple(x.strip() for x in env.get("LEAGUES", "").split(",") if x.strip())
    return Settings(bankroll=float(env.get("BANKROLL", "1000")), kelly_fraction=kelly, leagues=leagues)

@@tests
def test_defaults():
    """Defaults when nothing is set"""
    assert load_settings({}) == Settings(1000.0, 0.25, ())

def test_values():
    """Reads and converts values"""
    s = load_settings({"BANKROLL": "250", "KELLY_FRACTION": "0.5", "LEAGUES": " E0, E1 ,,SP1 "})
    assert s == Settings(250.0, 0.5, ("E0", "E1", "SP1")), s

def test_invalid_kelly():
    """Rejects out-of-range Kelly fractions"""
    for bad in ["0", "1.5", "-0.2"]:
        try:
            load_settings({"KELLY_FRACTION": bad})
        except ValueError:
            continue
        raise AssertionError(f"KELLY_FRACTION={bad} should raise ValueError")
:::

:::quiz structure-quiz Quick check
? Why use `logging` instead of `print` for diagnostics?
- [x] Levels let you turn detail on and off without editing code
- [x] Logs can be sent to files or monitoring tools
- [ ] It's faster to type
> And messages carry timestamps, module names and levels.

? Where should an API key live?
- [ ] In the source code, as a constant
- [x] In an environment variable or an ignored .env file
- [ ] In the README
> Anything committed to git should be treated as public.

? What does `--min-edge` become on the parsed args object?
- [ ] `args.min-edge`
- [x] `args.min_edge`
- [ ] `args.minEdge`
> argparse converts dashes to underscores.

? What does CI do?
- [x] Runs tests and checks automatically on every push or pull request
- [ ] Deploys code to production
- [ ] Writes tests for you
> Continuous deployment (CD) is the deploying part; CI is the checking part.
:::

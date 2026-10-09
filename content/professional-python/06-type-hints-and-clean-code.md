---
title: Type hints and clean code
summary: Document and check your code with type hints, follow Python's style conventions, and refactor messy code into clear, small functions.
minutes: 50
kind: lesson
---

Code is read far more often than it's written: by teammates, by reviewers, and by you in six months. Professional code is judged on clarity as much as correctness.

## Type hints

**Type hints** say what types a function expects and returns:

```python
def expected_value(probability: float, odds: float, stake: float = 1.0) -> float:
    return probability * stake * (odds - 1) - (1 - probability) * stake

print(expected_value(0.55, 2.0, stake=10))
print(expected_value.__annotations__)
```

Python **doesn't enforce them** when the code runs. Instead:

- they document your intent right where it's needed,
- your editor uses them for autocomplete and to underline mistakes as you type,
- a **type checker** such as [mypy](https://mypy.readthedocs.io/) or Pyright can check a whole codebase for type errors without running it.

```python
def implied_probability(odds: float) -> float:
    return 1 / odds

print(implied_probability("2.5" if False else 2.5))
# implied_probability("2.5") would be flagged by a type checker before you ever run it.
```

## The common types

```python static
from collections.abc import Callable, Iterable, Iterator

count: int = 0
ratio: float = 0.5
name: str = "Ada"
active: bool = True

goals: list[int] = [2, 0, 1]
score: tuple[int, int] = (2, 1)
odds: dict[str, float] = {"home": 2.1}
teams: set[str] = {"Ashford City"}

maybe_odds: float | None = None         # either a float or None

def mean(values: Iterable[float]) -> float: ...           # accepts any iterable: list, tuple, generator
def count_up() -> Iterator[int]: ...                      # generators return iterators
def apply(func: Callable[[float], float], x: float) -> float: ...   # a function from float to float
```

`X | None` is extremely common: it says a value might be missing. A type checker then makes you handle the `None` case before using the value, which prevents a whole class of crashes.

Use broad types for parameters (`Iterable`, `Sequence`, `Mapping`) and specific types for return values (`list`, `dict`). That makes functions flexible about what they accept and precise about what they give back.

### Your own types

Classes are types too, and dataclasses are perfect for structured data:

```python
from dataclasses import dataclass
from typing import Literal

Result = Literal["H", "D", "A"]          # only these three strings are allowed

@dataclass(frozen=True)
class Match:
    home: str
    away: str
    home_goals: int
    away_goals: int

def result(match: Match) -> Result:
    if match.home_goals > match.away_goals:
        return "H"
    if match.home_goals < match.away_goals:
        return "A"
    return "D"

print(result(Match("Ashford City", "Bramley Rovers", 1, 1)))
```

A `Protocol` describes "anything with these methods", without inheritance. It's how type checkers understand duck typing:

```python
from typing import Protocol

class Predictor(Protocol):
    def predict_proba(self, home: str, away: str) -> float: ...

class AlwaysHalf:
    def predict_proba(self, home: str, away: str) -> float:
        return 0.5

def evaluate(model: Predictor) -> float:
    return model.predict_proba("A", "B")

print(evaluate(AlwaysHalf()))     # AlwaysHalf never mentions Predictor, but fits it
```

## Style: PEP 8 and Ruff

[PEP 8](https://peps.python.org/pep-0008/) is Python's style guide. The essentials:

- 4 spaces per indent level; lines up to about 88–100 characters.
- `snake_case` for variables and functions, `CapWords` for classes, `UPPER_CASE` for constants.
- Two blank lines between top-level functions and classes.
- Imports at the top: standard library first, then third-party packages, then your own modules.

Don't memorise it. Let a tool enforce it. **Ruff** formats your code and catches common bugs:

```bash
uv add --dev ruff
uv run ruff format .        # reformat every file consistently
uv run ruff check . --fix   # find (and fix) problems
```

## Naming

Good names are the cheapest documentation there is.

```python static
# Bad
def calc(d, x):
    r = []
    for i in d:
        if i[2] > x:
            r.append(i)
    return r

# Good
def matches_with_more_goals_than(matches, threshold):
    return [m for m in matches if m.total_goals > threshold]
```

- Functions are verbs: `load_matches`, `calculate_margin`, `is_value_bet`.
- Booleans read as yes/no questions: `is_settled`, `has_odds`.
- Avoid abbreviations unless they're universal (`df` for a DataFrame and `i` for an index are fine).

## Small functions with one job

A function that does one thing is easy to name, test and reuse. Here's a typical first draft:

```python
def report(rows):
    total = 0
    wins = 0
    for r in rows:
        if r["stake"] > 0 and r["odds"] > 1:
            if r["won"]:
                total += r["stake"] * (r["odds"] - 1)
                wins += 1
            else:
                total -= r["stake"]
    staked = sum(r["stake"] for r in rows if r["stake"] > 0 and r["odds"] > 1)
    return f"profit {total:.2f}, win rate {wins / len(rows):.0%}, ROI {total / staked:.1%}"

rows = [{"stake": 10, "odds": 2.5, "won": True}, {"stake": 10, "odds": 2.0, "won": False}]
print(report(rows))
```

It mixes validation, calculation and formatting, repeats the validity check, and has a subtle bug: the win rate divides by *all* rows, including invalid ones. Refactored:

```python
def is_valid(bet: dict) -> bool:
    return bet["stake"] > 0 and bet["odds"] > 1

def profit(bet: dict) -> float:
    return bet["stake"] * (bet["odds"] - 1) if bet["won"] else -bet["stake"]

def summarise(bets: list[dict]) -> dict[str, float]:
    valid = [b for b in bets if is_valid(b)]
    total_profit = sum(profit(b) for b in valid)
    staked = sum(b["stake"] for b in valid)
    return {
        "profit": total_profit,
        "win_rate": sum(b["won"] for b in valid) / len(valid),
        "roi": total_profit / staked,
    }

def format_summary(summary: dict[str, float]) -> str:
    return f"profit {summary['profit']:.2f}, win rate {summary['win_rate']:.0%}, ROI {summary['roi']:.1%}"

rows = [{"stake": 10, "odds": 2.5, "won": True}, {"stake": 10, "odds": 2.0, "won": False}]
print(format_summary(summarise(rows)))
```

Each piece is now testable on its own, and the calculation returns *data*, so other code (a chart, an API) can use it without parsing a string.

## Comments and docstrings

- Comments should explain **why**, not repeat **what** the code says.
- Every public function, class and module should have a docstring explaining what it does, its arguments and its return value.

```python static
def kelly_fraction(probability: float, odds: float) -> float:
    """Fraction of the bankroll to stake according to the Kelly criterion.

    Args:
        probability: Your estimated probability that the bet wins, 0 to 1.
        odds: Decimal odds offered.

    Returns:
        The fraction to stake, or 0.0 when the bet has no edge.
    """
    b = odds - 1
    # Kelly can be negative when there's no edge; never bet against yourself.
    return max(0.0, (probability * b - (1 - probability)) / b)
```

## Practice

:::exercise annotate Add type hints
Add type hints to all three functions so they match these descriptions exactly:

- `margin(prices)` takes a list of floats and returns a float.
- `best_price(quotes)` takes a dictionary of str → float and returns a tuple of (str, float).
- `parse_odds(text)` takes a str and returns a float or None.

Don't change what the functions do.

@@starter
def margin(prices):
    return sum(1 / p for p in prices) - 1

def best_price(quotes):
    name = max(quotes, key=quotes.get)
    return name, quotes[name]

def parse_odds(text):
    try:
        return float(text)
    except ValueError:
        return None

@@solution
def margin(prices: list[float]) -> float:
    return sum(1 / p for p in prices) - 1

def best_price(quotes: dict[str, float]) -> tuple[str, float]:
    name = max(quotes, key=quotes.get)
    return name, quotes[name]

def parse_odds(text: str) -> float | None:
    try:
        return float(text)
    except ValueError:
        return None

@@tests
import typing

def test_margin_hints():
    """margin: list[float] -> float"""
    assert typing.get_type_hints(margin) == {"prices": list[float], "return": float}, typing.get_type_hints(margin)

def test_best_price_hints():
    """best_price: dict[str, float] -> tuple[str, float]"""
    assert typing.get_type_hints(best_price) == {"quotes": dict[str, float], "return": tuple[str, float]}, typing.get_type_hints(best_price)

def test_parse_odds_hints():
    """parse_odds: str -> float | None"""
    hints = typing.get_type_hints(parse_odds)
    assert hints.get("text") is str, hints
    assert hints.get("return") == (float | None), hints

def test_behaviour_unchanged():
    """The functions still work"""
    assert round(margin([2.0, 2.0]), 6) == 0
    assert best_price({"A": 2.1, "B": 2.3}) == ("B", 2.3)
    assert parse_odds("x") is None
:::

:::exercise refactor Refactor into small functions
`process` works, but it's one tangled function. Split it into **three** functions while keeping `process` working exactly the same:

- `clean(names)`: strips whitespace, title-cases, and drops empty names
- `dedupe(names)`: removes duplicates, keeping the first occurrence in order
- `process(names)`: returns `dedupe(clean(names))`

@@starter
def process(names):
    out = []
    for n in names:
        n = n.strip().title()
        if n and n not in out:
            out.append(n)
    return out

@@solution
def clean(names: list[str]) -> list[str]:
    return [n.strip().title() for n in names if n.strip()]

def dedupe(names: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out

def process(names: list[str]) -> list[str]:
    return dedupe(clean(names))

@@tests
DATA = [" ashford city", "BRAMLEY ROVERS", "", "Ashford City ", "  ", "castleton united"]

def test_clean():
    """clean strips, title-cases and drops empties"""
    assert clean(DATA) == ["Ashford City", "Bramley Rovers", "Ashford City", "Castleton United"]

def test_dedupe():
    """dedupe keeps the first of each, in order"""
    assert dedupe(["B", "A", "B", "C", "A"]) == ["B", "A", "C"]

def test_process():
    """process still gives the same result"""
    assert process(DATA) == ["Ashford City", "Bramley Rovers", "Castleton United"]
:::

:::quiz clean-quiz Quick check
? Does Python stop you passing a string to `def f(x: int)`?
- [ ] Yes, it raises an error at runtime
- [x] No. Hints aren't enforced at runtime; a type checker or your editor flags it
> Type hints are checked by tools like mypy and Pyright, not by Python itself.

? What does `str | None` mean?
- [x] Either a string or None
- [ ] A string that can't be None
- [ ] A bitwise operation
> It's the modern way to write an optional value.

? Which name follows PEP 8 for a function?
- [ ] `CalculateMargin`
- [x] `calculate_margin`
- [ ] `calculateMargin`
> Functions and variables use snake_case.

? What should a comment usually explain?
- [x] Why the code does something
- [ ] What each line does, line by line
- [ ] Who wrote it
> Good names make the "what" obvious; comments add the "why".
:::

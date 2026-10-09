---
title: "Checkpoint: Professional Python"
summary: Test your command of classes, generators, decorators, type hints and testing before moving on to data analysis.
minutes: 60
kind: checkpoint
---

**Passing standard:** all three exercises pass and you score at least 8/10 on the quiz. Try it without hints first.

:::quiz phase2-final Phase 2 quiz
? What's printed?
```python
class Counter:
    total = 0
    def __init__(self):
        Counter.total += 1

a, b, c = Counter(), Counter(), Counter()
print(Counter.total)
```
- [ ] 0
- [ ] 1
- [x] 3
> `total` is a class attribute shared by all instances, and each `__init__` adds 1.

? What does `@dataclass(frozen=True)` prevent?
- [x] Changing fields after the object is created
- [ ] Creating new instances
- [ ] Inheriting from the class
> Frozen dataclasses are immutable (and hashable).

? Which is a generator expression?
- [ ] `[x * 2 for x in data]`
- [x] `(x * 2 for x in data)`
- [ ] `{x * 2 for x in data}`
> Parentheses make a lazy generator; square brackets a list; braces a set.

? What happens the second time you loop over the same generator object?
- [ ] It starts again from the beginning
- [x] Nothing: it's already exhausted
- [ ] It raises a SyntaxError
> Create a new generator to iterate again.

? Which statements about decorators are true?
- [x] A decorator takes a function and returns a function
- [x] `@app.get("/")` in FastAPI is a decorator with an argument
- [ ] Decorators run every time the program imports any module
> They're applied once, when the decorated function is defined.

? What does `str | None` as a return type tell callers?
- [x] They must handle the case where nothing is returned
- [ ] The function returns both a string and None
- [ ] The function raises an error
> A type checker will insist the `None` case is handled.

? Your test suite passes on code that has a known bug. What does that tell you?
- [x] The tests are missing a case that checks that behaviour
- [ ] The bug doesn't matter
- [ ] pytest is broken
> Good tests fail on broken code.

? What should you use to compare `0.1 + 0.2` with `0.3` in a pytest test?
- [ ] `==`
- [x] `pytest.approx(0.3)`
- [ ] `is`
> Floats need a tolerance.

? Why put settings like API keys in environment variables?
- [x] To keep secrets out of the code and the git history
- [x] So settings can change between environments without code changes
- [ ] Environment variables are faster
> Configuration belongs outside the code.

? Which logging level fits "loaded 1,140 matches from matches.csv"?
- [ ] DEBUG
- [x] INFO
- [ ] ERROR
> It's a normal milestone, not a problem.
:::

:::exercise cp2-portfolio A Portfolio of positions
Write a dataclass `Position` with `name: str`, `units: float` and `price: float`, and a property `value` (units × price).

Then write a class `Portfolio`:

- `add(position)`: add a position. If one with the same name exists, raise `ValueError`.
- `__len__` and `__iter__` (iterate over positions in the order added)
- `total_value()`: the sum of all positions' values
- `largest(n=1)`: a list of the `n` positions with the highest value, highest first

@@starter
from dataclasses import dataclass

@dataclass
class Position:
    name: str
    units: float
    price: float

class Portfolio:
    pass

@@solution
from dataclasses import dataclass

@dataclass
class Position:
    name: str
    units: float
    price: float

    @property
    def value(self) -> float:
        return self.units * self.price

class Portfolio:
    def __init__(self):
        self._positions: dict[str, Position] = {}

    def add(self, position: Position) -> None:
        if position.name in self._positions:
            raise ValueError(f"duplicate position {position.name!r}")
        self._positions[position.name] = position

    def __len__(self) -> int:
        return len(self._positions)

    def __iter__(self):
        return iter(self._positions.values())

    def total_value(self) -> float:
        return sum(p.value for p in self)

    def largest(self, n: int = 1) -> list[Position]:
        return sorted(self, key=lambda p: p.value, reverse=True)[:n]

@@tests
import math

def build():
    p = Portfolio()
    p.add(Position("EURUSD", 1000, 1.08))
    p.add(Position("GBPUSD", 500, 1.27))
    p.add(Position("Gold", 2, 2300))
    return p

def test_value_property():
    """Position.value is units × price"""
    assert math.isclose(Position("X", 10, 2.5).value, 25)

def test_len_iter():
    """Supports len and iteration in insertion order"""
    p = build()
    assert len(p) == 3
    assert [pos.name for pos in p] == ["EURUSD", "GBPUSD", "Gold"]

def test_total():
    """total_value sums the positions"""
    assert math.isclose(build().total_value(), 1080 + 635 + 4600)

def test_largest():
    """largest returns the biggest positions first"""
    assert [p.name for p in build().largest(2)] == ["Gold", "EURUSD"]

def test_duplicate():
    """Duplicate names raise ValueError"""
    p = build()
    try:
        p.add(Position("Gold", 1, 1))
    except ValueError:
        return
    raise AssertionError("expected ValueError")
:::

:::exercise cp2-pipeline A generator pipeline
Write two generators and a function:

- `parse(lines)`: for each line like `"2024-08-17,Ashford City,2.10"` yield a tuple `(date, team, odds)` with odds as a float. Skip lines that don't split into exactly 3 parts, or whose odds aren't a valid number.
- `value_only(rows, max_odds)`: yield only rows whose odds are less than or equal to `max_odds`.
- `summary(lines, max_odds)`: run the pipeline and return `(count, average_odds)`, with the average rounded to 2 decimals, or `(0, 0.0)` if nothing is left.

@@starter
def parse(lines):
    pass

def value_only(rows, max_odds):
    pass

def summary(lines, max_odds):
    pass

@@solution
def parse(lines):
    for line in lines:
        parts = line.strip().split(",")
        if len(parts) != 3:
            continue
        try:
            odds = float(parts[2])
        except ValueError:
            continue
        yield parts[0], parts[1], odds

def value_only(rows, max_odds):
    for row in rows:
        if row[2] <= max_odds:
            yield row

def summary(lines, max_odds):
    odds = [row[2] for row in value_only(parse(lines), max_odds)]
    if not odds:
        return (0, 0.0)
    return (len(odds), round(sum(odds) / len(odds), 2))

@@tests
import inspect

LINES = ["2024-08-17,Ashford City,2.10", "bad line", "2024-08-18,Bramley Rovers,abc",
         "2024-08-18,Castleton United,3.50", "2024-08-19,Dunmore Athletic,1.90\n"]

def test_generators():
    """parse and value_only are generators"""
    assert inspect.isgeneratorfunction(parse) and inspect.isgeneratorfunction(value_only)

def test_parse():
    """parse skips bad lines"""
    assert list(parse(LINES)) == [("2024-08-17", "Ashford City", 2.1), ("2024-08-18", "Castleton United", 3.5), ("2024-08-19", "Dunmore Athletic", 1.9)]

def test_filter():
    """value_only filters by max_odds"""
    assert [r[1] for r in value_only(parse(LINES), 2.5)] == ["Ashford City", "Dunmore Athletic"]

def test_summary():
    """summary counts and averages"""
    assert summary(LINES, 2.5) == (2, 2.0)
    assert summary(LINES, 1.5) == (0, 0.0)
:::

:::exercise cp2-memo A cache decorator
Write a decorator `memoize` that caches a function's results by its positional arguments (you can assume they're hashable). The wrapper must expose:

- `cache`: the dictionary of cached results
- `clear()`: a function that empties the cache

Use `functools.wraps`. Don't use `functools.lru_cache` or `functools.cache`.

@@starter
import functools

def memoize(func):
    return func

@@solution
import functools

def memoize(func):
    cache = {}

    @functools.wraps(func)
    def wrapper(*args):
        if args not in cache:
            cache[args] = func(*args)
        return cache[args]

    wrapper.cache = cache
    wrapper.clear = cache.clear
    return wrapper

@@tests
def test_caches():
    """Calls the function once per distinct argument"""
    calls = []
    @memoize
    def square(x):
        calls.append(x)
        return x * x
    assert square(4) == 16 and square(4) == 16 and square(5) == 25
    assert calls == [4, 5]
    assert square.cache == {(4,): 16, (5,): 25}

def test_clear():
    """clear empties the cache"""
    calls = []
    @memoize
    def f(x):
        calls.append(x)
        return x
    f(1)
    f.clear()
    f(1)
    assert calls == [1, 1]

def test_recursive_speed():
    """Makes recursive Fibonacci fast"""
    calls = 0
    @memoize
    def fib(n):
        nonlocal calls
        calls += 1
        if calls > 10_000:
            raise AssertionError("far too many calls: results aren't being cached")
        return n if n < 2 else fib(n - 1) + fib(n - 2)
    assert fib(90) == 2880067194370816120
    assert calls == 91

def test_name_and_no_lru():
    """Keeps the name and doesn't use lru_cache"""
    @memoize
    def named():
        return 1
    assert named.__name__ == "named"
    assert "lru_cache" not in source and "functools.cache" not in source
:::

## Phase 2 complete

You now write Python the way professionals do: structured, typed, tested and tooled. Phase 3 puts those skills to work on data, with NumPy, pandas and Matplotlib.

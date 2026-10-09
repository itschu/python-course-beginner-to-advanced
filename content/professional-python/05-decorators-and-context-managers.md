---
title: Decorators and context managers
summary: Functions as values, closures, decorators for timing, caching and retries, and context managers for safe setup and clean-up.
minutes: 50
kind: lesson
---

These two features are everywhere in professional Python code. FastAPI routes are decorators (`@app.get("/")`), and every file you open safely uses a context manager (`with open(...)`). By the end of this lesson you'll know how both work under the hood.

## Functions are values

In Python, functions are objects like any other. You can store them in variables, put them in lists and pass them to other functions:

```python
def double(x):
    return x * 2

def square(x):
    return x * x

operations = [double, square, abs]
for op in operations:
    print(op.__name__, op(-3))

def apply_twice(func, value):
    return func(func(value))

print(apply_twice(double, 5))
```

You've already done this: `sorted(teams, key=len)` passes the `len` function to `sorted`.

## Functions that return functions (closures)

A function defined inside another can use the outer function's variables, even after the outer function has finished. This is a **closure**:

```python
def make_stake_calculator(bankroll, fraction):
    def stake_for(edge):
        return round(bankroll * fraction * edge, 2)
    return stake_for

cautious = make_stake_calculator(1000, 0.25)
bold = make_stake_calculator(1000, 1.0)
print(cautious(0.05), bold(0.05))
```

## Decorators

A **decorator** is a function that takes a function and returns a new function, usually one that adds behaviour around the original:

```python
import time

def timed(func):
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = (time.perf_counter() - start) * 1000
        print(f"{func.__name__} took {elapsed:.2f} ms")
        return result
    return wrapper

@timed
def slow_sum(n):
    return sum(i * i for i in range(n))

print(slow_sum(200_000))
```

`@timed` above the definition is just shorthand for `slow_sum = timed(slow_sum)`. The `*args, **kwargs` in the wrapper accept any arguments and pass them through unchanged, so the decorator works on any function.

One improvement: use `functools.wraps` so the decorated function keeps its name and docstring:

```python
import functools

def logged(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        print(f"calling {func.__name__}{args}")
        return func(*args, **kwargs)
    return wrapper

@logged
def implied_probability(odds):
    """1 / odds"""
    return 1 / odds

print(implied_probability(4.0))
print(implied_probability.__name__, "-", implied_probability.__doc__)
```

### Decorators with arguments

To configure a decorator, add one more layer: a function that takes the settings and returns the decorator. Here's a retry decorator, the kind you'd put around a flaky web request:

```python
import functools

def retry(times):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return func(*args, **kwargs)
                except ConnectionError as error:
                    print(f"attempt {attempt} failed: {error}")
            raise ConnectionError(f"gave up after {times} attempts")
        return wrapper
    return decorator

calls = {"n": 0}

@retry(times=3)
def fetch_odds():
    calls["n"] += 1
    if calls["n"] < 3:
        raise ConnectionError("timeout")
    return {"home": 2.1}

print(fetch_odds())
```

## Built-in decorators worth knowing

```python
import functools

@functools.lru_cache(maxsize=None)     # remember results of previous calls
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print(fib(80))                          # instant; without the cache this would take years
print(fib.cache_info())
```

You've also met `@property` and `@dataclass`, and you'll meet `@staticmethod`, `@classmethod`, `@pytest.fixture` and `@app.get(...)` (FastAPI) later. They're all decorators.

## Context managers

A **context manager** sets something up when a `with` block starts and guarantees clean-up when it ends, even if an error happens:

```python static
with open("data.csv") as f:   # file opened
    data = f.read()
# file closed here, guaranteed
```

The easiest way to write your own is with `contextlib.contextmanager` and a generator. Everything before `yield` is setup; everything after is clean-up:

```python
from contextlib import contextmanager
import time

@contextmanager
def timer(label):
    start = time.perf_counter()
    try:
        yield
    finally:
        print(f"{label}: {(time.perf_counter() - start) * 1000:.1f} ms")

with timer("building a list"):
    squares = [n * n for n in range(300_000)]
```

The `try`/`finally` ensures the clean-up runs even if the block raises an error.

Context managers can also hand a value to the block with `yield value`, received with `as`:

```python
from contextlib import contextmanager

@contextmanager
def temporary_setting(settings, key, value):
    old = settings[key]
    settings[key] = value
    try:
        yield settings
    finally:
        settings[key] = old

config = {"stake": 10}
with temporary_setting(config, "stake", 50) as c:
    print("inside:", c)
print("after:", config)
```

The class-based version defines `__enter__` and `__exit__`:

```python
class Transaction:
    def __init__(self, ledger):
        self.ledger = ledger

    def __enter__(self):
        self.snapshot = list(self.ledger)
        return self.ledger

    def __exit__(self, exc_type, exc, tb):
        if exc_type is not None:          # an error happened: roll back
            self.ledger[:] = self.snapshot
            print("rolled back:", exc)
        return True                       # True swallows the exception

ledger = [100]
with Transaction(ledger) as l:
    l.append(-20)
    raise ValueError("payment failed")
print(ledger)
```

Database libraries use exactly this pattern: commit if the block succeeds, roll back if it fails.

## Practice

:::exercise count-calls Count calls
Write a decorator `count_calls` that counts how many times the decorated function is called. Store the count on the wrapper as an attribute called `calls` (starting at 0). Use `functools.wraps`.

@@starter
import functools

def count_calls(func):
    return func

@@solution
import functools

def count_calls(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return func(*args, **kwargs)
    wrapper.calls = 0
    return wrapper

@@tests
def test_counts():
    """Counts each call and returns the result"""
    @count_calls
    def add(a, b):
        return a + b
    assert add.calls == 0
    assert add(2, 3) == 5
    add(1, 1)
    assert add.calls == 2

def test_keeps_name():
    """Keeps the original name"""
    @count_calls
    def my_function():
        pass
    assert my_function.__name__ == "my_function"

def test_kwargs():
    """Passes keyword arguments through"""
    @count_calls
    def greet(name, greeting="Hello"):
        return f"{greeting}, {name}"
    assert greet("Ada", greeting="Hi") == "Hi, Ada"

@@hint
Functions are objects, so you can set attributes on them: `wrapper.calls = 0` after defining `wrapper`, and `wrapper.calls += 1` inside it.
:::

:::exercise validate-decorator Validate probabilities
Write a decorator `check_probability` for functions whose **first** argument is a probability. If that argument isn't between 0 and 1 (inclusive), raise `ValueError` without calling the function. Otherwise call it normally.

@@starter
import functools

def check_probability(func):
    return func

@@solution
import functools

def check_probability(func):
    @functools.wraps(func)
    def wrapper(probability, *args, **kwargs):
        if not 0 <= probability <= 1:
            raise ValueError(f"probability must be between 0 and 1, got {probability}")
        return func(probability, *args, **kwargs)
    return wrapper

@@tests
def test_valid():
    """Valid probabilities pass through"""
    @check_probability
    def fair_odds(p):
        return 1 / p
    assert fair_odds(0.5) == 2

def test_invalid():
    """Invalid probabilities raise ValueError before the function runs"""
    called = []
    @check_probability
    def f(p):
        called.append(p)
    for bad in [-0.1, 1.5]:
        try:
            f(bad)
        except ValueError:
            continue
        raise AssertionError(f"{bad} should raise ValueError")
    assert called == [], "the function shouldn't run for invalid input"

def test_extra_args():
    """Other arguments are passed through"""
    @check_probability
    def ev(p, odds, stake=1):
        return p * stake * (odds - 1) - (1 - p) * stake
    assert ev(0.5, 3.0, stake=2) == 1.0
:::

:::exercise suppress-cm A context manager that catches errors
Using `contextlib.contextmanager`, write `ignore_errors(*error_types)`. Errors of the given types raised inside the `with` block are swallowed and recorded in a list that the context manager yields. Other errors propagate normally.

```python static
with ignore_errors(ValueError, KeyError) as caught:
    int("oops")
print(caught)   # [ValueError("invalid literal for int() ...")]
```

@@starter
from contextlib import contextmanager

@contextmanager
def ignore_errors(*error_types):
    caught = []
    yield caught

@@solution
from contextlib import contextmanager

@contextmanager
def ignore_errors(*error_types):
    caught = []
    try:
        yield caught
    except error_types as error:
        caught.append(error)

@@tests
def test_swallows_listed_errors():
    """Listed errors are caught and recorded"""
    with ignore_errors(ValueError) as caught:
        int("oops")
    assert len(caught) == 1 and isinstance(caught[0], ValueError)

def test_no_error():
    """No error, nothing recorded"""
    with ignore_errors(ValueError) as caught:
        x = 1 + 1
    assert caught == []

def test_other_errors_propagate():
    """Other errors are not swallowed"""
    try:
        with ignore_errors(ValueError):
            {}["missing"]
    except KeyError:
        return
    raise AssertionError("KeyError should not be swallowed")

@@hint
Wrap the `yield` in `try`/`except`. `except error_types as error:` works when `error_types` is a tuple of exception classes.
:::

:::quiz decorators-quiz Quick check
? What is `@timed` above `def f(): ...` shorthand for?
- [x] `f = timed(f)`
- [ ] `timed = f(timed)`
- [ ] Calling `timed()` every time `f` runs
> The decorator receives the function and returns a replacement.

? Why use `*args, **kwargs` in a decorator's wrapper?
- [x] So it can wrap functions with any parameters
- [ ] It's required syntax
- [ ] To make the function faster
> The wrapper accepts whatever it's given and passes it on.

? What does `functools.wraps` do?
- [x] Copies the original function's name and docstring onto the wrapper
- [ ] Caches results
- [ ] Wraps output in a box
> Without it, every decorated function would appear to be called "wrapper".

? In a `@contextmanager` generator, when does code after `yield` run?
- [x] When the `with` block ends
- [ ] Before the `with` block starts
- [ ] Never
> Put it in `finally` to make sure it runs even if the block raises.
:::

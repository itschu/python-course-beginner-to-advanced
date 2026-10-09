---
title: Testing with pytest
summary: Write automated tests that prove your code works, catch regressions, and let you change code without fear.
minutes: 60
kind: lesson
---

Every exercise in this course has been checked by automated tests. Now it's your turn to write them. In professional teams, code without tests usually doesn't get merged.

## Why test?

- **Confidence:** you know the code works for the cases you've checked, not just the one you tried by hand.
- **Regressions:** when you change something later, the tests tell you instantly if you broke something else.
- **Design:** code that's hard to test is usually badly structured. Writing tests pushes you towards small, pure functions.
- **Documentation:** tests show exactly how code is meant to be used.

In data science, tests are even more important than usual, because bugs rarely crash. A feature calculated with tomorrow's data looks perfectly fine; it just makes your model's backtest a fantasy.

## Tests are just functions with asserts

```python
def implied_probability(odds):
    if odds <= 1:
        raise ValueError("odds must be greater than 1")
    return 1 / odds

def test_even_money():
    assert implied_probability(2.0) == 0.5

def test_long_shot():
    assert implied_probability(10.0) == 0.1

test_even_money()
test_long_shot()
print("all passed")
```

A good test has three parts, often called **Arrange, Act, Assert**: set up the inputs, call the code, check the result. Each test should check one behaviour and have a name that says which.

## pytest

[pytest](https://docs.pytest.org/) is the standard Python test runner. It finds files named `test_*.py`, runs every function named `test_*` inside them, and reports the results. Locally:

```bash
uv add --dev pytest
uv run pytest          # run everything
uv run pytest -x -q    # stop at the first failure, quiet output
```

pytest is installed in this browser runner too, so let's run it for real: write a module and a test file, then call `pytest.main()`:

```python
import sys
import pytest

module_code = '''
def implied_probability(odds):
    if odds <= 1:
        raise ValueError("odds must be greater than 1")
    return 1 / odds

def margin(prices):
    return sum(implied_probability(p) for p in prices) - 1
'''

test_code = '''
import pytest
from betting import implied_probability, margin

def test_even_money():
    assert implied_probability(2.0) == 0.5

def test_rejects_impossible_odds():
    with pytest.raises(ValueError):
        implied_probability(1.0)

@pytest.mark.parametrize("odds, expected", [(2.0, 0.5), (4.0, 0.25), (1.25, 0.8)])
def test_many_prices(odds, expected):
    assert implied_probability(odds) == pytest.approx(expected)

def test_margin():
    assert margin([2.1, 3.4, 3.6]) == pytest.approx(0.0481, abs=1e-4)

def test_this_one_fails():
    assert margin([2.0, 2.0]) == 0.05
'''

with open("betting.py", "w") as f:
    f.write(module_code)
with open("test_betting.py", "w") as f:
    f.write(test_code)
sys.modules.pop("betting", None)          # forget any old version of the module

exit_code = pytest.main(["-q", "--capture=sys", "-p", "no:cacheprovider", "test_betting.py"])
print("exit code:", int(exit_code))
```

Read the failure report: pytest shows the values on both sides of the failing `assert`, so you rarely need to add prints. Fix the last test's expected value to `0` and re-run.

## The pytest toolkit

**`pytest.approx`** compares floats with a tolerance. Remember, never compare floats with `==`:

```python static
assert 0.1 + 0.2 == pytest.approx(0.3)
assert value == pytest.approx(0.0481, abs=1e-4)
```

**`pytest.raises`** checks that code raises the exception you expect, which tests your error handling:

```python static
with pytest.raises(ValueError, match="greater than 1"):
    implied_probability(0.5)
```

**`@pytest.mark.parametrize`** runs one test with many inputs. Each case is reported separately:

```python static
@pytest.mark.parametrize("home_goals, away_goals, expected", [
    (2, 1, "H"), (0, 0, "D"), (1, 3, "A"),
])
def test_result(home_goals, away_goals, expected):
    assert result(home_goals, away_goals) == expected
```

**Fixtures** provide reusable setup. Name a fixture as a test parameter and pytest passes it in:

```python static
@pytest.fixture
def season():
    return [Match("A", "B", 2, 1), Match("B", "A", 0, 0)]

def test_home_wins(season):
    assert count_home_wins(season) == 1
```

The built-in `tmp_path` fixture gives each test a fresh temporary folder, ideal for testing code that reads and writes files.

## What to test

For each function, think about:

1. **Typical cases:** the normal inputs.
2. **Edge cases:** empty lists, zero, one item, the boundaries of `if` conditions (exactly 1.0, exactly 50%).
3. **Error cases:** invalid inputs should raise clear errors.
4. **Properties:** things that are always true. Fair probabilities sum to 1; a bankroll changes by exactly the profit of each bet.

## Test-driven development (TDD)

A powerful workflow: write a failing test *first*, then the minimum code to make it pass, then tidy up ("red, green, refactor"). It forces you to decide what the code should do before you get lost in how. You've effectively been doing TDD in every exercise of this course.

## Practice: write the tests yourself

In these exercises you write the tests. The checker runs your tests against the correct code (they must all pass) and against deliberately **broken** versions (your tests must catch each one). This is how professionals judge whether a test suite is any good.

:::exercise write-tests-kelly Test the Kelly function
`kelly_fraction` is written for you. Write **at least three** test functions (named `test_...`) that use `assert` to check it. Your tests must:

- all pass on the correct code, and
- catch three hidden broken versions: one that forgets to clamp negative values to 0, one that uses `odds` where it should use `odds - 1`, and one that ignores the `fraction` argument.

@@starter
def kelly_fraction(probability, odds, fraction=1.0):
    b = odds - 1
    full = (probability * b - (1 - probability)) / b
    return max(0.0, full) * fraction

# Write your tests below, e.g.
# def test_no_edge():
#     assert kelly_fraction(0.3, 2.0) == 0

@@solution
def kelly_fraction(probability, odds, fraction=1.0):
    b = odds - 1
    full = (probability * b - (1 - probability)) / b
    return max(0.0, full) * fraction

import math

def test_known_value():
    assert math.isclose(kelly_fraction(0.5, 3.0), 0.25)

def test_no_edge_is_zero():
    assert kelly_fraction(0.3, 2.0) == 0

def test_half_kelly():
    assert math.isclose(kelly_fraction(0.5, 3.0, fraction=0.5), 0.125)

@@tests
def correct(probability, odds, fraction=1.0):
    b = odds - 1
    return max(0.0, (probability * b - (1 - probability)) / b) * fraction

def no_clamp(probability, odds, fraction=1.0):
    b = odds - 1
    return ((probability * b - (1 - probability)) / b) * fraction

def wrong_b(probability, odds, fraction=1.0):
    b = odds
    return max(0.0, (probability * b - (1 - probability)) / b) * fraction

def ignores_fraction(probability, odds, fraction=1.0):
    b = odds - 1
    return max(0.0, (probability * b - (1 - probability)) / b)

def learner_tests():
    return [f for name, f in globals().items()
            if name.startswith("test_") and callable(f) and getattr(f, "__code__", None)
            and f.__code__.co_filename == "main.py"]

def run_all(impl):
    failures = 0
    for t in learner_tests():
        t.__globals__["kelly_fraction"] = impl
        try:
            t()
        except BaseException:  # pytest.raises failures are BaseExceptions
            failures += 1
    return failures

def test_enough_tests():
    """You wrote at least 3 tests"""
    assert len(learner_tests()) >= 3, f"found {len(learner_tests())} test functions; write at least 3"

def test_pass_on_correct_code():
    """Your tests pass on the correct code"""
    assert run_all(correct) == 0, "some of your tests fail on the correct implementation"

def test_catches_missing_clamp():
    """Your tests catch the version that doesn't clamp to 0"""
    assert run_all(no_clamp) > 0, "add a test for a bet with no edge (it should return 0)"

def test_catches_wrong_formula():
    """Your tests catch the version with the wrong formula"""
    assert run_all(wrong_b) > 0, "add a test that checks an exact value, e.g. kelly_fraction(0.5, 3.0) is 0.25"

def test_catches_ignored_fraction():
    """Your tests catch the version that ignores fraction"""
    assert run_all(ignores_fraction) > 0, "add a test that uses the fraction argument"
    for t in learner_tests():
        t.__globals__["kelly_fraction"] = correct

@@hint
Work out a few values by hand. With probability 0.5 and odds 3.0: b = 2, so (0.5 × 2 − 0.5) / 2 = 0.25.

@@hint
Use `math.isclose` (import math) for float comparisons, and test `fraction=0.5` too.
:::

:::exercise write-tests-parse Test a parser, including errors
`parse_score("2-1")` returns `(2, 1)`. It allows spaces (`" 3 - 0 "`) and raises `ValueError` for anything malformed, including negative numbers.

Write at least **four** tests. They must pass on the correct version and catch three broken ones: one that doesn't allow spaces, one that accepts negative goals, and one that returns `(away, home)` instead of `(home, away)`.

To test that something raises, use this pattern (or `pytest.raises`, since pytest is available):

```python static
def test_rejects_letters():
    try:
        parse_score("a-b")
    except ValueError:
        return
    assert False, "expected ValueError"
```

@@starter
def parse_score(text):
    parts = text.split("-")
    if len(parts) != 2:
        raise ValueError(f"bad score: {text!r}")
    home, away = (int(p.strip()) for p in parts)
    if home < 0 or away < 0:
        raise ValueError("goals can't be negative")
    return home, away

# Write your tests below

@@solution
def parse_score(text):
    parts = text.split("-")
    if len(parts) != 2:
        raise ValueError(f"bad score: {text!r}")
    home, away = (int(p.strip()) for p in parts)
    if home < 0 or away < 0:
        raise ValueError("goals can't be negative")
    return home, away

import pytest

def test_simple():
    assert parse_score("2-1") == (2, 1)

def test_spaces():
    assert parse_score(" 3 - 0 ") == (3, 0)

def test_rejects_garbage():
    with pytest.raises(ValueError):
        parse_score("two-one")

def test_rejects_negative():
    with pytest.raises(ValueError):
        parse_score("-1-2")

@@tests
def correct(text):
    parts = text.split("-")
    if len(parts) != 2:
        raise ValueError(text)
    home, away = (int(p.strip()) for p in parts)
    if home < 0 or away < 0:
        raise ValueError(text)
    return home, away

def no_spaces(text):
    if " " in text:
        raise ValueError(text)
    return correct(text)

def allows_negative(text):
    import re
    m = re.fullmatch(r"\s*(-?\d+)\s*-\s*(-?\d+)\s*", text)
    if not m:
        raise ValueError(text)
    return int(m.group(1)), int(m.group(2))

def swapped(text):
    h, a = correct(text)
    return a, h

def learner_tests():
    return [f for name, f in globals().items()
            if name.startswith("test_") and callable(f) and getattr(f, "__code__", None)
            and f.__code__.co_filename == "main.py"]

def failures(impl):
    count = 0
    for t in learner_tests():
        t.__globals__["parse_score"] = impl
        try:
            t()
        except BaseException:  # pytest.raises failures are BaseExceptions
            count += 1
    for t in learner_tests():
        t.__globals__["parse_score"] = correct
    return count

def test_enough():
    """You wrote at least 4 tests"""
    assert len(learner_tests()) >= 4, f"found {len(learner_tests())}"

def test_correct_passes():
    """Your tests pass on the correct code"""
    assert failures(correct) == 0

def test_catch_spaces():
    """Catches the version that rejects spaces"""
    assert failures(no_spaces) > 0, "test a score with spaces around the numbers"

def test_catch_negative():
    """Catches the version that accepts negative goals"""
    assert failures(allows_negative) > 0, "test that a negative score raises ValueError, e.g. '-1-2'"

def test_catch_swapped():
    """Catches the version that swaps home and away"""
    assert failures(swapped) > 0, "test a score where home and away differ, like '2-1'"
:::

:::quiz testing-quiz Quick check
? How does pytest find tests?
- [x] Functions named `test_*` in files named `test_*.py`
- [ ] Any function with an assert in it
- [ ] You list them in a config file
> It's convention over configuration.

? Why use `pytest.approx` for floats?
- [x] Floats are approximate, so exact `==` can fail on tiny rounding differences
- [ ] It makes tests run faster
- [ ] It's required by pytest
> Same reason you use `math.isclose`.

? What makes a test suite good?
- [x] It fails when the code is broken
- [ ] It has a lot of tests
- [ ] It never fails
> A test that can't fail checks nothing. That's why the exercises above test your tests against broken code.

? In TDD, what do you write first?
- [x] A failing test
- [ ] The implementation
- [ ] The documentation
> Red (failing test), green (make it pass), refactor (clean up).
:::

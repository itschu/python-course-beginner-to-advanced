---
title: Errors, exceptions and debugging
summary: Handle errors gracefully with try/except, raise your own, and debug systematically instead of guessing.
minutes: 50
kind: lesson
---

Bugs are not a sign you're bad at programming. They're the job. What separates professionals from beginners is *how* they find and fix them, and how their code behaves when something unexpected happens.

## Reading a traceback

When an error isn't handled, Python prints a **traceback**: the chain of function calls that led to the error, most recent last.

```python expect-error
def implied_probability(odds):
    return 1 / odds

def margin(home, draw, away):
    return implied_probability(home) + implied_probability(draw) + implied_probability(away) - 1

print(margin(2.1, 0, 3.6))
```

Read it **from the bottom up**:

1. The last line says *what* happened: `ZeroDivisionError: division by zero`.
2. The line above shows *where*: inside `implied_probability`, at `return 1 / odds`.
3. Going up the chain shows *how you got there*: `margin` called it, and the top-level code called `margin` with a draw price of `0`.

The bug isn't really in `implied_probability`. The bad value came from the call at the top. Tracebacks tell you where the problem *surfaced*; you often have to walk back to where it *started*.

## Common exceptions

| Exception | Typical cause |
| --- | --- |
| `SyntaxError` | Invalid Python: a missing colon, quote or bracket |
| `IndentationError` | Inconsistent indentation |
| `NameError` | Using a variable before defining it, or a typo |
| `TypeError` | Wrong type: `"3" + 4`, or calling a function with the wrong number of arguments |
| `ValueError` | Right type, bad value: `int("three")` |
| `IndexError` | List index out of range |
| `KeyError` | Dictionary key doesn't exist |
| `AttributeError` | The value doesn't have that method: `[1, 2].upper()` |
| `ZeroDivisionError` | Dividing by zero |
| `FileNotFoundError` | Opening a file that isn't there |

## Handling exceptions: try / except

Some errors are expected in normal operation: a user types letters instead of a number, a file is missing, a web request times out. Handle them with `try`/`except`:

```python
def parse_odds(text):
    try:
        return float(text)
    except ValueError:
        return None

for raw in ["2.50", "evens", "3.1", ""]:
    print(repr(raw), "->", parse_odds(raw))
```

The code in `try` runs. If it raises a `ValueError`, Python jumps to the `except` block instead of crashing.

**Always catch specific exceptions.** A bare `except:` (or `except Exception:`) also hides bugs you didn't expect, like typos. It makes problems much harder to find.

The full form has `else` (runs if nothing went wrong) and `finally` (always runs, used for clean-up):

```python
def safe_divide(a, b):
    try:
        result = a / b
    except ZeroDivisionError:
        print("Can't divide by zero")
        return None
    except TypeError as error:          # `as` gives you the exception object
        print("Bad input:", error)
        return None
    else:
        return result
    finally:
        print("(division attempted)")

print(safe_divide(10, 4))
print(safe_divide(10, 0))
print(safe_divide(10, "x"))
```

## Raising exceptions

Your own functions should complain loudly when given nonsense, rather than silently returning a wrong answer. Use `raise`:

```python
def implied_probability(odds):
    if odds <= 1:
        raise ValueError(f"Decimal odds must be greater than 1, got {odds}")
    return 1 / odds

print(implied_probability(2.5))
try:
    implied_probability(0.5)
except ValueError as e:
    print("Caught:", e)
```

This principle is called **fail fast**. A crash with a clear message right where the problem is beats a wrong number that quietly flows through your whole analysis. In ML, silent errors (a column shifted by one row, a unit mixed up) are far more dangerous than crashes.

## assert: checking your assumptions

`assert condition, message` raises an `AssertionError` if the condition is false. It's a quick way to state "this must be true here":

```python
probabilities = [0.45, 0.28, 0.27]
assert abs(sum(probabilities) - 1) < 1e-9, "probabilities must sum to 1"
print("OK")
```

The tests in this course's exercises are made of `assert` statements. Use `assert` for internal sanity checks; use `raise ValueError` for validating inputs to your functions, because assertions can be disabled when Python runs in optimised mode.

## A debugging method

When something's wrong, don't change code at random. Work like a scientist:

1. **Reproduce** the bug reliably with the smallest input you can.
2. **Read** the error message and traceback carefully.
3. **Form a hypothesis**: "I think `total` is a string, not a number."
4. **Test it**: add a `print()` (or use a debugger) to check the actual values and types.
5. **Fix** one thing, then re-run.

Printing is a perfectly respectable debugging tool. f-strings have a shortcut for it: `{name=}` prints the expression and its value:

```python
odds = "2.5"
stake = 10
print(f"{odds=}, {type(odds)=}, {stake=}")
```

:::tip Rubber duck debugging
Explain your code, line by line, out loud, to someone or something (traditionally a rubber duck). You'll often spot the bug halfway through the explanation. Explaining to an AI assistant works too, but ask it to explain the bug rather than just fix it.
:::

## Classic bugs to recognise

```python
# 1. Off by one: range stops before its end
for i in range(1, 5):
    print(i, end=" ")      # prints 1 to 4, not 1 to 5
print()

# 2. Integer vs string
print("10" > "9")          # False! strings compare character by character

# 3. Changing a list while looping over it
nums = [1, 2, 2, 3]
for n in nums:
    if n == 2:
        nums.remove(n)
print(nums)                # [1, 2, 3], one 2 survived
nums = [1, 2, 2, 3]
nums = [n for n in nums if n != 2]   # build a new list instead
print(nums)
```

## Practice

:::exercise safe-parse Parse odds safely
Complete `parse_odds_list(values)`. It receives a list of strings that should be decimal odds. Return a list of floats for the values that are valid, **skipping** anything that can't be converted to a float or is not greater than 1.

`parse_odds_list(["2.5", "evens", "1.8", "-3", "0.9", " 4 "])` returns `[2.5, 1.8, 4.0]`.

@@starter
def parse_odds_list(values):
    result = []
    for v in values:
        result.append(float(v))
    return result

@@solution
def parse_odds_list(values):
    result = []
    for v in values:
        try:
            odds = float(v)
        except ValueError:
            continue
        if odds > 1:
            result.append(odds)
    return result

@@tests
def test_example():
    """Keeps valid odds and skips the rest"""
    got = parse_odds_list(["2.5", "evens", "1.8", "-3", "0.9", " 4 "])
    assert got == [2.5, 1.8, 4.0], f"got {got}"

def test_all_bad():
    """No valid values gives an empty list"""
    assert parse_odds_list(["x", "", "1.0"]) == []

def test_catches_specific_error():
    """Catches ValueError specifically, not every exception"""
    assert "except ValueError" in source, "Catch ValueError specifically: except ValueError:"

@@hint
Wrap `float(v)` in `try`/`except ValueError` and `continue` to skip bad values. Check `odds > 1` after converting.
:::

:::exercise validate-stake Validate inputs
Complete `kelly_stake(bankroll, probability, odds)`, which returns how much to bet using the Kelly formula (explained in the project):

$$
\text{fraction} = \frac{p \times (o - 1) - (1 - p)}{o - 1}, \qquad \text{stake} = \text{bankroll} \times \max(0, \text{fraction})
$$

The formula is written for you. Add validation that **raises `ValueError`** with a helpful message if:

- `bankroll` is negative,
- `probability` is not between 0 and 1 (inclusive),
- `odds` is not greater than 1.

@@starter
def kelly_stake(bankroll, probability, odds):
    b = odds - 1
    fraction = (probability * b - (1 - probability)) / b
    return bankroll * max(0, fraction)

@@solution
def kelly_stake(bankroll, probability, odds):
    if bankroll < 0:
        raise ValueError(f"bankroll can't be negative: {bankroll}")
    if not 0 <= probability <= 1:
        raise ValueError(f"probability must be between 0 and 1: {probability}")
    if odds <= 1:
        raise ValueError(f"odds must be greater than 1: {odds}")
    b = odds - 1
    fraction = (probability * b - (1 - probability)) / b
    return bankroll * max(0, fraction)

@@tests
import math

def raises_value_error(*args):
    try:
        kelly_stake(*args)
    except ValueError:
        return True
    except Exception:
        return False
    return False

def test_valid():
    """Valid inputs still work"""
    assert math.isclose(kelly_stake(1000, 0.5, 3.0), 250)
    assert kelly_stake(1000, 0.2, 3.0) == 0

def test_bad_bankroll():
    """Negative bankroll raises ValueError"""
    assert raises_value_error(-1, 0.5, 2.0)

def test_bad_probability():
    """Probability outside 0..1 raises ValueError"""
    assert raises_value_error(100, 1.2, 2.0)
    assert raises_value_error(100, -0.1, 2.0)

def test_bad_odds():
    """Odds of 1 or less raise ValueError"""
    assert raises_value_error(100, 0.5, 1.0), "odds of 1.0 should raise ValueError (not ZeroDivisionError)"
    assert raises_value_error(100, 0.5, 0.5)

@@hint
Put the checks at the top of the function, before the calculation. `raise ValueError("message")` stops the function immediately.
:::

:::exercise fix-average Debug: the average is wrong
This function should return the average number of goals per match from a list of score strings like `"2-1"`. It has **three** bugs. Find and fix them.

`average_goals(["2-1", "0-0", "3-3"])` should return `3.0` (that's 9 goals in 3 matches).

@@starter
def average_goals(scores):
    total = 0
    for score in scores:
        home, away = score.split("-")
        total = home + away
    return total / len(scores) - 1

@@solution
def average_goals(scores):
    total = 0
    for score in scores:
        home, away = score.split("-")
        total += int(home) + int(away)
    return total / len(scores)

@@tests
import math

def test_example():
    """Average of 2-1, 0-0 and 3-3 is 3.0"""
    assert math.isclose(average_goals(["2-1", "0-0", "3-3"]), 3.0)

def test_single():
    """A single 4-2 match averages 6"""
    assert math.isclose(average_goals(["4-2"]), 6.0)

def test_low_scoring():
    """1-0 and 0-0 average 0.5"""
    assert math.isclose(average_goals(["1-0", "0-0"]), 0.5)

@@hint
Bug 1: what type are `home` and `away` after `split`?

@@hint
Bug 2: `total = ...` replaces the total each time instead of adding to it.

@@hint
Bug 3: look closely at the `return` line.
:::

:::quiz errors-quiz Quick check
? Where should you start reading a traceback?
- [ ] At the top
- [x] At the bottom
> The last line says what the error is; the lines above show how the code got there.

? Why avoid a bare `except:`?
- [x] It hides unexpected bugs, like typos, that you'd want to see
- [ ] It's slower
- [ ] It's a syntax error
> Catch only the specific exceptions you expect and know how to handle.

? Which exception should a function raise when it's given a bad argument value, such as negative odds?
- [x] `ValueError`
- [ ] `SyntaxError`
- [ ] `NameError`
> `ValueError` means "right type, inappropriate value".

? When does a `finally` block run?
- [ ] Only if there was an error
- [ ] Only if there was no error
- [x] Always
> `finally` is for clean-up that must happen either way, like closing a file.
:::

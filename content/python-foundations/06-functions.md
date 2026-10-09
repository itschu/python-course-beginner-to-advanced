---
title: Functions
summary: Package logic into reusable, testable pieces with parameters, return values, defaults and docstrings.
minutes: 50
kind: lesson
---

You've already filled in a few functions. Now let's understand them properly, because functions are how professionals organise every program, from a 20-line script to a machine learning library.

## Why functions?

- **Reuse:** write a calculation once and use it everywhere.
- **Naming:** `implied_probability(odds)` explains itself; `1 / odds` buried in a long script doesn't.
- **Testing:** a function with clear inputs and outputs can be checked automatically, just like this course's exercises do.
- **Thinking:** big problems become manageable when broken into small, named steps.

## Defining and calling

```python
def greet(name):
    message = f"Hello, {name}!"
    return message

print(greet("Ada"))
print(greet("Alan"))
```

- `name` is a **parameter**: a variable that exists inside the function.
- `"Ada"` is an **argument**: the actual value passed in when you call it.
- Defining a function doesn't run it. The body runs each time you **call** it.

## return vs print

This difference trips up every beginner, so let's be precise:

- `print` shows something on screen. The value is then gone.
- `return` hands a value back to the caller, which can store it, do maths with it, or pass it on.

```python
def add_print(a, b):
    print(a + b)

def add_return(a, b):
    return a + b

x = add_return(2, 3)
print("x is", x)

y = add_print(2, 3)     # prints 5, but returns nothing...
print("y is", y)        # ...so y is None
```

A function without a `return` statement returns `None`. `return` also ends the function immediately; any code after it doesn't run.

## Several parameters, defaults and keywords

```python
def potential_return(stake, odds, commission=0.0):
    """Total returned by a winning bet, after commission on the profit."""
    profit = stake * (odds - 1)
    return stake + profit * (1 - commission)

print(potential_return(10, 3.0))                     # commission uses its default, 0.0
print(potential_return(10, 3.0, 0.02))               # positional arguments
print(potential_return(stake=10, odds=3.0, commission=0.05))   # keyword arguments
print(potential_return(odds=3.0, stake=10))          # keywords can go in any order
```

- `commission=0.0` gives a **default value**, so the caller can leave it out. Parameters with defaults must come after those without.
- Calling with `name=value` (keyword arguments) makes calls self-explanatory. It's the norm for anything beyond one or two obvious arguments.

:::warning Never use a list or dict as a default
`def f(items=[])` creates *one* list that's shared between every call, which causes very confusing bugs. Use `def f(items=None)` and create the list inside the function. You'll understand why after the next lesson.
:::

## Returning several values

Return several values separated by commas, and **unpack** them into separate variables:

```python
def min_max(a, b, c):
    return min(a, b, c), max(a, b, c)

low, high = min_max(4, 9, 2)
print(low, high)
```

(Technically the function returns a single *tuple*, `(2, 9)`. You'll meet tuples in the next lesson.)

## Docstrings

A string on the first line of a function is its **docstring**: documentation that tools and editors can show. Write one for every function that isn't completely obvious:

```python
def fair_probability(odds, margin):
    """Estimate the true probability of an outcome.

    Divides the implied probability (1 / odds) by (1 + margin)
    to remove the bookmaker's margin.
    """
    return (1 / odds) / (1 + margin)

help(fair_probability)
```

## Scope: variables inside functions

Variables created inside a function are **local**: they exist only while the function runs, and they don't clash with variables elsewhere:

```python
total = 100

def compute():
    total = 5      # a different, local variable
    return total * 2

print(compute())
print(total)       # unchanged
```

```python expect-error
def make_message():
    message = "hi"

make_message()
print(message)     # doesn't exist outside the function
```

Functions *can* read variables defined outside them, but relying on that makes code hard to follow and test. Pass values in as parameters and get results out with `return`. A function that only depends on its inputs and doesn't change anything else is called a **pure function**. Aim for these.

## Functions calling functions

Small functions combine into bigger ones:

```python
def implied_probability(odds):
    return 1 / odds

def expected_profit(probability, odds, stake):
    win = probability * stake * (odds - 1)
    lose = (1 - probability) * stake
    return win - lose

def describe_bet(probability, odds, stake=10):
    ev = expected_profit(probability, odds, stake)
    verdict = "value" if ev > 0 else "no value"
    return f"Implied {implied_probability(odds):.0%}, your estimate {probability:.0%}: EV £{ev:.2f} ({verdict})"

print(describe_bet(0.55, 2.0))
print(describe_bet(0.40, 2.0))
```

## Practice

:::exercise temperature Temperature converter
Write **two** functions:

- `c_to_f(celsius)` returns the temperature in Fahrenheit: $F = C \times 9/5 + 32$
- `f_to_c(fahrenheit)` returns the temperature in Celsius: $C = (F - 32) \times 5/9$

@@starter
def c_to_f(celsius):
    pass

# define f_to_c below

@@solution
def c_to_f(celsius):
    return celsius * 9 / 5 + 32

def f_to_c(fahrenheit):
    return (fahrenheit - 32) * 5 / 9

@@tests
import math

def test_c_to_f():
    """c_to_f works for freezing, boiling and body temperature"""
    assert math.isclose(c_to_f(0), 32)
    assert math.isclose(c_to_f(100), 212)
    assert math.isclose(c_to_f(37), 98.6)

def test_f_to_c():
    """f_to_c works for freezing and boiling"""
    assert math.isclose(f_to_c(32), 0, abs_tol=1e-9)
    assert math.isclose(f_to_c(212), 100)

def test_round_trip():
    """Converting there and back gives the original"""
    assert math.isclose(f_to_c(c_to_f(21.5)), 21.5)

@@hint
Remember `return`. A function that only prints gives back `None`.
:::

:::exercise bmi Body mass index with validation
Complete `bmi(weight_kg, height_m, decimals=1)`:

- Return $\text{weight} / \text{height}^2$ rounded to `decimals` places.
- If the weight or height is zero or negative, return `None`.

@@starter
def bmi(weight_kg, height_m, decimals=1):
    pass

@@solution
def bmi(weight_kg, height_m, decimals=1):
    if weight_kg <= 0 or height_m <= 0:
        return None
    return round(weight_kg / height_m ** 2, decimals)

@@tests
def test_typical():
    """70 kg and 1.75 m gives 22.9"""
    assert bmi(70, 1.75) == 22.9, f"got {bmi(70, 1.75)}"

def test_decimals():
    """The decimals parameter controls rounding"""
    assert bmi(70, 1.75, decimals=3) == 22.857, f"got {bmi(70, 1.75, decimals=3)}"
    assert bmi(70, 1.75, 0) == 23

def test_invalid():
    """Zero or negative inputs return None"""
    assert bmi(0, 1.8) is None
    assert bmi(70, 0) is None
    assert bmi(-70, 1.8) is None

@@hint
Check for bad inputs first and `return None`. Use `round(value, decimals)`.
:::

:::exercise bet-summary Combine functions
Two helper functions are written for you. Use them to complete `bet_summary(stake, odds, won)`, which returns a string such as:

```text
Stake £10.00 at 2.50: won, profit £15.00
Stake £10.00 at 2.50: lost, profit £-10.00
```

Call `settle` to get the profit instead of recalculating it.

@@starter
def settle(stake, odds, won):
    """Profit (or loss, as a negative number) from a bet."""
    return stake * (odds - 1) if won else -stake

def outcome_word(won):
    return "won" if won else "lost"

def bet_summary(stake, odds, won):
    pass

@@solution
def settle(stake, odds, won):
    """Profit (or loss, as a negative number) from a bet."""
    return stake * (odds - 1) if won else -stake

def outcome_word(won):
    return "won" if won else "lost"

def bet_summary(stake, odds, won):
    profit = settle(stake, odds, won)
    return f"Stake £{stake:.2f} at {odds:.2f}: {outcome_word(won)}, profit £{profit:.2f}"

@@tests
def test_won():
    """Describes a winning bet"""
    got = bet_summary(10, 2.5, True)
    assert got == "Stake £10.00 at 2.50: won, profit £15.00", f"got {got!r}"

def test_lost():
    """Describes a losing bet"""
    got = bet_summary(10, 2.5, False)
    assert got == "Stake £10.00 at 2.50: lost, profit £-10.00", f"got {got!r}"

def test_other_values():
    """Works for other stakes and odds"""
    got = bet_summary(4, 1.8, True)
    assert got == "Stake £4.00 at 1.80: won, profit £3.20", f"got {got!r}"

@@hint
Start with `profit = settle(stake, odds, won)`, then build the string with an f-string using `:.2f` for each number.
:::

:::quiz functions-quiz Quick check
? What does this print?
```python
def double(x):
    x * 2

print(double(4))
```
- [ ] 8
- [x] None
- [ ] An error
> There's no `return`, so the function returns `None`.

? In `def area(width, height=1):`, which calls are valid?
- [x] `area(3)`
- [x] `area(3, 4)`
- [x] `area(height=4, width=3)`
- [ ] `area(height=4)`
> `width` has no default, so it must always be given.

? What's the difference between a parameter and an argument?
- [x] A parameter is the name in the definition; an argument is the value passed in a call
- [ ] They're two words for the same thing, with no difference
- [ ] Arguments are only for keyword calls
> In `def f(x)`, `x` is a parameter. In `f(5)`, `5` is an argument. (People often use the words loosely.)

? Which is a pure function?
- [x] `def add(a, b): return a + b`
- [ ] A function that prints to the screen and returns nothing
- [ ] A function that changes a global variable
> A pure function's result depends only on its inputs, and it changes nothing else.
:::

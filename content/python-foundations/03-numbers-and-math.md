---
title: Numbers and arithmetic
summary: Every arithmetic operator, rounding, the math module, why 0.1 + 0.2 isn't 0.3, and your first function.
minutes: 45
kind: lesson
---

Machine learning is maths done by computers, so let's get comfortable with numbers in Python.

## The arithmetic operators

| Operator | Meaning | Example | Result |
| --- | --- | --- | --- |
| `+` | add | `7 + 2` | `9` |
| `-` | subtract | `7 - 2` | `5` |
| `*` | multiply | `7 * 2` | `14` |
| `/` | divide | `7 / 2` | `3.5` |
| `//` | floor division (divide, round down) | `7 // 2` | `3` |
| `%` | remainder ("modulo") | `7 % 2` | `1` |
| `**` | power | `7 ** 2` | `49` |

```python
print(7 / 2)    # always gives a float
print(8 / 2)    # even when it divides exactly: 4.0
print(7 // 2)   # whole number of times 2 fits into 7
print(7 % 2)    # what's left over
print(2 ** 0.5) # a power of 0.5 is a square root
```

`//` and `%` go together. They answer "how many whole groups, and how much is left?" For example, 135 minutes is 2 hours and 15 minutes:

```python
minutes = 135
hours = minutes // 60
leftover = minutes % 60
print(f"{hours}h {leftover}m")
```

`%` is also the standard way to check whether a number is even: `n % 2 == 0`.

## Order of operations

Python follows the usual maths rules: `**` first, then `*`, `/`, `//` and `%`, then `+` and `-`. Use parentheses whenever it makes your intent clearer:

```python
print(2 + 3 * 4)      # 14, multiplication first
print((2 + 3) * 4)    # 20
print(-2 ** 2)        # -4: the power happens before the minus sign!
print((-2) ** 2)      # 4
```

## ints and floats together

If you mix an `int` and a `float`, the result is a `float`. Python ints can be as large as you like:

```python
print(3 + 0.5)
print(2 ** 100)   # no overflow: Python ints grow as needed
```

## Rounding and other built-ins

```python
print(round(2.71828, 2))   # round to 2 decimal places
print(round(7.5))          # 8
print(round(6.5))          # 6 (!) ties round to the nearest even number
print(abs(-12))            # absolute value
print(min(4, 9, 2))        # smallest
print(max(4, 9, 2))        # largest
```

`round(6.5)` giving `6` surprises everyone once. It's called "banker's rounding" and reduces bias when you round lots of numbers. It rarely matters, but now you know.

## The math module

More maths lives in the `math` **module**. A module is a collection of extra code that you load with `import`:

```python
import math

print(math.sqrt(16))
print(math.pi)
print(math.floor(2.7), math.ceil(2.1))   # round down, round up
print(math.log(100, 10))                 # logarithm base 10
print(math.exp(1))                       # e to the power 1
```

Logarithms and `exp` show up everywhere in machine learning, so don't worry if they're rusty: Phase 4 revisits them.

## Floats are approximate

Run this:

```python
print(0.1 + 0.2)
print(0.1 + 0.2 == 0.3)
```

Computers store floats in binary, and most decimals (like 0.1) can't be stored exactly, just as 1/3 can't be written exactly in decimal. The error is tiny, but it means **you should never compare floats with `==`**. Use `math.isclose` instead:

```python
import math
print(math.isclose(0.1 + 0.2, 0.3))
```

For money in real financial systems, programmers use the `decimal` module or store amounts in whole pennies. For data science, floats are fine.

## Odds and probabilities

Decimal odds tell you what a bet returns per unit staked, including your stake. Odds of `2.50` on a £10 bet return £25 if it wins: £15 profit plus your £10 back. The **implied probability** is `1 / odds`:

```python
odds = 2.50
stake = 10

implied_probability = 1 / odds
total_return = stake * odds
profit = total_return - stake

print(f"Implied probability: {implied_probability:.0%}")
print(f"Return £{total_return:.2f}, profit £{profit:.2f}")
```

You'll build a whole toolkit around this in the Phase 1 project.

## Your first function

So far, every program has worked on one fixed set of values. A **function** packages a calculation so you can reuse it with any inputs. You'll study functions properly in lesson 6; for now, here's the recipe:

```python
def implied_probability(odds):
    return 1 / odds

print(implied_probability(2.0))
print(implied_probability(4.0))
print(implied_probability(1.25))
```

- `def` starts a function definition, followed by its name and its inputs in parentheses (here, one input called `odds`).
- The indented lines below are the function's **body**. Indent with 4 spaces.
- `return` gives the result back to whoever called the function.

From now on, many exercises ask you to fill in a function body. The tests then call your function with lots of different inputs, which checks your code much more thoroughly than one example could.

## Practice

:::exercise hours-minutes Minutes to hours
Complete the function so it turns a number of minutes into a string like `"2h 15m"`.

For example, `format_duration(135)` returns `"2h 15m"` and `format_duration(45)` returns `"0h 45m"`.

@@starter
def format_duration(minutes):
    hours = 0      # fix this line
    leftover = 0   # fix this line
    return f"{hours}h {leftover}m"

@@solution
def format_duration(minutes):
    hours = minutes // 60
    leftover = minutes % 60
    return f"{hours}h {leftover}m"

@@tests
def test_135():
    """135 minutes is 2h 15m"""
    assert format_duration(135) == "2h 15m", f"got {format_duration(135)!r}"

def test_under_an_hour():
    """45 minutes is 0h 45m"""
    assert format_duration(45) == "0h 45m", f"got {format_duration(45)!r}"

def test_exact_hours():
    """180 minutes is 3h 0m"""
    assert format_duration(180) == "3h 0m", f"got {format_duration(180)!r}"

def test_football_match():
    """A 90-minute match is 1h 30m"""
    assert format_duration(90) == "1h 30m"

@@hint
`//` gives the whole number of hours. `%` gives what's left over.
:::

:::exercise profit-calc Profit from a bet
Complete `profit(stake, odds, won)`:

- if `won` is `True`, return the profit: `stake * odds - stake`
- if `won` is `False`, return `-stake` (you lose your stake)

The `if` part is already written for you, so just fill in the two calculations. (You'll learn `if` properly in lesson 5.)

@@starter
def profit(stake, odds, won):
    if won:
        return 0   # replace 0 with the profit calculation
    else:
        return 0   # replace 0 with the loss

@@solution
def profit(stake, odds, won):
    if won:
        return stake * odds - stake
    else:
        return -stake

@@tests
import math

def test_winning_bet():
    """£10 at 2.5 that wins makes £15 profit"""
    assert math.isclose(profit(10, 2.5, True), 15)

def test_losing_bet():
    """£10 that loses is -£10"""
    assert profit(10, 2.5, False) == -10

def test_even_money():
    """£20 at 2.0 that wins makes £20"""
    assert math.isclose(profit(20, 2.0, True), 20)

def test_short_odds():
    """£100 at 1.25 that wins makes £25"""
    assert math.isclose(profit(100, 1.25, True), 25)
:::

:::exercise compound-growth Compound growth
If a savings account grows by `rate` each year (for example `0.05` for 5%), after `years` years an amount becomes:

$$
\text{amount} \times (1 + \text{rate})^{\text{years}}
$$

Complete `grow(amount, rate, years)` and return the result **rounded to 2 decimal places**.

@@starter
def grow(amount, rate, years):
    return amount

@@solution
def grow(amount, rate, years):
    return round(amount * (1 + rate) ** years, 2)

@@tests
def test_one_year():
    """£100 at 5% for 1 year is £105.00"""
    assert grow(100, 0.05, 1) == 105.0

def test_ten_years():
    """£1000 at 7% for 10 years is £1967.15"""
    assert grow(1000, 0.07, 10) == 1967.15, f"got {grow(1000, 0.07, 10)}"

def test_zero_years():
    """Zero years leaves the amount unchanged"""
    assert grow(250, 0.1, 0) == 250

def test_rounded():
    """The result is rounded to 2 decimal places"""
    value = grow(100, 0.033, 3)
    assert value == round(value, 2), f"{value} isn't rounded to 2 decimal places"

@@hint
Powers use `**`. Wrap the whole calculation in `round(..., 2)`.
:::

:::quiz numbers-quiz Quick check
? What is `17 // 5`?
- [ ] 3.4
- [x] 3
- [ ] 2
> Floor division: 5 goes into 17 three whole times.

? What is `17 % 5`?
- [x] 2
- [ ] 3
- [ ] 0.4
> 17 = 3 × 5 + 2, so the remainder is 2.

? What does `10 / 2` return?
- [ ] 5
- [x] 5.0
- [ ] "5"
> `/` always returns a float.

? Why is `0.1 + 0.2 == 0.3` False?
- [ ] Python has a bug in addition
- [x] Floats are stored in binary and most decimals can't be represented exactly
- [ ] `==` doesn't work on numbers
> Use `math.isclose()` to compare floats.

? What does `return` do in a function?
- [ ] Prints the result
- [x] Sends a value back to the code that called the function
- [ ] Restarts the function
> `print` shows a value on screen; `return` hands it back so other code can use it.
:::

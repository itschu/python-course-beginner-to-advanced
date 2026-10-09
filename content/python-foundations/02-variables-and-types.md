---
title: Variables and data types
summary: Store values in variables, meet Python's basic types, and convert between them.
minutes: 40
kind: lesson
---

Programs work with data: prices, names, scores, probabilities. A **variable** is a name that refers to a value, so you can use it later.

## Creating variables

You create a variable with `=`, the **assignment** operator. The name goes on the left, the value on the right:

```python
team = "Ashford City"
goals = 3
odds = 2.75

print(team)
print(goals)
print(odds)
```

Read `goals = 3` as "`goals` now refers to `3`", not "goals equals 3". Assignment is an action: it happens when that line runs.

You can change what a variable refers to by assigning again. The old value is forgotten:

```python
score = 0
print(score)
score = 10
print(score)
score = score + 5   # take the current value, add 5, store the result
print(score)
```

The line `score = score + 5` looks strange in maths, but in Python it makes sense: the right-hand side is calculated first (using the old value), then the name is pointed at the result. It's so common there's a shortcut, `score += 5`. There are also `-=`, `*=` and `/=`.

## Naming rules and style

Variable names:

- can contain letters, digits and underscores, but **can't start with a digit**,
- are case sensitive: `Goals` and `goals` are different variables,
- can't be Python keywords such as `if`, `for`, `class` or `True`.

By convention (PEP 8, Python's style guide), names are `lowercase_with_underscores`. Choose names that say what the value *means*:

```python static
# Hard to understand
x = 2.5
y = 10
z = x * y

# Clear
decimal_odds = 2.5
stake = 10
potential_return = decimal_odds * stake
```

## The four basic types

Every value in Python has a **type**, which decides what you can do with it. You can check a value's type with `type()`:

```python
print(type(42))          # int: whole numbers
print(type(3.14))        # float: numbers with a decimal point
print(type("hello"))     # str: text (a "string" of characters)
print(type(True))        # bool: True or False
```

| Type | Examples | Used for |
| --- | --- | --- |
| `int` | `0`, `42`, `-7`, `1_000_000` | Counting things: goals, rows, ages |
| `float` | `2.5`, `-0.01`, `1e6` | Measurements: prices, probabilities, odds |
| `str` | `"Ada"`, `'2.5'`, `""` | Text: names, labels, messages |
| `bool` | `True`, `False` | Yes/no facts: "is the match finished?" |

You can write underscores in long numbers to make them readable: `1_000_000` is one million.

The type matters. `"7"` (a string) and `7` (an integer) are different things:

```python
print(7 + 3)        # integer addition
print("7" + "3")    # string "addition" joins text together
```

And mixing them doesn't work, because Python won't guess what you meant:

```python expect-error
age = 30
print("I am " + age + " years old")
```

## Converting between types

You can convert values with `int()`, `float()`, `str()` and `bool()`:

```python
print(int("42") + 1)        # text to integer
print(float("2.75") * 10)   # text to float
print(str(30) + " years")   # number to text
print(int(3.99))            # float to int: chops off the decimals (doesn't round!)
print(round(3.99))          # round() rounds to the nearest whole number
```

Conversion fails if the value doesn't make sense as the new type:

```python expect-error
int("three")
```

Converting is something you'll do constantly with real data, because files and web forms give you text even when it looks like a number.

## f-strings: putting values into text

The easiest way to combine text and values is an **f-string**: put `f` before the opening quote, and write any variable or expression inside `{curly braces}`:

```python
name = "Ada"
age = 36
print(f"{name} is {age} years old.")
print(f"Next year {name} will be {age + 1}.")
```

f-strings can also format numbers. After the value, add `:` and a format:

```python
probability = 0.4166666
price = 1234.5

print(f"{probability:.2f}")   # 2 decimal places
print(f"{probability:.1%}")   # as a percentage with 1 decimal place
print(f"{price:,.2f}")        # thousands separator and 2 decimals
```

You'll use `.2f` and `.1%` a lot when printing results.

## Booleans

`bool` has just two values, `True` and `False` (with capital letters). You usually get them from comparisons, which you'll study properly in the conditionals lesson:

```python
goals_home = 2
goals_away = 1
home_win = goals_home > goals_away
print(home_win)
print(type(home_win))
```

:::tip Python Tutor
If you want to *see* what variables do, paste a few lines into [Python Tutor](https://pythontutor.com/). It shows each variable and value as the code runs, step by step.
:::

## Practice

:::exercise match-variables Describe a match
Create these variables:

- `home_team` set to `"Bramley Rovers"`
- `away_team` set to `"Fairhaven FC"`
- `home_goals` set to `2`
- `away_goals` set to `2`

Then create `total_goals`, calculated from the two goal variables (don't type the number 4).

@@starter
# Create the four variables here

# Then calculate total_goals from them

@@solution
home_team = "Bramley Rovers"
away_team = "Fairhaven FC"
home_goals = 2
away_goals = 2
total_goals = home_goals + away_goals

@@tests
def test_teams():
    """home_team and away_team are the right strings"""
    assert home_team == "Bramley Rovers", f"home_team is {home_team!r}"
    assert away_team == "Fairhaven FC", f"away_team is {away_team!r}"

def test_goals_are_ints():
    """home_goals and away_goals are the integer 2"""
    assert home_goals == 2 and isinstance(home_goals, int), "home_goals should be the int 2 (no quotes)"
    assert away_goals == 2 and isinstance(away_goals, int), "away_goals should be the int 2 (no quotes)"

def test_total():
    """total_goals is 4"""
    assert total_goals == 4, f"total_goals is {total_goals!r}"

@@hint
Text values need quotes; numbers don't. `home_goals = "2"` would be a string, not a number.

@@hint
`total_goals = home_goals + away_goals`
:::

:::exercise convert-text Clean up text numbers
Data often arrives as text. You're given two strings. Convert them and calculate:

- `stake`: the number in `stake_text` as a **float**
- `odds`: the number in `odds_text` as a **float**
- `payout`: `stake` multiplied by `odds`

@@starter
stake_text = "25"
odds_text = "3.40"

stake = stake_text
odds = odds_text
payout = 0

@@solution
stake_text = "25"
odds_text = "3.40"

stake = float(stake_text)
odds = float(odds_text)
payout = stake * odds

@@tests
import math

def test_stake():
    """stake is the float 25.0"""
    assert isinstance(stake, float), f"stake should be a float, but it's a {type(stake).__name__}"
    assert stake == 25.0

def test_odds():
    """odds is the float 3.4"""
    assert isinstance(odds, float), f"odds should be a float, but it's a {type(odds).__name__}"
    assert odds == 3.4

def test_payout():
    """payout is 85.0"""
    assert math.isclose(payout, 85.0), f"payout is {payout!r}"

@@hint
`float("3.40")` turns the text into the number 3.4.
:::

:::exercise format-report Format a report
Use f-strings to print exactly these two lines, using the variables provided (don't type the numbers yourself):

```text
Player: Grace, matches: 38
Win rate: 57.9%
```

The win rate is `wins / matches`, formatted as a percentage with one decimal place.

@@starter
player = "Grace"
matches = 38
wins = 22

# print the two lines here

@@solution
player = "Grace"
matches = 38
wins = 22

print(f"Player: {player}, matches: {matches}")
print(f"Win rate: {wins / matches:.1%}")

@@tests
def test_lines():
    """Prints the two lines exactly"""
    lines = output.strip().splitlines()
    assert len(lines) == 2, f"Expected 2 lines, got {len(lines)}"
    assert lines[0] == "Player: Grace, matches: 38", f"Line 1 is {lines[0]!r}"
    assert lines[1] == "Win rate: 57.9%", f"Line 2 is {lines[1]!r}"

def test_uses_variables():
    """Calculates the win rate instead of typing it"""
    assert "57.9" not in source, "Calculate the win rate with wins / matches instead of typing 57.9"

@@hint
Inside the braces you can calculate: `{wins / matches}`.

@@hint
Add the format after a colon: `{wins / matches:.1%}`.
:::

:::quiz variables-quiz Quick check
? After these lines run, what is `x`?
```python
x = 5
x = x * 2
x += 1
```
- [ ] 5
- [ ] 10
- [x] 11
- [ ] An error
> `x` becomes 10, then `x += 1` adds one.

? What is `type("3.5")`?
- [ ] float
- [x] str
- [ ] int
> It's in quotes, so it's text, even though it looks like a number.

? What does `int(7.8)` give?
- [x] 7
- [ ] 8
- [ ] 7.8
> `int()` drops the decimal part. Use `round()` to round.

? Which of these are valid variable names?
- [x] `home_goals`
- [ ] `2nd_half_goals`
- [x] `_temp`
- [ ] `class`
> Names can't start with a digit, and `class` is a reserved keyword.

? What does `print(f"{0.25:.0%}")` display?
- [ ] 0.25
- [x] 25%
- [ ] 0%
> The `%` format multiplies by 100 and adds a percent sign; `.0` means no decimal places.
:::

---
title: Making decisions (if, elif, else)
summary: Comparisons, booleans and logic, and how to make your program take different paths.
minutes: 45
kind: lesson
---

Programs become useful when they can make decisions: settle a bet only if it won, flag a transaction only if it looks suspicious, stop training a model only when it stops improving.

## Comparisons

A comparison asks a yes/no question and produces a `bool`:

| Operator | Meaning |
| --- | --- |
| `==` | equal to |
| `!=` | not equal to |
| `<` `>` | less than, greater than |
| `<=` `>=` | less than or equal, greater than or equal |

```python
home_goals = 2
away_goals = 1

print(home_goals > away_goals)
print(home_goals == away_goals)
print(home_goals != away_goals)
print("Ada" == "ada")     # strings compare exactly, including case
```

:::warning = is not ==
`=` **assigns** a value. `==` **compares** two values. Mixing them up is the most common beginner bug.
:::

Python lets you chain comparisons, which reads just like maths:

```python
probability = 0.35
print(0 <= probability <= 1)
```

## if, elif, else

```python
home_goals = 2
away_goals = 2

if home_goals > away_goals:
    result = "Home win"
elif home_goals < away_goals:
    result = "Away win"
else:
    result = "Draw"

print(result)
```

- Python checks the conditions **in order** and runs the block under the first one that's `True`. Then it skips the rest.
- `elif` ("else if") and `else` are optional. You can have as many `elif`s as you need.
- The colon `:` and the **indentation** matter. The indented lines are the block that belongs to that branch. Python uses indentation instead of braces, so getting it wrong changes what your code means.

Try changing the goals above and running it again.

## Combining conditions: and, or, not

```python
odds = 2.4
probability = 0.48

is_valid_odds = odds > 1.0
is_value = probability * odds > 1

print(is_valid_odds and is_value)   # True only if both are True
print(odds < 1.5 or odds > 5)       # True if at least one is True
print(not is_value)                 # flips True and False
```

| `a` | `b` | `a and b` | `a or b` |
| --- | --- | --- | --- |
| True | True | True | True |
| True | False | False | True |
| False | True | False | True |
| False | False | False | False |

## Truthiness

In an `if`, Python treats some values as `False` even though they aren't booleans: `0`, `0.0`, the empty string `""`, empty collections like `[]`, and `None`. Everything else counts as `True`:

```python
name = ""
if name:
    print(f"Hello, {name}")
else:
    print("No name given")
```

This makes checks like `if name:` ("if a name was given") short and readable.

## None: "no value"

`None` is a special value meaning "nothing here". Functions that don't return anything return `None`, and it's often used for missing data. Check for it with `is`:

```python
best_odds = None
if best_odds is None:
    print("No odds available yet")
```

## Conditional expressions

For a simple either/or value, there's a one-line form:

```python
goals = 3
label = "over 2.5" if goals > 2.5 else "under 2.5"
print(label)
```

## Nesting

You can put an `if` inside another `if`. If you find yourself nesting more than two levels deep, there's usually a clearer way (often `elif` or `and`):

```python
age = 20
has_id = True

if age >= 18:
    if has_id:
        print("Allowed")
    else:
        print("Bring ID")
else:
    print("Too young")
```

## Practice

:::exercise match-result Match result
Complete `result(home_goals, away_goals)` so it returns:

- `"H"` if the home team scored more,
- `"A"` if the away team scored more,
- `"D"` for a draw.

These are the letters used in the `FTR` (full-time result) column of football data files.

@@starter
def result(home_goals, away_goals):
    return "D"

@@solution
def result(home_goals, away_goals):
    if home_goals > away_goals:
        return "H"
    elif home_goals < away_goals:
        return "A"
    else:
        return "D"

@@tests
def test_home_win():
    """3-1 is a home win"""
    assert result(3, 1) == "H"

def test_away_win():
    """0-2 is an away win"""
    assert result(0, 2) == "A"

def test_draw():
    """1-1 and 0-0 are draws"""
    assert result(1, 1) == "D"
    assert result(0, 0) == "D"

@@hint
Use `if`, `elif` and `else`, and `return` a different letter in each branch.
:::

:::exercise grade Grade a score
Complete `grade(score)` for a test marked out of 100:

| Score | Grade |
| --- | --- |
| 70 or more | `"A"` |
| 60 to 69 | `"B"` |
| 50 to 59 | `"C"` |
| below 50 | `"Fail"` |

If the score is below 0 or above 100, return `"Invalid"`.

@@starter
def grade(score):
    pass

@@solution
def grade(score):
    if score < 0 or score > 100:
        return "Invalid"
    elif score >= 70:
        return "A"
    elif score >= 60:
        return "B"
    elif score >= 50:
        return "C"
    else:
        return "Fail"

@@tests
def test_boundaries():
    """Scores exactly on a boundary get the higher grade"""
    assert grade(70) == "A", f"grade(70) is {grade(70)!r}"
    assert grade(60) == "B", f"grade(60) is {grade(60)!r}"
    assert grade(50) == "C", f"grade(50) is {grade(50)!r}"

def test_middle():
    """Typical scores"""
    assert grade(85) == "A"
    assert grade(64) == "B"
    assert grade(55) == "C"
    assert grade(12) == "Fail"

def test_edges():
    """0 fails and 100 is an A"""
    assert grade(0) == "Fail"
    assert grade(100) == "A"

def test_invalid():
    """Out-of-range scores are invalid"""
    assert grade(-5) == "Invalid"
    assert grade(101) == "Invalid"

@@hint
Check for invalid scores first. Then check from the highest grade down: because `elif` stops at the first match, `score >= 60` only runs for scores below 70.
:::

:::exercise value-bet Is it a value bet?
A bet is **value** if your estimated probability multiplied by the decimal odds is greater than 1. (You'll see why in Phase 4.)

Complete `is_value_bet(probability, odds)`. It should return:

- `False` if the inputs make no sense: probability outside 0 to 1, or odds of 1.0 or less,
- otherwise `True` if `probability * odds > 1`, and `False` if not.

@@starter
def is_value_bet(probability, odds):
    return False

@@solution
def is_value_bet(probability, odds):
    if not (0 <= probability <= 1) or odds <= 1.0:
        return False
    return probability * odds > 1

@@tests
def test_value():
    """50% at odds of 2.2 is value"""
    assert is_value_bet(0.5, 2.2) is True

def test_not_value():
    """40% at odds of 2.2 isn't value"""
    assert is_value_bet(0.4, 2.2) is False

def test_break_even():
    """Exactly 1 isn't value (it must be greater than 1)"""
    assert is_value_bet(0.5, 2.0) is False

def test_invalid_inputs():
    """Impossible probabilities or odds return False"""
    assert is_value_bet(1.5, 3.0) is False
    assert is_value_bet(-0.1, 3.0) is False
    assert is_value_bet(0.9, 1.0) is False
    assert is_value_bet(0.9, 0.5) is False

@@hint
Check for invalid inputs first and `return False`. Then return the comparison itself: `probability * odds > 1` is already `True` or `False`.
:::

:::quiz conditions-quiz Quick check
? What does this print?
```python
x = 15
if x > 10:
    print("big")
elif x > 5:
    print("medium")
else:
    print("small")
```
- [x] big
- [ ] big and medium
- [ ] medium
> Only the first true branch runs.

? Which values count as False in an `if`?
- [x] `0`
- [x] `""`
- [ ] `"False"`
- [x] `None`
> `"False"` is a non-empty string, so it counts as True!

? What is `True and not False`?
- [x] True
- [ ] False
> `not False` is True, and `True and True` is True.

? What's wrong with `if score = 100:`?
- [ ] Nothing
- [x] It uses `=` (assignment) instead of `==` (comparison)
- [ ] `if` needs parentheses
> Python gives a SyntaxError here, which protects you from this classic bug.
:::

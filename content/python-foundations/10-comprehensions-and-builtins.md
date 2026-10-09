---
title: Comprehensions and built-in functions
summary: Write concise, Pythonic code with comprehensions, sorting keys, lambdas, any/all and friends.
minutes: 45
kind: lesson
---

You now know enough Python to solve almost anything. This lesson is about solving things *elegantly*: the idioms experienced Python programmers reach for.

## List comprehensions

Building a new list with a loop is so common that Python has a shorthand:

```python
goals = [2, 0, 3, 1, 1, 4]

# The loop way
doubled = []
for g in goals:
    doubled.append(g * 2)

# The comprehension way
doubled = [g * 2 for g in goals]
print(doubled)
```

Read it as "a list of `g * 2` for each `g` in `goals`". Add an `if` to filter:

```python
goals = [2, 0, 3, 1, 1, 4]
high = [g for g in goals if g >= 2]
print(high)

odds = [1.5, 2.2, 3.8, 1.9]
implied = [round(1 / o, 3) for o in odds]
print(implied)

names = ["  ashford ", "BRAMLEY", "castleton  "]
clean = [n.strip().title() for n in names]
print(clean)
```

## Dictionary and set comprehensions

```python
teams = ["Ashford City", "Bramley Rovers"]
lengths = {t: len(t) for t in teams}
print(lengths)

odds = {"home": 2.1, "draw": 3.4, "away": 3.6}
implied = {outcome: round(1 / price, 3) for outcome, price in odds.items()}
print(implied)

letters = {name[0] for name in ["Ada", "Alan", "Grace"]}
print(letters)
```

:::tip When not to use a comprehension
If a comprehension needs nested loops *and* several conditions, or doesn't fit on one or two lines, a normal loop is clearer. Readability beats cleverness.
:::

## Generator expressions

Put a comprehension inside a function call without the square brackets, and Python computes values one at a time instead of building a whole list in memory:

```python
odds = [2.1, 3.4, 3.6]
total_implied = sum(1 / o for o in odds)
print(round(total_implied, 4))
```

## Sorting with a key

`sorted`, `min` and `max` accept a `key`: a function that says *what to compare*:

```python
teams = ["Bramley Rovers", "Ashford City", "Fairhaven FC"]
print(sorted(teams))              # alphabetical
print(sorted(teams, key=len))     # by length

table = [("Ashford City", 78), ("Bramley Rovers", 71), ("Castleton United", 81)]
print(sorted(table, key=lambda row: row[1], reverse=True))
print(max(table, key=lambda row: row[1]))
```

## lambda: tiny unnamed functions

`lambda row: row[1]` is a function written inline. It takes `row` and returns `row[1]`. It's exactly equivalent to:

```python static
def second_item(row):
    return row[1]
```

Use `lambda` for short throwaway functions like sort keys. For anything longer, use `def`.

Sorting by several things at once uses a tuple as the key. Python compares tuples item by item:

```python
table = [("Ashford", 78, 30), ("Bramley", 78, 35), ("Castleton", 81, 20)]
# points descending, then goal difference descending
ranked = sorted(table, key=lambda row: (row[1], row[2]), reverse=True)
for team, pts, gd in ranked:
    print(team, pts, gd)
```

## any and all

```python
odds = [2.1, 3.4, 0.9]
print(all(o > 1 for o in odds))     # are all odds valid?
print(any(o > 3 for o in odds))     # is there at least one long shot?
```

## More useful built-ins

```python
values = [3, 1, 4, 1, 5, 9, 2, 6]

print(sum(values), len(values), min(values), max(values))
print(sorted(set(values)))              # unique values, sorted
print(list(reversed(values)))
print(list(zip("abc", [1, 2, 3])))
print(dict(zip(["home", "draw", "away"], [2.1, 3.4, 3.6])))
print(round(sum(values) / len(values), 2))
print(list(map(str, values)))           # apply str to each item
print(list(filter(lambda v: v > 3, values)))
print(divmod(135, 60))                  # (135 // 60, 135 % 60)
```

`map` and `filter` exist, but most Python programmers prefer comprehensions because they read more naturally.

## Unpacking with * and **

```python
def total(*numbers):              # collects any number of positional arguments
    return sum(numbers)

print(total(1, 2, 3, 4))

def describe(**details):          # collects keyword arguments into a dict
    return ", ".join(f"{k}={v}" for k, v in details.items())

print(describe(model="logistic", c=1.0))

scores = [3, 1, 2]
print(*scores)                    # spreads a list into separate arguments
```

You'll see `*args` and `**kwargs` all over library code.

## Practice

:::exercise comp-implied Implied probabilities
Complete `implied(odds)` using a **list comprehension**. Given a list of decimal odds, return the list of implied probabilities (`1 / odds`), each rounded to 3 decimal places.

@@starter
def implied(odds):
    return []

@@solution
def implied(odds):
    return [round(1 / o, 3) for o in odds]

@@tests
def test_values():
    """Converts each price"""
    assert implied([2.0, 4.0, 1.25]) == [0.5, 0.25, 0.8]

def test_rounding():
    """Rounds to 3 decimal places"""
    assert implied([3.0]) == [0.333]

def test_comprehension():
    """Uses a list comprehension"""
    assert "for" in source and "[" in source and ".append" not in source, "Write it as [... for o in odds]"
:::

:::exercise standings Sort a league table
Each row is `(team, points, goal_difference)`. Complete `standings(rows)` so it returns the team **names** ordered by points (highest first), then goal difference (highest first), then team name alphabetically.

@@starter
def standings(rows):
    return [row[0] for row in rows]

@@solution
def standings(rows):
    ranked = sorted(rows, key=lambda r: (-r[1], -r[2], r[0]))
    return [r[0] for r in ranked]

@@tests
def test_points():
    """Higher points come first"""
    rows = [("A", 10, 0), ("B", 20, 0), ("C", 15, 0)]
    assert standings(rows) == ["B", "C", "A"], f"got {standings(rows)}"

def test_goal_difference():
    """Ties on points are broken by goal difference"""
    rows = [("A", 10, 2), ("B", 10, 8), ("C", 10, -1)]
    assert standings(rows) == ["B", "A", "C"], f"got {standings(rows)}"

def test_name():
    """Then by name alphabetically"""
    rows = [("Castleton", 10, 2), ("Ashford", 10, 2), ("Bramley", 12, 0)]
    assert standings(rows) == ["Bramley", "Ashford", "Castleton"], f"got {standings(rows)}"

@@hint
Use a tuple as the sort key. Making a number negative (`-r[1]`) sorts it descending while the name still sorts ascending.
:::

:::exercise best-prices Best price per outcome
Several bookmakers offer odds on the same match. Each is a dictionary like `{"bookmaker": "A", "home": 2.1, "draw": 3.4, "away": 3.5}`.

Complete `best_prices(quotes)` to return a dictionary with the **highest** price for each outcome: `{"home": ..., "draw": ..., "away": ...}`.

@@starter
def best_prices(quotes):
    return {}

@@solution
def best_prices(quotes):
    return {outcome: max(q[outcome] for q in quotes) for outcome in ["home", "draw", "away"]}

@@tests
def test_example():
    """Picks the best price for each outcome"""
    quotes = [
        {"bookmaker": "A", "home": 2.10, "draw": 3.40, "away": 3.50},
        {"bookmaker": "B", "home": 2.25, "draw": 3.20, "away": 3.60},
        {"bookmaker": "C", "home": 2.15, "draw": 3.50, "away": 3.40},
    ]
    assert best_prices(quotes) == {"home": 2.25, "draw": 3.50, "away": 3.60}

def test_single_bookmaker():
    """Works with one bookmaker"""
    assert best_prices([{"bookmaker": "A", "home": 1.5, "draw": 4.0, "away": 6.0}]) == {"home": 1.5, "draw": 4.0, "away": 6.0}

@@hint
A dictionary comprehension over the three outcome names, with `max(...)` of a generator expression inside.
:::

:::quiz comprehensions-quiz Quick check
? What is `[x * x for x in range(4) if x % 2 == 0]`?
- [ ] `[0, 1, 4, 9]`
- [x] `[0, 4]`
- [ ] `[1, 9]`
> Only 0 and 2 pass the filter, giving 0 and 4.

? What does `sorted(["bb", "a", "ccc"], key=len)` return?
- [x] `["a", "bb", "ccc"]`
- [ ] `["ccc", "bb", "a"]`
- [ ] `[1, 2, 3]`
> The key decides the order, but the original items are returned.

? What is `all([])`?
- [x] True
- [ ] False
> "Every item is true" is vacuously true for an empty list. `any([])` is False.

? What does `lambda x: x + 1` create?
- [x] A function
- [ ] A list
- [ ] The number 1
> A lambda is a small anonymous function.
:::

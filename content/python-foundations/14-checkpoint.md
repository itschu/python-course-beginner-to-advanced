---
title: "Checkpoint: Python Foundations"
summary: A mixed test of everything in Phase 1. Pass it before moving on to Professional Python.
minutes: 60
kind: checkpoint
---

This checkpoint mixes everything from Phase 1. Aim to complete it **without** hints or solutions. If you get stuck, that's useful information: go back to the lesson that covers it, then come back.

**Passing standard:** all four exercises pass and you score at least 10/12 on the quiz.

:::quiz phase1-final Phase 1 quiz
? What does this print?
```python
x = "5"
y = 2
print(x * y)
```
- [ ] 10
- [x] 55
- [ ] An error
> Multiplying a string by an int repeats it.

? What is `len([1, [2, 3], "four"])`?
- [ ] 4
- [x] 3
- [ ] 6
> The list has three items: an int, a list and a string.

? What is `{"a": 1, "b": 2}["c"]`?
- [ ] None
- [ ] 0
- [x] A KeyError
> Use `.get("c")` if a key might be missing.

? Which loop prints 10, 8, 6?
- [x] `for i in range(10, 5, -2): print(i)`
- [ ] `for i in range(10, 6): print(i)`
- [ ] `for i in range(6, 10, 2): print(i)`
> A negative step counts down; the stop value (5) isn't included.

? What's the value of `result`?
```python
def f(a, b=2):
    return a ** b
result = f(3) + f(2, 3)
```
- [ ] 15
- [x] 17
- [ ] 13
> f(3) is 3² = 9 and f(2, 3) is 2³ = 8.

? Which are immutable?
- [x] str
- [x] tuple
- [ ] list
- [ ] dict
> Strings and tuples can't be changed after creation.

? What does `[n for n in range(10) if n % 3 == 0]` produce?
- [x] `[0, 3, 6, 9]`
- [ ] `[3, 6, 9]`
- [ ] `[1, 4, 7]`
> 0 counts: 0 % 3 is 0.

? A function raises `ValueError` for bad input. How should the caller handle it if bad input is expected?
- [ ] `except:`
- [x] `except ValueError:`
- [ ] Let the program crash
> Catch the specific exception you expect.

? After `a = [1, 2]`, `b = a.copy()`, `b.append(3)`: what is `a`?
- [x] `[1, 2]`
- [ ] `[1, 2, 3]`
> `.copy()` creates an independent list.

? Decimal odds of 4.0 imply what probability?
- [ ] 40%
- [x] 25%
- [ ] 75%
> 1 / 4.0 = 0.25.

? A market's prices are 1.90 and 1.90. What's the bookmaker's margin?
- [ ] 0%
- [x] About 5.3%
- [ ] 10%
> 1/1.9 + 1/1.9 = 1.0526, so the margin is about 5.3%.

? What does `sorted(["b", "A", "c"])` return?
- [x] `["A", "b", "c"]`
- [ ] `["A", "B", "C"]`
- [ ] `["b", "A", "c"]`
> Uppercase letters sort before lowercase ones. Use `key=str.lower` for case-insensitive sorting.
:::

:::exercise cp1-parse Parse results safely
Complete `parse_results(lines)`. Each line should look like `"Home Team,2,Away Team,1"` (home team, home goals, away team, away goals). Return a list of tuples `(home, home_goals, away, away_goals)` with goals as ints and team names stripped of surrounding spaces.

Skip any line that doesn't have exactly 4 parts or whose goals aren't whole numbers.

@@starter
def parse_results(lines):
    pass

@@solution
def parse_results(lines):
    results = []
    for line in lines:
        parts = line.split(",")
        if len(parts) != 4:
            continue
        try:
            hg, ag = int(parts[1]), int(parts[3])
        except ValueError:
            continue
        results.append((parts[0].strip(), hg, parts[2].strip(), ag))
    return results

@@tests
def test_valid():
    """Parses valid lines"""
    assert parse_results(["Ashford,2,Bramley,1", " Castleton , 0 ,Dunmore,0"]) == [
        ("Ashford", 2, "Bramley", 1),
        ("Castleton", 0, "Dunmore", 0),
    ]

def test_skips_bad_lines():
    """Skips malformed lines"""
    lines = ["Ashford,2,Bramley,1", "bad line", "A,two,B,1", "A,1,B,1,extra", "", "Eastbrook,3,Fairhaven,3"]
    assert parse_results(lines) == [("Ashford", 2, "Bramley", 1), ("Eastbrook", 3, "Fairhaven", 3)]
:::

:::exercise cp1-form Recent form
Complete `form(matches, team, n=5)`. `matches` is a list of `(home, away, home_goals, away_goals)` tuples in date order. Return a string of `W`, `D` and `L` letters for `team`'s last `n` matches, oldest first. A team's matches can be at home or away.

@@starter
def form(matches, team, n=5):
    pass

@@solution
def form(matches, team, n=5):
    letters = []
    for home, away, hg, ag in matches:
        if team == home:
            scored, conceded = hg, ag
        elif team == away:
            scored, conceded = ag, hg
        else:
            continue
        letters.append("W" if scored > conceded else "L" if scored < conceded else "D")
    return "".join(letters[-n:]) if n > 0 else ""

@@tests
MATCHES = [
    ("A", "B", 2, 0), ("C", "A", 1, 1), ("A", "D", 0, 3), ("B", "C", 2, 2),
    ("E", "A", 0, 2), ("A", "C", 4, 1), ("D", "A", 2, 1),
]

def test_home_and_away():
    """Counts home and away matches correctly"""
    assert form(MATCHES, "A") == "DLWWL", f"got {form(MATCHES, 'A')!r}"

def test_n():
    """Respects n"""
    assert form(MATCHES, "A", n=3) == "WWL"
    assert form(MATCHES, "A", n=10) == "WDLWWL"

def test_other_team():
    """Works for any team"""
    assert form(MATCHES, "C") == "DDL"
    assert form(MATCHES, "Z") == ""
:::

:::exercise cp1-stock Restock report
A shop keeps `stock` as a dictionary of product → units, and `sales` as a list of `(product, units_sold)` tuples for the day.

Complete `restock(stock, sales, threshold)`. It returns a **sorted list** of products whose stock after the day's sales is **below** `threshold`. Don't modify the `stock` dictionary passed in. Sales of a product not in stock should raise a `KeyError`.

@@starter
def restock(stock, sales, threshold):
    pass

@@solution
def restock(stock, sales, threshold):
    remaining = dict(stock)
    for product, sold in sales:
        if product not in remaining:
            raise KeyError(product)
        remaining[product] -= sold
    return sorted(p for p, units in remaining.items() if units < threshold)

@@tests
def test_report():
    """Lists products below the threshold"""
    stock = {"tea": 20, "coffee": 15, "flapjack": 8, "croissant": 30}
    sales = [("tea", 12), ("coffee", 2), ("tea", 3), ("croissant", 10)]
    assert restock(stock, sales, 10) == ["flapjack", "tea"], f"got {restock(stock, sales, 10)}"

def test_does_not_modify():
    """Leaves the stock dict unchanged"""
    stock = {"tea": 20}
    restock(stock, [("tea", 15)], 10)
    assert stock == {"tea": 20}

def test_unknown_product():
    """Unknown products raise KeyError"""
    try:
        restock({"tea": 1}, [("cake", 1)], 5)
    except KeyError:
        return
    raise AssertionError("expected a KeyError")
:::

:::exercise cp1-csv Summarise a CSV column
Complete `column_summary(path, column)`. Read the CSV at `path` with `csv.DictReader` and return a tuple `(minimum, maximum, mean)` for the numeric `column`, each as a float rounded to 2 decimals.

Try it on `data/houses.csv`, which has `price` and `size_sqm` columns.

@@starter
import csv

def column_summary(path, column):
    pass

@@solution
import csv

def column_summary(path, column):
    with open(path) as f:
        values = [float(row[column]) for row in csv.DictReader(f)]
    return (round(min(values), 2), round(max(values), 2), round(sum(values) / len(values), 2))

@@tests
import csv

def ref(path, column):
    with open(path) as f:
        v = [float(r[column]) for r in csv.DictReader(f)]
    return (round(min(v), 2), round(max(v), 2), round(sum(v) / len(v), 2))

def test_price():
    """Summarises house prices"""
    assert column_summary("data/houses.csv", "price") == ref("data/houses.csv", "price")

def test_size():
    """Works for another column"""
    assert column_summary("data/houses.csv", "size_sqm") == ref("data/houses.csv", "size_sqm")

def test_other_file():
    """Works for another file"""
    assert column_summary("data/matches.csv", "AvgH") == ref("data/matches.csv", "AvgH")
:::

## Phase 1 complete

If you passed, congratulations: you can program. That's a genuine milestone that most people never reach.

Before moving on:

1. Do a few extra exercises on [Exercism's Python track](https://exercism.org/tracks/python) or [Kaggle Learn: Python](https://www.kaggle.com/learn/python) to cement the basics.
2. Revisit any lesson where the quiz felt shaky.

Next, Phase 2 turns you from someone who can write Python into someone who writes Python *well*: classes, testing, type hints and real project tooling on your own computer.

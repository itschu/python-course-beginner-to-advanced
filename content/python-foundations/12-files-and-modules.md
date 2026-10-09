---
title: Files, CSV, JSON and modules
summary: Read and write files, load real CSV data, save JSON, and use Python's huge standard library.
minutes: 55
kind: lesson
---

Data lives in files. This lesson connects your Python skills to real data, and introduces the standard library: the thousands of ready-made tools that come with Python.

:::note Files in the browser
Code here runs in your browser, which has its own small, temporary file system. The course datasets live in a `data/` folder, and files you create last until you reload the page. On your own computer, the same code reads and writes real files.
:::

## Writing and reading text files

```python
with open("notes.txt", "w") as f:
    f.write("First line\n")
    f.write("Second line\n")

with open("notes.txt") as f:
    content = f.read()
print(content)
```

- `open(path, mode)` opens a file. Modes: `"r"` read (the default), `"w"` write (replaces the file!), `"a"` append.
- The `with` block closes the file automatically when the block ends, even if an error happens. Always use `with` for files.

Reading line by line is the usual approach for big files, because it doesn't load everything into memory at once:

```python
with open("notes.txt", "a") as f:
    f.write("Third line\n")

with open("notes.txt") as f:
    for number, line in enumerate(f, start=1):
        print(number, line.strip())     # strip() removes the trailing newline
```

## CSV files

CSV (comma-separated values) is the most common format for tabular data. Here are the first lines of this course's football dataset:

```python
with open("data/matches.csv") as f:
    for _ in range(4):
        print(f.readline().strip())
```

The first line is a **header** with column names. Python's `csv` module handles the details (quoted values with commas inside, and so on). `csv.DictReader` gives you each row as a dictionary keyed by column name:

```python
import csv

with open("data/matches.csv") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(len(rows), "matches")
print(rows[0])
print(rows[0]["HomeTeam"], rows[0]["FTHG"], "-", rows[0]["FTAG"], rows[0]["AwayTeam"])
```

Notice that every value is a **string**, including the goals and odds. You have to convert them yourself:

```python
import csv

home_wins = 0
total_goals = 0
with open("data/matches.csv") as f:
    rows = list(csv.DictReader(f))

for row in rows:
    total_goals += int(row["FTHG"]) + int(row["FTAG"])
    if row["FTR"] == "H":
        home_wins += 1

print(f"Home win rate: {home_wins / len(rows):.1%}")
print(f"Goals per match: {total_goals / len(rows):.2f}")
```

You've just done real data analysis with nothing but core Python. In Phase 3, pandas will make this a one-liner, and you'll appreciate what it's doing for you.

Writing a CSV:

```python
import csv

table = [
    {"team": "Ashford City", "points": 78},
    {"team": "Bramley Rovers", "points": 71},
]
with open("table.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["team", "points"])
    writer.writeheader()
    writer.writerows(table)

print(open("table.csv").read())
```

## JSON

JSON is the format web APIs speak, and it maps neatly onto Python dicts and lists:

```python
import json

model_config = {"model": "logistic_regression", "features": ["elo_diff", "form"], "C": 0.5}

text = json.dumps(model_config, indent=2)   # Python -> JSON text
print(text)

loaded = json.loads(text)                   # JSON text -> Python
print(loaded["features"][0])

with open("config.json", "w") as f:         # straight to and from files
    json.dump(model_config, f)
with open("config.json") as f:
    print(json.load(f))
```

## Modules and imports

A **module** is a file of Python code. You've already imported a few. There are several styles:

```python
import math                      # use as math.sqrt
from statistics import mean      # use as mean
import datetime as dt            # use a shorter name

print(math.sqrt(2))
print(mean([2, 3, 7]))
print(dt.date(2024, 8, 17).strftime("%A %d %B %Y"))
```

Prefer `import module` or `from module import name`. Avoid `from module import *`, which dumps everything into your namespace and makes it unclear where names came from.

## A tour of the standard library

Python comes "batteries included". A few modules you'll use constantly:

```python
import random
import statistics
from collections import Counter, defaultdict
from datetime import date, timedelta

random.seed(42)                              # makes "random" results reproducible
print(random.randint(1, 6), random.choice(["H", "D", "A"]), random.random())

data = [2, 0, 3, 1, 1, 4, 0, 2]
print(statistics.mean(data), statistics.median(data), round(statistics.stdev(data), 3))

print(Counter("HHDAHHA").most_common())

goals = defaultdict(list)                    # a dict that creates missing values
goals["Ashford"].append(2)
print(dict(goals))

kickoff = date(2024, 8, 17)
print(kickoff + timedelta(weeks=1), (date(2025, 5, 25) - kickoff).days, "days in the season")
```

`random.seed()` matters a lot in ML: setting a seed makes experiments **reproducible**, so you get the same "random" numbers every time.

## Installing packages: pip and PyPI

Beyond the standard library, there are over half a million packages on [PyPI](https://pypi.org/) (the Python Package Index). On your own computer you install them with `pip` in a terminal:

```bash
pip install pandas
```

In Phase 2 you'll learn to do this properly inside a **virtual environment**, so each project has its own packages. In this browser runner, the major data science packages are already installed, and you can add other pure-Python packages with `micropip`.

## Your own modules

Any `.py` file is a module. If you save functions in `betting.py`, another file in the same folder can use `from betting import implied_probability`. You'll organise real projects like this in Phase 2.

## Practice

:::exercise team-goals Goals scored at home
Using `csv.DictReader` on `data/matches.csv`, complete `home_goals_by_team()` so it returns a dictionary mapping each team to the **total goals it scored at home** across all seasons.

@@starter
import csv

def home_goals_by_team():
    totals = {}
    with open("data/matches.csv") as f:
        for row in csv.DictReader(f):
            pass
    return totals

@@solution
import csv

def home_goals_by_team():
    totals = {}
    with open("data/matches.csv") as f:
        for row in csv.DictReader(f):
            team = row["HomeTeam"]
            totals[team] = totals.get(team, 0) + int(row["FTHG"])
    return totals

@@tests
import csv

def expected():
    out = {}
    with open("data/matches.csv") as f:
        for r in csv.DictReader(f):
            out[r["HomeTeam"]] = out.get(r["HomeTeam"], 0) + int(r["FTHG"])
    return out

def test_all_teams():
    """Includes all 20 teams"""
    got = home_goals_by_team()
    assert len(got) == 20, f"expected 20 teams, got {len(got)}"

def test_totals():
    """Totals match the data"""
    got = home_goals_by_team()
    exp = expected()
    wrong = [t for t in exp if got.get(t) != exp[t]]
    assert not wrong, f"wrong totals for: {wrong[:3]}"

def test_ints():
    """Totals are numbers, not strings"""
    assert all(isinstance(v, int) for v in home_goals_by_team().values()), "convert goals with int()"

@@hint
Inside the loop, `row["HomeTeam"]` is the team and `int(row["FTHG"])` the goals. Use the `totals.get(team, 0) + ...` pattern.
:::

:::exercise save-load-json Save and load a bet log
Complete two functions:

- `save_bets(bets, path)` writes a list of bet dictionaries to `path` as JSON.
- `load_bets(path)` reads the file back and returns the list. If the file doesn't exist, return an empty list instead of crashing.

@@starter
import json

def save_bets(bets, path):
    pass

def load_bets(path):
    pass

@@solution
import json

def save_bets(bets, path):
    with open(path, "w") as f:
        json.dump(bets, f)

def load_bets(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return []

@@tests
def test_round_trip():
    """Saved bets load back unchanged"""
    bets = [{"match": "Ashford v Bramley", "stake": 10, "odds": 2.5, "won": True}]
    save_bets(bets, "bets_test.json")
    assert load_bets("bets_test.json") == bets

def test_missing_file():
    """A missing file gives an empty list"""
    assert load_bets("does_not_exist.json") == []

def test_overwrites():
    """Saving again replaces the old contents"""
    save_bets([{"a": 1}], "bets_test2.json")
    save_bets([{"b": 2}], "bets_test2.json")
    assert load_bets("bets_test2.json") == [{"b": 2}]

@@hint
`json.dump(data, f)` writes; `json.load(f)` reads. Open with `"w"` to write.

@@hint
Catch `FileNotFoundError` in `load_bets`.
:::

:::quiz files-quiz Quick check
? Why use `with open(...) as f:`?
- [x] It closes the file automatically, even if an error happens
- [ ] It's the only way to read a file
- [ ] It makes reading faster
> Forgetting to close files can lose data or leak resources. `with` handles it for you.

? What type is `row["FTHG"]` when read with `csv.DictReader`?
- [ ] int
- [x] str
- [ ] float
> The csv module gives you text. Convert it with `int()` or `float()`.

? What does opening a file with mode `"w"` do if the file already exists?
- [ ] Adds to the end
- [x] Erases it and starts fresh
- [ ] Raises an error
> Use `"a"` to append.

? Why call `random.seed(42)` in an experiment?
- [ ] To make the numbers more random
- [x] To make the "random" results the same every run, so experiments are reproducible
- [ ] Because 42 gives the best results
> Reproducibility matters a lot in ML: you want to know a change in results came from your change, not from luck.
:::

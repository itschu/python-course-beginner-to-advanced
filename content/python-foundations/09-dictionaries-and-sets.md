---
title: Dictionaries and sets
summary: Look things up by name with dictionaries, count and group data, and find unique values with sets.
minutes: 50
kind: lesson
---

Lists find items by **position**. Often you want to find things by **name** instead: the odds for a given bookmaker, the points for a given team, the settings for a given model. That's what dictionaries are for.

## Dictionaries

A **dictionary** (`dict`) maps **keys** to **values**:

```python
points = {"Ashford City": 78, "Bramley Rovers": 71, "Castleton United": 65}

print(points["Bramley Rovers"])     # look up by key
points["Dunmore Athletic"] = 60     # add a new key
points["Ashford City"] += 3         # update an existing value
print(points)
print(len(points))
print("Fairhaven FC" in points)     # `in` checks the keys
```

- Keys must be unique and immutable: strings, numbers and tuples are fine; lists aren't.
- Values can be anything, including lists and other dictionaries.
- Looking up a key is very fast, even with millions of keys.

Looking up a missing key raises a `KeyError`:

```python expect-error
points = {"Ashford City": 78}
print(points["Fairhaven FC"])
```

Use `.get()` to supply a default instead:

```python
points = {"Ashford City": 78}
print(points.get("Fairhaven FC"))        # None
print(points.get("Fairhaven FC", 0))     # 0
```

## Looping over a dictionary

```python
odds = {"home": 2.10, "draw": 3.40, "away": 3.60}

for outcome in odds:                   # loops over keys
    print(outcome)

for outcome, price in odds.items():    # keys and values together
    print(f"{outcome:>5}: {price:.2f}")

print(list(odds.keys()))
print(list(odds.values()))
print(sum(1 / p for p in odds.values()))   # total implied probability
```

Dictionaries remember the order in which keys were added.

## Removing items

```python
settings = {"learning_rate": 0.1, "epochs": 20, "debug": True}
del settings["debug"]
epochs = settings.pop("epochs")     # remove and return
print(epochs, settings)
```

## Counting with a dictionary

Counting how often things occur is one of the most common jobs in data analysis:

```python
results = ["H", "A", "H", "D", "H", "A", "H"]

counts = {}
for r in results:
    counts[r] = counts.get(r, 0) + 1
print(counts)
```

`counts.get(r, 0)` means "the current count, or 0 if we haven't seen this one yet". The standard library has a ready-made tool for this, `collections.Counter`:

```python
from collections import Counter

results = ["H", "A", "H", "D", "H", "A", "H"]
c = Counter(results)
print(c)
print(c.most_common(1))
```

## Grouping

Collecting items into groups is the other classic pattern:

```python
matches = [
    ("Ashford City", 2), ("Bramley Rovers", 1), ("Ashford City", 0),
    ("Bramley Rovers", 3), ("Ashford City", 4),
]

goals_by_team = {}
for team, goals in matches:
    if team not in goals_by_team:
        goals_by_team[team] = []
    goals_by_team[team].append(goals)

print(goals_by_team)
for team, goals in goals_by_team.items():
    print(f"{team}: average {sum(goals) / len(goals):.2f}")
```

When you meet pandas, this is `groupby`. Knowing how it works by hand makes pandas much less magical.

## Nested data

Real data (especially JSON from web APIs) is often dictionaries inside lists inside dictionaries:

```python
match = {
    "home": "Ashford City",
    "away": "Bramley Rovers",
    "score": {"home": 2, "away": 1},
    "odds": [
        {"bookmaker": "A", "home": 2.10},
        {"bookmaker": "B", "home": 2.25},
    ],
}

print(match["score"]["home"])
print(match["odds"][1]["bookmaker"])
best = max(match["odds"], key=lambda o: o["home"])   # more on this next lesson
print(best)
```

## Sets

A **set** is an unordered collection of **unique** values:

```python
teams_played = ["Ashford City", "Bramley Rovers", "Ashford City", "Castleton United", "Bramley Rovers"]
unique = set(teams_played)
print(unique)
print(len(unique))
print("Ashford City" in unique)
```

Sets support maths-style operations:

```python
season_1 = {"Ashford City", "Bramley Rovers", "Castleton United"}
season_2 = {"Bramley Rovers", "Castleton United", "Dunmore Athletic"}

print(season_1 & season_2)   # in both (intersection)
print(season_1 | season_2)   # in either (union)
print(season_1 - season_2)   # relegated: in season 1 but not 2
print(season_2 - season_1)   # promoted
```

Checking `x in some_set` is very fast, much faster than `x in some_list` for big collections.

## Which collection should I use?

| Need | Use |
| --- | --- |
| An ordered collection that changes | `list` |
| A fixed group of values | `tuple` |
| Look up values by a key | `dict` |
| Unique values, fast membership tests | `set` |

## Practice

:::exercise word-count Word frequency
Complete `word_counts(text)`. Return a dictionary mapping each word to how many times it appears. Ignore case and split on whitespace.

`word_counts("the cat and The hat")` returns `{"the": 2, "cat": 1, "and": 1, "hat": 1}`.

@@starter
def word_counts(text):
    counts = {}
    return counts

@@solution
def word_counts(text):
    counts = {}
    for word in text.lower().split():
        counts[word] = counts.get(word, 0) + 1
    return counts

@@tests
def test_example():
    """Counts words, ignoring case"""
    assert word_counts("the cat and The hat") == {"the": 2, "cat": 1, "and": 1, "hat": 1}

def test_empty():
    """Empty text gives an empty dict"""
    assert word_counts("") == {}

def test_spaces():
    """Extra spaces don't create empty words"""
    assert word_counts("  great   great  ") == {"great": 2}

@@hint
`text.lower().split()` gives you a list of lowercase words. Then use the `counts.get(word, 0) + 1` pattern.
:::

:::exercise league-table League points
Each match is a tuple `(home_team, away_team, home_goals, away_goals)`. A win is worth 3 points, a draw 1 each, and a loss 0.

Complete `league_points(matches)` to return a dictionary of points for every team that played, including teams with 0 points.

@@starter
def league_points(matches):
    points = {}
    for home, away, hg, ag in matches:
        pass
    return points

@@solution
def league_points(matches):
    points = {}
    for home, away, hg, ag in matches:
        points.setdefault(home, 0)
        points.setdefault(away, 0)
        if hg > ag:
            points[home] += 3
        elif hg < ag:
            points[away] += 3
        else:
            points[home] += 1
            points[away] += 1
    return points

@@tests
def test_small_league():
    """Calculates points for three matches"""
    matches = [
        ("Ashford", "Bramley", 2, 1),
        ("Bramley", "Castleton", 1, 1),
        ("Castleton", "Ashford", 0, 3),
    ]
    assert league_points(matches) == {"Ashford": 6, "Bramley": 1, "Castleton": 1}, f"got {league_points(matches)}"

def test_zero_points():
    """A team that lost everything still appears with 0"""
    assert league_points([("A", "B", 5, 0)]) == {"A": 3, "B": 0}

def test_empty():
    """No matches, no teams"""
    assert league_points([]) == {}

@@hint
Make sure both teams are in the dictionary before adding points: `points.setdefault(team, 0)` adds a key with 0 only if it's missing. Or use `points[home] = points.get(home, 0) + 3`.
:::

:::exercise promoted Promoted and relegated
Complete `changes(last_season, this_season)`. Both arguments are lists of team names. Return a tuple `(promoted, relegated)` of **sorted lists**:

- `promoted`: teams in this season but not last season,
- `relegated`: teams in last season but not this season.

@@starter
def changes(last_season, this_season):
    return ([], [])

@@solution
def changes(last_season, this_season):
    last, this = set(last_season), set(this_season)
    return (sorted(this - last), sorted(last - this))

@@tests
def test_example():
    """Finds promoted and relegated teams"""
    last = ["Ashford", "Bramley", "Castleton", "Dunmore"]
    this = ["Bramley", "Castleton", "Eastbrook", "Fairhaven"]
    assert changes(last, this) == (["Eastbrook", "Fairhaven"], ["Ashford", "Dunmore"])

def test_no_changes():
    """Same teams: nothing changes"""
    assert changes(["A", "B"], ["B", "A"]) == ([], [])

@@hint
Turn both lists into sets and use `-` (difference). Then `sorted()` turns each set back into a sorted list.
:::

:::quiz dicts-quiz Quick check
? What does `{"a": 1, "b": 2}.get("c", 0)` return?
- [ ] None
- [x] 0
- [ ] A KeyError
> `.get` returns the default when the key is missing.

? Which can be a dictionary key?
- [x] `"Ashford City"`
- [x] `(2024, 8)`
- [ ] `["a", "b"]`
- [x] `42`
> Keys must be immutable. Lists can change, so they can't be keys.

? What is `len(set([1, 1, 2, 3, 3, 3]))`?
- [ ] 6
- [x] 3
> A set keeps only unique values: {1, 2, 3}.

? You need to check whether each of 1,000,000 IDs has been seen before. What's the best collection to hold the IDs you've seen?
- [ ] list
- [x] set
- [ ] tuple
> Membership tests on a set are fast no matter how big it gets; on a list Python has to check every item.
:::

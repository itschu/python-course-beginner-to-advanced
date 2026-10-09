---
title: Loops
summary: Repeat work with for and while loops, and learn the patterns behind almost every data task.
minutes: 55
kind: lesson
---

Computers are good at doing the same thing many times without getting bored. Loops are how you tell them to.

## for loops

A `for` loop runs its block once for each item in a sequence:

```python
teams = ["Ashford City", "Bramley Rovers", "Castleton United"]
for team in teams:
    print(f"Fixtures loaded for {team}")
print("Done")
```

Each time round, the loop variable (`team`) refers to the next item. The indented block is the **loop body**. The unindented line runs once, after the loop finishes.

You can loop over any sequence, including strings:

```python
for letter in "odds":
    print(letter)
```

## range()

`range` produces a sequence of numbers, which is perfect for "do this n times":

```python
for i in range(5):           # 0, 1, 2, 3, 4
    print(i, end=" ")
print()
for i in range(1, 6):        # 1 to 5
    print(i, end=" ")
print()
for i in range(0, 20, 5):    # step of 5
    print(i, end=" ")
```

Like slicing, `range(start, stop)` stops *before* `stop`.

## The accumulator pattern

The most important loop pattern: start with an empty result, then update it on every pass.

```python
goals = [2, 0, 3, 1, 1, 4, 0]

total = 0
for g in goals:
    total += g
print("Total:", total)

high_scoring = 0
for g in goals:
    if g >= 3:
        high_scoring += 1
print("Games with 3+ goals:", high_scoring)

doubled = []
for g in goals:
    doubled.append(g * 2)
print(doubled)
```

Summing, counting, filtering and transforming are behind a huge share of all data processing. Later, pandas will do them for you on whole columns at once, but it's important to understand what happens underneath.

## Finding the best item

```python
odds = {"Bookie A": 2.10, "Bookie B": 2.25, "Bookie C": 2.18}

best_name = None
best_price = 0
for name in ["Bookie A", "Bookie B", "Bookie C"]:
    price = odds[name]
    if price > best_price:
        best_price = price
        best_name = name
print(f"Best price: {best_price} at {best_name}")
```

(That used a *dictionary*, `odds[name]`. Dictionaries are the next lesson.)

## enumerate and zip

`enumerate` gives you the position and the item together:

```python
teams = ["Ashford City", "Bramley Rovers", "Castleton United"]
for position, team in enumerate(teams, start=1):
    print(position, team)
```

`zip` walks through several lists side by side:

```python
home = ["Ashford City", "Dunmore Athletic"]
away = ["Bramley Rovers", "Eastbrook Town"]
scores = [(2, 1), (0, 0)]

for h, a, (hg, ag) in zip(home, away, scores):
    print(f"{h} {hg}-{ag} {a}")
```

## while loops

A `while` loop repeats as long as a condition is true. Use it when you don't know in advance how many repetitions you need:

```python
bankroll = 100
bets = 0
while bankroll > 50:
    bankroll -= 7      # lose £7 on each bet
    bets += 1
print(f"Bankroll fell to £{bankroll} after {bets} bets")
```

If the condition never becomes false, the loop runs forever. In this course's runner, the **Stop** button (or a 60-second timeout) rescues you.

## break and continue

- `break` leaves the loop immediately.
- `continue` skips the rest of this pass and moves to the next item.

```python
results = ["W", "W", "D", "W", "L", "W"]

streak = 0
for r in results:
    if r != "W":
        break
    streak += 1
print("Winning streak at the start:", streak)

for r in results:
    if r == "D":
        continue
    print(r, end=" ")
```

## Nested loops

A loop inside a loop runs the inner loop completely for each pass of the outer one:

```python
teams = ["A", "B", "C"]
for home in teams:
    for away in teams:
        if home != away:
            print(f"{home} v {away}", end="   ")
    print()
```

With 20 teams that produces all 380 fixtures of a league season. Be careful: nested loops multiply the work. With big data, they get slow fast.

## Practice

:::exercise count-results Count results
Complete `count_results(results)`. It receives a list of `"H"`, `"D"` and `"A"` strings and returns a tuple `(home_wins, draws, away_wins)`.

Use a loop (don't use the `.count()` method, for practice).

@@starter
def count_results(results):
    home_wins = 0
    draws = 0
    away_wins = 0
    # loop here
    return (home_wins, draws, away_wins)

@@solution
def count_results(results):
    home_wins = 0
    draws = 0
    away_wins = 0
    for r in results:
        if r == "H":
            home_wins += 1
        elif r == "D":
            draws += 1
        elif r == "A":
            away_wins += 1
    return (home_wins, draws, away_wins)

@@tests
def test_example():
    """Counts a mix of results"""
    assert count_results(["H", "A", "H", "D", "H", "A"]) == (3, 1, 2)

def test_empty():
    """An empty list gives (0, 0, 0)"""
    assert count_results([]) == (0, 0, 0)

def test_all_draws():
    """All draws"""
    assert count_results(["D", "D"]) == (0, 2, 0)

def test_uses_loop():
    """Uses a loop rather than .count()"""
    assert "for " in source or "while " in source, "Use a for loop"
    assert ".count(" not in source, "Try it with a loop instead of .count()"

@@hint
Loop over `results` and use `if`/`elif` to decide which counter to increase with `+= 1`.
:::

:::exercise running-total Running bankroll
Complete `bankroll_history(start, profits)`. It returns a list showing the bankroll after each bet, starting with the starting amount.

For example `bankroll_history(100, [10, -5, -20])` returns `[100, 110, 105, 85]`.

@@starter
def bankroll_history(start, profits):
    history = []
    return history

@@solution
def bankroll_history(start, profits):
    history = [start]
    current = start
    for p in profits:
        current += p
        history.append(current)
    return history

@@tests
def test_example():
    """Tracks the bankroll after each bet"""
    assert bankroll_history(100, [10, -5, -20]) == [100, 110, 105, 85], f"got {bankroll_history(100, [10, -5, -20])}"

def test_no_bets():
    """No bets: just the starting amount"""
    assert bankroll_history(50, []) == [50]

def test_length():
    """One entry per bet, plus the start"""
    assert len(bankroll_history(0, [1] * 10)) == 11

@@hint
Start the list with the starting amount. Keep a `current` variable, add each profit, and append it.
:::

:::exercise longest-streak Longest winning streak
Complete `longest_streak(results)`. Given a list like `["W", "W", "L", "W", "W", "W", "D"]`, return the length of the longest run of consecutive `"W"`s (here, 3).

@@starter
def longest_streak(results):
    return 0

@@solution
def longest_streak(results):
    best = 0
    current = 0
    for r in results:
        if r == "W":
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best

@@tests
def test_example():
    """Finds the run of 3"""
    assert longest_streak(["W", "W", "L", "W", "W", "W", "D"]) == 3

def test_streak_at_end():
    """A streak at the very end counts"""
    assert longest_streak(["L", "W", "W", "W", "W"]) == 4

def test_no_wins():
    """No wins gives 0"""
    assert longest_streak(["L", "D", "L"]) == 0
    assert longest_streak([]) == 0

def test_all_wins():
    """All wins"""
    assert longest_streak(["W"] * 6) == 6

@@hint
Keep two counters: `current` (the streak you're in now) and `best` (the longest seen so far). Reset `current` to 0 when the streak breaks.
:::

:::exercise until-broke Simulate until broke
A gambler starts with `bankroll` pounds and bets `stake` pounds each time. The results of their bets are given as a list of `True` (won) and `False` (lost) values. A win adds `stake * (odds - 1)`; a loss subtracts `stake`.

Complete `bets_until_broke(bankroll, stake, odds, results)`. Return how many bets were placed before the bankroll became **too small to place another bet** (less than `stake`). If they never run out, return the total number of results.

Use a `while` loop or a `for` loop with `break`.

@@starter
def bets_until_broke(bankroll, stake, odds, results):
    count = 0
    return count

@@solution
def bets_until_broke(bankroll, stake, odds, results):
    count = 0
    for won in results:
        if bankroll < stake:
            break
        if won:
            bankroll += stake * (odds - 1)
        else:
            bankroll -= stake
        count += 1
    return count

@@tests
def test_goes_broke():
    """Loses everything after 3 losing bets"""
    assert bets_until_broke(30, 10, 2.0, [False, False, False, False, True]) == 3

def test_wins_extend_play():
    """A win in the middle keeps them going"""
    assert bets_until_broke(20, 10, 2.0, [False, True, False, False, False]) == 4

def test_never_broke():
    """Never runs out: every result is used"""
    assert bets_until_broke(100, 10, 2.0, [True, False, True]) == 3

def test_cannot_start():
    """Can't afford a single bet"""
    assert bets_until_broke(5, 10, 2.0, [True, True]) == 0

@@hint
At the start of each pass, check whether the bankroll is below the stake and `break` if so. Otherwise settle the bet and add one to the count.
:::

:::quiz loops-quiz Quick check
? How many times does `for i in range(2, 10, 3):` run its body?
- [ ] 8
- [x] 3
- [ ] 2
> It produces 2, 5 and 8.

? What does `break` do?
- [ ] Skips to the next item
- [x] Exits the loop immediately
- [ ] Stops the whole program
> `continue` skips to the next item; `break` leaves the loop.

? What does this print?
```python
total = 0
for n in [1, 2, 3]:
    total = n
print(total)
```
- [ ] 6
- [x] 3
- [ ] 0
> `total = n` replaces the value each time. To add, you'd need `total += n`.

? What do you get from `list(enumerate(["a", "b"]))`?
- [x] `[(0, "a"), (1, "b")]`
- [ ] `[("a", 0), ("b", 1)]`
- [ ] `["a", "b"]`
> `enumerate` pairs each item with its index, starting at 0 by default.
:::

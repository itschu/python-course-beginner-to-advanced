---
title: Iterators, generators and itertools
summary: Process data lazily, one item at a time, so your programs handle files and streams far bigger than memory.
minutes: 50
kind: lesson
---

Real datasets can be gigabytes. Loading everything into a list at once can run out of memory. **Generators** produce values one at a time, only when asked, which is called **lazy evaluation**.

## How for loops really work

A `for` loop asks an object for an **iterator** (with `iter()`), then repeatedly asks the iterator for the next value (with `next()`) until it raises `StopIteration`:

```python
results = ["H", "D", "A"]
it = iter(results)
print(next(it))
print(next(it))
print(next(it))
try:
    next(it)
except StopIteration:
    print("finished")
```

Lists, strings, dicts, files and `range` are all **iterable**.

## Generator functions

A function containing `yield` is a **generator function**. Calling it doesn't run the body. Instead it returns a generator that runs the body step by step, pausing at each `yield`:

```python
def countdown(n):
    print("starting")
    while n > 0:
        yield n
        n -= 1
    print("done")

gen = countdown(3)
print(gen)                 # nothing has run yet
for value in gen:
    print(value)
```

Generators remember where they paused, including the values of their local variables. And they only ever hold one value at a time.

```python
def running_total(values):
    total = 0
    for v in values:
        total += v
        yield total

print(list(running_total([10, -5, 20, -15])))
```

## Infinite sequences

Because generators are lazy, they can even be infinite. You just stop asking:

```python
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

for i, f in enumerate(fibonacci()):
    if i >= 10:
        break
    print(f, end=" ")
```

## Generator pipelines

Chaining generators builds a processing pipeline that streams data through, using almost no memory however big the input is:

```python
def read_rows(path):
    with open(path) as f:
        header = next(f).strip().split(",")
        for line in f:
            yield dict(zip(header, line.strip().split(",")))

def high_scoring(rows, min_goals):
    for row in rows:
        if int(row["FTHG"]) + int(row["FTAG"]) >= min_goals:
            yield row

def describe(rows):
    for row in rows:
        yield f"{row['Date']}: {row['HomeTeam']} {row['FTHG']}-{row['FTAG']} {row['AwayTeam']}"

pipeline = describe(high_scoring(read_rows("data/matches.csv"), min_goals=8))
for line in pipeline:
    print(line)
```

Nothing is read until the final loop asks for a value; then each row flows through all three stages before the next row is read. This is the same idea behind streaming tools for big data.

## Generator expressions

You met these briefly in Phase 1: comprehension syntax with parentheses creates a generator:

```python
squares_list = [n * n for n in range(1_000_000)]     # builds a million-item list
squares_gen = (n * n for n in range(1_000_000))      # builds nothing yet

import sys
print(sys.getsizeof(squares_list), "bytes vs", sys.getsizeof(squares_gen), "bytes")
print(sum(squares_gen))
```

A generator can only be used **once**. After it's exhausted, it's empty:

```python
gen = (x for x in [1, 2, 3])
print(sum(gen))
print(sum(gen))   # 0: already used up
```

## itertools

The `itertools` module is a toolkit of fast iterator building blocks:

```python
import itertools

print(list(itertools.islice(itertools.count(10, 5), 4)))       # take 4 from an infinite count
print(list(itertools.accumulate([10, -5, 20, -15])))           # running totals
print(list(itertools.combinations(["A", "B", "C"], 2)))         # unordered pairs
print(list(itertools.permutations(["A", "B", "C"], 2)))         # ordered pairs: home and away fixtures!
print(list(itertools.product(["H", "D", "A"], repeat=2)))       # every result of 2 matches
print(list(itertools.chain([1, 2], [3], [4, 5])))               # join iterables

results = "WWLDDDWLLL"
for key, group in itertools.groupby(results):                  # consecutive runs
    print(key, len(list(group)), end="  ")
print()

for a, b in itertools.pairwise([1500, 1512, 1498, 1520]):      # neighbouring pairs
    print(b - a, end=" ")
```

`product(["H", "D", "A"], repeat=13)` would list all 1,594,323 ways a 13-match football pools coupon could come out, lazily.

## Writing your own iterable class

If a class defines `__iter__` as a generator, its instances work in `for` loops:

```python
class Fixtures:
    def __init__(self, teams):
        self.teams = teams

    def __iter__(self):
        for home in self.teams:
            for away in self.teams:
                if home != away:
                    yield home, away

print(len(list(Fixtures(["A", "B", "C", "D"]))), "fixtures")
for match in Fixtures(["A", "B", "C"]):
    print(match)
```

## Practice

:::exercise batches Batch a stream
Write a generator `batched(items, size)` that yields lists of up to `size` items at a time. The last batch can be smaller.

`list(batched(range(7), 3))` gives `[[0, 1, 2], [3, 4, 5], [6]]`.

This is how ML training loops feed data to a model in mini-batches.

@@starter
def batched(items, size):
    pass

@@solution
def batched(items, size):
    batch = []
    for item in items:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch

@@tests
import inspect

def test_example():
    """Splits 7 items into batches of 3"""
    assert list(batched(range(7), 3)) == [[0, 1, 2], [3, 4, 5], [6]]

def test_exact():
    """An exact multiple has no partial batch"""
    assert list(batched("abcd", 2)) == [["a", "b"], ["c", "d"]]

def test_empty():
    """No items, no batches"""
    assert list(batched([], 5)) == []

def test_is_generator():
    """Is a generator (uses yield)"""
    assert inspect.isgeneratorfunction(batched), "use yield to make batched a generator"

def test_lazy():
    """Works on an infinite stream without hanging"""
    import itertools
    first = next(batched(itertools.count(), 4))
    assert first == [0, 1, 2, 3]

@@hint
Collect items into a list. Each time it reaches `size`, `yield` it and start a new list. After the loop, yield any leftovers.
:::

:::exercise moving-average Moving average generator
Write a generator `moving_average(values, window)` that yields the average of the last `window` values, starting once `window` values have been seen. Round each average to 2 decimals.

`list(moving_average([1, 2, 3, 4, 5], 3))` gives `[2.0, 3.0, 4.0]`.

Rolling averages like this are one of the most common features in time-series ML.

@@starter
from collections import deque

def moving_average(values, window):
    pass

@@solution
from collections import deque

def moving_average(values, window):
    recent = deque(maxlen=window)
    for v in values:
        recent.append(v)
        if len(recent) == window:
            yield round(sum(recent) / window, 2)

@@tests
import inspect

def test_example():
    """Window of 3"""
    assert list(moving_average([1, 2, 3, 4, 5], 3)) == [2.0, 3.0, 4.0]

def test_window_one():
    """A window of 1 returns the values"""
    assert list(moving_average([4, 8], 1)) == [4.0, 8.0]

def test_too_short():
    """Fewer values than the window gives nothing"""
    assert list(moving_average([1, 2], 3)) == []

def test_rounding():
    """Rounds to 2 decimals"""
    assert list(moving_average([1, 1, 2], 3)) == [1.33]

def test_generator():
    """Is a generator"""
    assert inspect.isgeneratorfunction(moving_average)

@@hint
A `deque(maxlen=window)` automatically drops the oldest item when a new one is appended.
:::

:::exercise unique-pairs All fixtures
Using `itertools`, write `fixtures(teams)` that returns a list of every `(home, away)` pairing where a team plays every other team once at home and once away, in the order `itertools.permutations` produces them.

@@starter
import itertools

def fixtures(teams):
    return []

@@solution
import itertools

def fixtures(teams):
    return list(itertools.permutations(teams, 2))

@@tests
def test_three_teams():
    """Three teams play six matches"""
    assert fixtures(["A", "B", "C"]) == [("A", "B"), ("A", "C"), ("B", "A"), ("B", "C"), ("C", "A"), ("C", "B")]

def test_league():
    """20 teams play 380 matches"""
    assert len(fixtures([f"T{i}" for i in range(20)])) == 380
:::

:::quiz generators-quiz Quick check
? What does calling a generator function return?
- [ ] The first yielded value
- [x] A generator object; the body hasn't started running yet
- [ ] A list of all values
> The body runs a step at a time as you ask for values.

? What's the main advantage of a generator over building a list?
- [x] It produces values on demand, using very little memory
- [ ] It's always faster for small data
- [ ] It can be reused many times
> Generators can only be consumed once.

? What is `sum(x for x in range(4))`?
- [x] 6
- [ ] 10
- [ ] A generator
> 0 + 1 + 2 + 3.

? Which `itertools` function gives every ordered (home, away) pairing of teams?
- [ ] combinations
- [x] permutations
- [ ] product
> `combinations` ignores order; `product` would include a team playing itself.
:::

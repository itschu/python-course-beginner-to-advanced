---
title: Lists and tuples
summary: Store collections of values, change them, sort them, and avoid the classic aliasing bug.
minutes: 50
kind: lesson
---

One value per variable doesn't get you far. A season has 380 matches; a dataset has thousands of rows. **Lists** hold many values in order.

## Creating lists

```python
goals = [2, 0, 3, 1, 1]
teams = ["Ashford City", "Bramley Rovers", "Castleton United"]
mixed = [1, "two", 3.0, True]   # allowed, but usually a list holds one kind of thing
empty = []

print(goals)
print(len(teams))
print(type(goals))
```

## Indexing and slicing

Lists use exactly the same indexing and slicing as strings:

```python
goals = [2, 0, 3, 1, 1]
print(goals[0])      # first
print(goals[-1])     # last
print(goals[1:3])    # a new list with items 1 and 2
print(goals[::-1])   # reversed copy
print(3 in goals)    # membership test
```

## Lists are mutable

Unlike strings, lists can be changed in place:

```python
scores = [10, 20, 30]
scores[0] = 15            # replace an item
scores.append(40)         # add to the end
scores.insert(1, 12)      # insert at index 1
print(scores)

last = scores.pop()       # remove and return the last item
print(last, scores)
scores.remove(20)         # remove the first item equal to 20
print(scores)
del scores[0]             # delete by index
print(scores)
scores.extend([50, 60])   # add several items
print(scores)
```

## Useful functions and methods

```python
goals = [2, 0, 3, 1, 1, 4]

print(sum(goals), min(goals), max(goals))
print(sum(goals) / len(goals))   # the average
print(goals.count(1))            # how many 1s
print(goals.index(3))            # position of the first 3

print(sorted(goals))                 # new sorted list; goals is unchanged
print(sorted(goals, reverse=True))
goals.sort()                         # sorts goals itself, returns None
print(goals)
```

`sorted(x)` returns a new list. `x.sort()` changes `x` and returns `None`. A common bug is `goals = goals.sort()`, which sets `goals` to `None`.

## Lists of lists

A list can contain other lists. This is a natural way to store a small table, where each inner list is a row:

```python
table = [
    ["Ashford City", 24, 78],
    ["Bramley Rovers", 21, 71],
    ["Castleton United", 19, 65],
]
print(table[1])        # second row
print(table[1][0])     # first item of the second row
print(table[2][2])     # points of the third team
```

In Phase 3 you'll use pandas DataFrames for tables, which are far more powerful, but they build on exactly this idea.

## Tuples: lists that can't change

A **tuple** is like a list, but **immutable**. Write it with parentheses (or just commas):

```python
score = (2, 1)
point = 3.5, -1.2          # parentheses are optional
print(score[0], score[1])
print(type(point))
```

```python expect-error
score = (2, 1)
score[0] = 3
```

Use a tuple for a fixed group of related values that belong together, like coordinates, an `(x, y)` pair, or a match score. Use a list for a collection that grows or changes.

### Unpacking

You can unpack any sequence into separate variables. You've already done this with functions that return several values:

```python
score = (2, 1)
home, away = score
print(home, away)

first, *rest = [10, 20, 30, 40]   # * collects "the rest" into a list
print(first, rest)

a, b = 1, 2
a, b = b, a                        # swap two variables in one line
print(a, b)
```

## The aliasing trap

Assignment never copies a list. It gives the **same** list another name:

```python
original = [1, 2, 3]
alias = original
alias.append(4)
print(original)   # changed too! Both names point to one list
```

To get an independent copy, use `.copy()` (or `list(original)` or `original[:]`):

```python
original = [1, 2, 3]
copy = original.copy()
copy.append(4)
print(original, copy)
```

The same applies to function arguments: if a function changes a list that's passed in, the caller's list changes. That's why the previous lesson warned against `def f(items=[])`: the single default list is shared by every call.

:::tip Mental model
Think of variables as **labels** stuck on values, not boxes containing them. `alias = original` sticks a second label on the same list.
:::

## Practice

:::exercise average-goals Goals statistics
Complete `goal_stats(goals)`. Given a list of goal counts, return a tuple `(total, average, highest)`, with the average rounded to 2 decimal places.

If the list is empty, return `(0, 0.0, 0)`.

@@starter
def goal_stats(goals):
    return (0, 0.0, 0)

@@solution
def goal_stats(goals):
    if not goals:
        return (0, 0.0, 0)
    total = sum(goals)
    return (total, round(total / len(goals), 2), max(goals))

@@tests
def test_example():
    """[2, 0, 3, 1, 1] gives (7, 1.4, 3)"""
    assert goal_stats([2, 0, 3, 1, 1]) == (7, 1.4, 3), f"got {goal_stats([2, 0, 3, 1, 1])}"

def test_rounding():
    """The average is rounded to 2 decimals"""
    assert goal_stats([1, 1, 2]) == (4, 1.33, 2), f"got {goal_stats([1, 1, 2])}"

def test_single():
    """A single match"""
    assert goal_stats([5]) == (5, 5.0, 5)

def test_empty():
    """An empty list doesn't crash"""
    assert goal_stats([]) == (0, 0.0, 0)

@@hint
`sum`, `len` and `max` do the work. Check for an empty list first, because `max([])` is an error and so is dividing by zero.
:::

:::exercise top-three Top three
Complete `top_three(scores)` so it returns a **new** list with the three highest scores, highest first. It must not change the list passed in.

If there are fewer than three scores, return them all, highest first.

@@starter
def top_three(scores):
    scores.sort()
    return scores

@@solution
def top_three(scores):
    return sorted(scores, reverse=True)[:3]

@@tests
def test_example():
    """Returns the three highest, highest first"""
    assert top_three([55, 92, 71, 88, 60]) == [92, 88, 71], f"got {top_three([55, 92, 71, 88, 60])}"

def test_short_list():
    """Works with fewer than three scores"""
    assert top_three([3, 9]) == [9, 3]
    assert top_three([]) == []

def test_does_not_modify():
    """Leaves the original list unchanged"""
    data = [5, 1, 4, 2, 3]
    top_three(data)
    assert data == [5, 1, 4, 2, 3], f"the input list was changed to {data}"

@@hint
`sorted(..., reverse=True)` returns a new list. Then slice the first three items.
:::

:::exercise rotate Rotate a fixture list
Complete `rotate(items, n)` so it moves the first `n` items to the end and returns a new list. For example `rotate(["A", "B", "C", "D"], 1)` returns `["B", "C", "D", "A"]`.

If `n` is bigger than the list length, it should wrap around, so rotating a 4-item list by 5 is the same as rotating by 1. An empty list returns an empty list.

@@starter
def rotate(items, n):
    return items

@@solution
def rotate(items, n):
    if not items:
        return []
    n = n % len(items)
    return items[n:] + items[:n]

@@tests
def test_rotate_one():
    """Rotating by 1 moves the first item to the end"""
    assert rotate(["A", "B", "C", "D"], 1) == ["B", "C", "D", "A"]

def test_rotate_two():
    """Rotating by 2"""
    assert rotate([1, 2, 3, 4, 5], 2) == [3, 4, 5, 1, 2]

def test_wraps():
    """Rotating by more than the length wraps around"""
    assert rotate(["A", "B", "C", "D"], 5) == ["B", "C", "D", "A"]
    assert rotate(["A", "B"], 2) == ["A", "B"]

def test_empty():
    """An empty list stays empty"""
    assert rotate([], 3) == []

@@hint
Slices: `items[n:]` is everything from `n` on, and `items[:n]` is everything before it. Lists can be joined with `+`.

@@hint
`n % len(items)` handles the wrap-around.
:::

:::quiz lists-quiz Quick check
? After `a = [1, 2, 3]` and `b = a` and `b.append(4)`, what is `a`?
- [ ] `[1, 2, 3]`
- [x] `[1, 2, 3, 4]`
> `b = a` doesn't copy; both names refer to the same list.

? What does `x = [3, 1, 2].sort()` set `x` to?
- [ ] `[1, 2, 3]`
- [x] `None`
> `.sort()` sorts in place and returns `None`. Use `sorted()` for a new list.

? When should you use a tuple instead of a list?
- [x] For a fixed group of values that shouldn't change, like a score `(2, 1)`
- [ ] When you need to append items
- [ ] When the collection is very large
> Tuples are immutable. Lists are for collections that change.

? What is `[10, 20, 30, 40][1:3]`?
- [ ] `[10, 20, 30]`
- [x] `[20, 30]`
- [ ] `[20, 30, 40]`
> From index 1 up to (not including) index 3.
:::

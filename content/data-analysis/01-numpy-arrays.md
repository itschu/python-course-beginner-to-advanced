---
title: NumPy arrays
summary: Meet the array, the data structure underneath pandas, scikit-learn and PyTorch. Create, index, slice and reshape arrays.
minutes: 50
kind: lesson
---

Python lists are flexible but slow for numbers. **NumPy** provides the `ndarray`: a fixed-type, multi-dimensional array stored in one compact block of memory, with operations written in C. Every data science library in Python is built on it, and PyTorch tensors are a close cousin.

By convention, NumPy is imported as `np`:

```python
import numpy as np

goals = np.array([2, 0, 3, 1, 1, 4])
print(goals)
print(type(goals), goals.dtype, goals.shape, goals.ndim)
```

- `dtype` is the type of every element (all elements share one type): here, 64-bit integers.
- `shape` is the size along each dimension: 6 elements in one dimension.

## Creating arrays

```python
import numpy as np

print(np.zeros(5))
print(np.ones((2, 3)))             # a shape is a tuple: 2 rows, 3 columns
print(np.full(4, 0.5))
print(np.arange(0, 10, 2))         # like range, but returns an array
print(np.linspace(0, 1, 5))        # 5 evenly spaced values from 0 to 1, inclusive
print(np.array([1.5, 2, 3]).dtype) # mixing ints and floats gives floats
```

`linspace` is great for plotting smooth curves; `arange` for integer steps.

## 2D arrays: rows and columns

A 2D array is a table of numbers, exactly how ML models see a dataset: one row per example, one column per feature.

```python
import numpy as np

# rows: matches; columns: home goals, away goals, home shots
X = np.array([
    [2, 1, 14],
    [0, 0, 9],
    [3, 3, 17],
    [1, 2, 11],
])
print(X.shape)        # (rows, columns)
print(X[0])           # first row
print(X[0, 2])        # row 0, column 2
print(X[:, 0])        # every row, column 0: all home goals
print(X[1:3, :2])     # rows 1-2, columns 0-1
print(X.T)            # transpose: swap rows and columns
```

The `[row, column]` syntax with slices on each axis is the key thing to learn here. `:` means "everything along this axis".

## Boolean masks

Comparing an array with a value gives an array of `True`/`False`, called a **mask**. Indexing with a mask keeps only the `True` positions:

```python
import numpy as np

odds = np.array([1.8, 2.5, 3.4, 1.4, 6.0, 2.1])
mask = odds > 2
print(mask)
print(odds[mask])                      # just the values over 2
print(odds[(odds > 2) & (odds < 4)])   # combine with & (and), | (or), ~ (not)
print(mask.sum(), mask.mean())         # True counts as 1: how many, and what fraction
```

Use `&`, `|` and `~` (not `and`, `or`, `not`) with arrays, and put each comparison in parentheses.

Masks work on 2D arrays too, which is how you filter rows:

```python
import numpy as np

X = np.array([[2, 1, 14], [0, 0, 9], [3, 3, 17], [1, 2, 11]])
high_scoring = X[:, 0] + X[:, 1] >= 3      # one True/False per row
print(X[high_scoring])
```

## Fancy indexing

Index with a list (or array) of positions to pick several elements at once:

```python
import numpy as np

teams = np.array(["Ashford", "Bramley", "Castleton", "Dunmore"])
points = np.array([65, 78, 71, 59])

order = np.argsort(points)[::-1]     # positions that sort points, reversed: highest first
print(order)
print(teams[order])
print(points[order])
```

`argsort` returns the *positions* that would sort an array, which lets you sort one array by the values of another.

## Changing shape

```python
import numpy as np

a = np.arange(12)
print(a.reshape(3, 4))
print(a.reshape(4, -1))     # -1 means "work this dimension out for me"
print(a.reshape(3, 4).ravel())   # flatten back to 1D

b = np.array([1, 2, 3])
print(b[:, np.newaxis])     # turn a 1D array into a column (shape (3, 1))
print(np.vstack([b, b * 10]))    # stack as rows
print(np.column_stack([b, b * 10]))   # stack as columns
```

scikit-learn expects features as a 2D array of shape `(n_samples, n_features)`, so `reshape(-1, 1)` is something you'll type a lot when you have a single feature.

## Copies and views

Slicing a NumPy array returns a **view** onto the same data, not a copy. Changing the view changes the original:

```python
import numpy as np

a = np.arange(5)
view = a[1:4]
view[0] = 99
print(a)               # changed!

b = np.arange(5)
copy = b[1:4].copy()
copy[0] = 99
print(b)               # unchanged
```

Views make NumPy fast and memory-efficient. Use `.copy()` when you need independent data.

## Practice

:::exercise np-basics Array basics
Complete `describe(values)`. Given a list of numbers, convert it to a NumPy array and return a tuple `(shape, mean, maximum, count_above_mean)`:

- `shape`: the array's shape (a tuple)
- `mean`: the mean, rounded to 2 decimals, as a Python float
- `maximum`: the largest value
- `count_above_mean`: how many values are strictly greater than the mean, as an int

@@starter
import numpy as np

def describe(values):
    arr = np.array(values)
    return ((), 0.0, 0, 0)

@@solution
import numpy as np

def describe(values):
    arr = np.array(values)
    mean = arr.mean()
    return (arr.shape, round(float(mean), 2), arr.max(), int((arr > mean).sum()))

@@tests
def test_example():
    """Describes [2, 0, 3, 1, 1, 4]"""
    shape, mean, maximum, above = describe([2, 0, 3, 1, 1, 4])
    assert shape == (6,)
    assert mean == 1.83 and isinstance(mean, float)
    assert maximum == 4
    assert above == 3 and isinstance(above, int)

def test_floats():
    """Works with floats"""
    assert describe([1.5, 2.5]) == ((2,), 2.0, 2.5, 1)

@@hint
`arr.mean()`, `arr.max()` and `(arr > mean).sum()` do the work. Wrap with `float()` and `int()` to get plain Python numbers.
:::

:::exercise np-slicing Slice a table
`X` is a 2D array where each row is a match: `[home_goals, away_goals, home_shots, away_shots]`.

Complete the function so it returns a tuple of four arrays:

1. `home_goals`: the first column
2. `total_goals`: home goals plus away goals for each match
3. `shots`: the last two columns (a 2D array)
4. `home_wins`: only the **rows** where home goals are greater than away goals

@@starter
import numpy as np

def slice_matches(X):
    home_goals = X
    total_goals = X
    shots = X
    home_wins = X
    return home_goals, total_goals, shots, home_wins

@@solution
import numpy as np

def slice_matches(X):
    home_goals = X[:, 0]
    total_goals = X[:, 0] + X[:, 1]
    shots = X[:, 2:]
    home_wins = X[X[:, 0] > X[:, 1]]
    return home_goals, total_goals, shots, home_wins

@@tests
import numpy as np

X = np.array([[2, 1, 14, 8], [0, 0, 9, 9], [3, 4, 17, 12], [1, 0, 11, 6]])

def test_home_goals():
    """First column"""
    assert np.array_equal(slice_matches(X)[0], [2, 0, 3, 1])

def test_total():
    """Total goals per match"""
    assert np.array_equal(slice_matches(X)[1], [3, 0, 7, 1])

def test_shots():
    """The last two columns"""
    shots = slice_matches(X)[2]
    assert shots.shape == (4, 2) and np.array_equal(shots, X[:, 2:])

def test_home_wins():
    """Rows where the home team won"""
    assert np.array_equal(slice_matches(X)[3], [[2, 1, 14, 8], [1, 0, 11, 6]])

@@hint
`X[:, 0]` is column 0. For the rows, build a mask from two columns and index with it: `X[mask]`.
:::

:::exercise np-rank Rank the teams
Complete `rank(teams, points)`. Both are lists of the same length. Return a list of team names ordered by points, highest first, using `np.argsort`.

@@starter
import numpy as np

def rank(teams, points):
    return teams

@@solution
import numpy as np

def rank(teams, points):
    order = np.argsort(points)[::-1]
    return list(np.array(teams)[order])

@@tests
def test_rank():
    """Orders teams by points, highest first"""
    assert rank(["Ashford", "Bramley", "Castleton"], [65, 78, 71]) == ["Bramley", "Castleton", "Ashford"]

def test_uses_argsort():
    """Uses np.argsort"""
    assert "argsort" in source
:::

:::quiz numpy-quiz Quick check
? What is `np.array([[1, 2, 3], [4, 5, 6]]).shape`?
- [ ] (3, 2)
- [x] (2, 3)
- [ ] 6
> 2 rows, 3 columns.

? Given a 2D array `X`, what does `X[:, 1]` select?
- [ ] The second row
- [x] The second column
- [ ] The element at row 1, column 1
> `:` means every row; `1` picks column 1.

? How do you combine two conditions on arrays?
- [ ] `(a > 1) and (a < 5)`
- [x] `(a > 1) & (a < 5)`
> `and` doesn't work element by element; `&` does. Keep the parentheses.

? After `v = a[1:3]` and `v[0] = 0`, has `a` changed?
- [x] Yes, slices are views of the same data
- [ ] No, slices are copies
> Use `.copy()` to get independent data.
:::

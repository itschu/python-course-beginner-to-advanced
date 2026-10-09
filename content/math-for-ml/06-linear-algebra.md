---
title: Linear algebra for machine learning
summary: Vectors, dot products, matrices and matrix multiplication, seen as the language of datasets and linear models. Then solve linear regression in one line.
minutes: 55
kind: lesson
---

Linear algebra sounds abstract, but in ML it's concrete: a dataset is a **matrix**, one example is a **vector**, a linear model is a **dot product**, and a neural network layer is a **matrix multiplication**. NumPy does all the arithmetic; your job is to understand what the operations mean.

:::tip Watch first
3Blue1Brown's [Essence of Linear Algebra](https://www.3blue1brown.com/topics/linear-algebra) builds the visual intuition beautifully. Watch the first few episodes alongside this lesson.
:::

## Vectors

A vector is an ordered list of numbers. In ML, one example (a house, a match) is a **feature vector**:

```python
import numpy as np

house = np.array([95, 3, 12])          # size m², bedrooms, age in years
other = np.array([120, 4, 30])

print(house + other)                   # element-wise addition
print(2 * house)                       # scaling
print(np.linalg.norm(house - other))   # Euclidean distance between them
```

The **norm** $\lVert v \rVert$ is a vector's length. The distance between two examples (the norm of their difference) is the basis of nearest-neighbour models and clustering. Note how size dominates the distance here because of its scale, which is another reason to standardise features.

## The dot product

The dot product multiplies matching elements and adds them up:

$$
\mathbf{w} \cdot \mathbf{x} = \sum_i w_i x_i
$$

That's exactly a **weighted sum**, which is what a linear model computes:

```python
import numpy as np

weights = np.array([2_800, 9_000, -1_200])    # £ per m², per bedroom, per year of age
house = np.array([95, 3, 12])
bias = 15_000

price = weights @ house + bias                 # @ is the dot product / matrix multiplication operator
print(f"predicted price: £{price:,.0f}")
print(np.dot(weights, house) + bias)           # same thing
```

Geometrically, the dot product measures how aligned two vectors are. Normalised, it's **cosine similarity**, used everywhere from recommender systems to comparing text embeddings in language models:

```python
import numpy as np

def cosine_similarity(a, b):
    return a @ b / (np.linalg.norm(a) * np.linalg.norm(b))

print(round(cosine_similarity(np.array([1, 2, 3]), np.array([2, 4, 6])), 3))    # same direction
print(round(cosine_similarity(np.array([1, 0]), np.array([0, 1])), 3))          # perpendicular
print(round(cosine_similarity(np.array([1, 2]), np.array([-1, -2])), 3))        # opposite
```

## Matrices

A matrix is a 2D array. A dataset with $n$ examples and $d$ features is an $n \times d$ matrix $X$, one row per example.

**Matrix-vector multiplication** $X\mathbf{w}$ computes the dot product of every row with $\mathbf{w}$: predictions for the whole dataset in one operation:

```python
import numpy as np

X = np.array([
    [95, 3, 12],
    [120, 4, 30],
    [60, 2, 5],
    [150, 5, 60],
])
w = np.array([2_800, 9_000, -1_200])
b = 15_000

predictions = X @ w + b                 # shape (4, 3) @ (3,) -> (4,)
print(predictions)
```

**Matrix-matrix multiplication** $AB$ requires the inner dimensions to match: $(n \times k)(k \times m) \to (n \times m)$. Each output cell is the dot product of a row of $A$ with a column of $B$:

```python
import numpy as np

A = np.array([[1, 2, 3], [4, 5, 6]])         # 2 x 3
B = np.array([[1, 0], [0, 1], [2, 2]])       # 3 x 2
print(A @ B)                                  # 2 x 2
print((A @ B).shape)
try:
    A @ A
except ValueError as e:
    print("shapes don't line up:", e)
```

A neural network layer is $XW + b$ followed by a non-linearity: a matrix of inputs times a matrix of weights. Shapes are the first thing to check when deep learning code breaks.

## Transpose, identity and inverse

```python
import numpy as np

A = np.array([[2.0, 1.0], [1.0, 3.0]])
print(A.T)                         # transpose: rows become columns
I = np.eye(2)                      # identity: I @ v = v
print(A @ I)
A_inv = np.linalg.inv(A)           # inverse: A @ A_inv = I
print(np.round(A @ A_inv, 10))
```

The inverse "undoes" a matrix, like division undoes multiplication, but only square matrices with independent columns have one. In practice you rarely compute an inverse directly. Instead you **solve** a system of equations, which is faster and more accurate:

```python
import numpy as np

# 2x + y = 5 and x + 3y = 10
A = np.array([[2.0, 1.0], [1.0, 3.0]])
b = np.array([5.0, 10.0])
print(np.linalg.solve(A, b))
```

## Linear regression in one line

Here's the payoff. Linear regression finds the weights $\mathbf{w}$ that minimise the squared error between predictions $X\mathbf{w}$ and targets $\mathbf{y}$. Linear algebra gives the answer in closed form, the **normal equation**:

$$
\mathbf{w} = (X^\top X)^{-1} X^\top \mathbf{y}
$$

```python
import numpy as np
import pandas as pd

houses = pd.read_csv("data/houses.csv")
features = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]
X = houses[features].to_numpy(dtype=float)
X = np.column_stack([np.ones(len(X)), X])          # a column of 1s gives the intercept
y = houses["price"].to_numpy(dtype=float)

w = np.linalg.solve(X.T @ X, X.T @ y)              # solve the normal equation
for name, value in zip(["intercept"] + features, w):
    print(f"{name:>12}: {value:>10,.0f}")

predictions = X @ w
rmse = np.sqrt(np.mean((y - predictions) ** 2))
print(f"typical error (RMSE): £{rmse:,.0f}")
```

Each weight is "£ per unit of that feature, holding the others fixed". You've just fitted a machine learning model with nothing but matrix algebra. In Phase 5, scikit-learn does this (and much more) for you, but now you know what it's doing.

## Practice

:::exercise la-predict Predict with a dot product
Write `predict(X, w, b)` that returns the predictions $X\mathbf{w} + b$ for a 2D array `X` (one row per example), a weight vector `w` and a scalar bias `b`. Use the `@` operator, no loops.

Then write `mse(y_true, y_pred)` returning the mean squared error as a float.

@@starter
import numpy as np

def predict(X, w, b):
    return np.zeros(len(X))

def mse(y_true, y_pred):
    return 0.0

@@solution
import numpy as np

def predict(X, w, b):
    return X @ w + b

def mse(y_true, y_pred):
    return float(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2))

@@tests
import numpy as np

def test_predict():
    """Computes Xw + b"""
    X = np.array([[1.0, 2.0], [3.0, 4.0], [0.0, 1.0]])
    assert np.allclose(predict(X, np.array([10.0, 1.0]), 5.0), [17.0, 39.0, 6.0])

def test_mse():
    """Mean squared error"""
    assert mse([1, 2, 3], [1, 2, 5]) == 4 / 3

def test_no_loops():
    """Uses matrix operations"""
    assert "@" in source and "for " not in source
:::

:::exercise la-normal Solve the normal equation
Write `fit_linear(X, y)` that adds a column of ones to `X` (for the intercept), solves the normal equation with `np.linalg.solve`, and returns a tuple `(intercept, weights)` where `weights` is a NumPy array.

@@starter
import numpy as np

def fit_linear(X, y):
    return 0.0, np.zeros(X.shape[1])

@@solution
import numpy as np

def fit_linear(X, y):
    Xb = np.column_stack([np.ones(len(X)), X])
    w = np.linalg.solve(Xb.T @ Xb, Xb.T @ y)
    return w[0], w[1:]

@@tests
import numpy as np
import pandas as pd

def test_exact_line():
    """Recovers y = 3 + 2x exactly"""
    X = np.array([[0.0], [1.0], [2.0], [3.0]])
    y = 3 + 2 * X[:, 0]
    b, w = fit_linear(X, y)
    assert np.isclose(b, 3) and np.allclose(w, [2])

def test_matches_lstsq():
    """Matches NumPy's least squares on the houses data"""
    houses = pd.read_csv("data/houses.csv")
    X = houses[["size_sqm", "age_years", "distance_km"]].to_numpy(float)
    y = houses["price"].to_numpy(float)
    b, w = fit_linear(X, y)
    ref = np.linalg.lstsq(np.column_stack([np.ones(len(X)), X]), y, rcond=None)[0]
    assert np.isclose(b, ref[0]) and np.allclose(w, ref[1:])
:::

:::exercise la-nearest Nearest neighbours
Write `nearest(X, query, k)`: return the **indices** of the `k` rows of `X` closest to the vector `query` by Euclidean distance, closest first. Compute all distances at once with broadcasting and `np.linalg.norm(..., axis=1)`.

@@starter
import numpy as np

def nearest(X, query, k):
    return np.array([], dtype=int)

@@solution
import numpy as np

def nearest(X, query, k):
    distances = np.linalg.norm(X - query, axis=1)
    return np.argsort(distances)[:k]

@@tests
import numpy as np

def test_nearest():
    """Finds the closest points in order"""
    X = np.array([[0, 0], [10, 10], [1, 1], [5, 5], [0.5, 0]])
    assert nearest(X, np.array([0, 0]), 3).tolist() == [0, 4, 2]

def test_k_one():
    """k = 1 returns the single closest"""
    X = np.array([[3.0, 4.0], [1.0, 1.0]])
    assert nearest(X, np.array([3.0, 3.0]), 1).tolist() == [0]
:::

:::quiz la-quiz Quick check
? What does `X @ w` compute when X is (100, 5) and w is (5,)?
- [x] 100 predictions, each a weighted sum of one row
- [ ] A single number
- [ ] A (5, 5) matrix
> One dot product per row.

? Can you multiply a (3, 4) matrix by a (3, 4) matrix with `@`?
- [ ] Yes
- [x] No, the inner dimensions (4 and 3) don't match
> You could multiply A by B.T, which is (4, 3).

? Two feature vectors have cosine similarity close to 1. That means:
- [x] They point in nearly the same direction
- [ ] They're perpendicular
- [ ] They're identical in length
> Cosine similarity ignores length and measures direction.

? Why add a column of ones to X before solving the normal equation?
- [x] Its weight becomes the intercept (bias)
- [ ] To avoid dividing by zero
- [ ] It's required by NumPy
> Without it, the fitted line is forced through the origin.
:::

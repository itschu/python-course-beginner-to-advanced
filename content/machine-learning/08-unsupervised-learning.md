---
title: "Unsupervised learning: clustering and PCA"
summary: Group similar items with k-means, choose the number of clusters, and compress and visualise data with principal component analysis.
minutes: 45
kind: lesson
---

Unsupervised learning finds structure in data **without** a target. Two tools cover most practical needs: **clustering** to group similar examples, and **dimensionality reduction** to compress many features into a few.

## k-means clustering

k-means places `k` cluster centres and repeats two steps: assign each point to its nearest centre, then move each centre to the mean of its points. Let's group teams by playing style, using attacking and defensive statistics:

```python
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("data/matches.csv")
long = pd.concat([
    pd.DataFrame({"Team": df["HomeTeam"], "GF": df["FTHG"], "GA": df["FTAG"], "Shots": df["HS"], "OnTarget": df["HST"]}),
    pd.DataFrame({"Team": df["AwayTeam"], "GF": df["FTAG"], "GA": df["FTHG"], "Shots": df["AS"], "OnTarget": df["AST"]}),
])
teams = long.groupby("Team").mean()

X = StandardScaler().fit_transform(teams)          # k-means uses distances: scale first!
kmeans = KMeans(n_clusters=3, n_init=10, random_state=0).fit(X)
teams["Cluster"] = kmeans.labels_
print(teams.groupby("Cluster").mean().round(2))

fig, ax = plt.subplots(figsize=(6, 4))
ax.scatter(teams["GF"], teams["GA"], c=teams["Cluster"], cmap="viridis", s=60)
for name, row in teams.iterrows():
    ax.annotate(name.split()[0], (row["GF"], row["GA"]), fontsize=7, xytext=(3, 3), textcoords="offset points")
ax.set_xlabel("goals scored per match")
ax.set_ylabel("goals conceded per match")
ax.set_title("Teams clustered by style")
fig.tight_layout()
plt.show()
```

Always **scale** features before k-means. Otherwise the feature with the biggest numbers (shots, here) dominates the distances.

## Choosing k

There's no single right answer; two common guides:

- **Elbow method:** plot the within-cluster spread (`inertia_`) against k and look for the bend where adding clusters stops helping much.
- **Silhouette score:** how well each point fits its own cluster compared with the nearest other cluster, from −1 to 1. Higher is better.

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.cluster import KMeans
from sklearn.datasets import make_blobs
from sklearn.metrics import silhouette_score

X, _ = make_blobs(n_samples=400, centers=4, cluster_std=1.1, random_state=7)
ks = range(2, 9)
inertias, silhouettes = [], []
for k in ks:
    km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(X)
    inertias.append(km.inertia_)
    silhouettes.append(silhouette_score(X, km.labels_))

fig, axes = plt.subplots(1, 2, figsize=(10, 3.2))
axes[0].plot(ks, inertias, "o-")
axes[0].set_title("Elbow: inertia")
axes[1].plot(ks, silhouettes, "o-")
axes[1].set_title("Silhouette score")
for ax in axes:
    ax.set_xlabel("k")
fig.tight_layout()
plt.show()
print("best silhouette at k =", list(ks)[int(np.argmax(silhouettes))])
```

Clusters are a **description**, not a truth. Judge them by whether they're useful: do customer segments respond differently to offers? Do team styles predict anything?

## Principal component analysis (PCA)

PCA finds new axes (**principal components**) that capture as much of the data's variation as possible, ordered from most to least. Keeping the first few compresses the data while losing little information. The digits dataset has 64 features per image (8×8 pixels):

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.datasets import load_digits
from sklearn.decomposition import PCA

digits = load_digits()
pca = PCA().fit(digits.data)
cumulative = np.cumsum(pca.explained_variance_ratio_)
print(f"components needed for 90% of the variance: {np.argmax(cumulative >= 0.9) + 1} of 64")

coords = PCA(n_components=2).fit_transform(digits.data)
fig, ax = plt.subplots(figsize=(6, 5))
points = ax.scatter(coords[:, 0], coords[:, 1], c=digits.target, cmap="tab10", s=8)
fig.colorbar(points, ax=ax, label="digit")
ax.set_title("64 pixel features squeezed into 2 dimensions")
ax.set_xlabel("component 1")
ax.set_ylabel("component 2")
fig.tight_layout()
plt.show()
```

Even in just two dimensions, the digits form visible groups. PCA is used to:

- **visualise** high-dimensional data,
- **compress** features before modelling (fewer features, less noise),
- remove **correlated** features, since components are uncorrelated by construction.

Like k-means, PCA is sensitive to scale, so standardise features measured in different units first.

## Unsupervised features for supervised models

Cluster labels and principal components can become **features** for a supervised model. For example, a team's style cluster might help predict how matches between styles play out. When you do this, fit the clustering or PCA **inside** your training data only (or inside a pipeline, next lesson), or you leak information from the test set.

## Practice

:::exercise unsup-kmeans Segment customers
Write `segment(df, columns, k, seed)` that standardises the given columns with `StandardScaler`, fits `KMeans(n_clusters=k, n_init=10, random_state=seed)`, and returns a copy of `df` with a new `"segment"` column of cluster labels.

@@starter
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

def segment(df, columns, k, seed):
    return df.copy()

@@solution
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

def segment(df, columns, k, seed):
    out = df.copy()
    X = StandardScaler().fit_transform(out[columns])
    out["segment"] = KMeans(n_clusters=k, n_init=10, random_state=seed).fit_predict(X)
    return out

@@tests
import numpy as np
import pandas as pd
from sklearn.datasets import make_blobs

def test_segments():
    """Finds well-separated groups"""
    X, true = make_blobs(n_samples=300, centers=3, cluster_std=0.5, random_state=1)
    df = pd.DataFrame(X * [1, 1000], columns=["a", "b"])     # very different scales
    out = segment(df, ["a", "b"], 3, 0)
    assert "segment" in out.columns and out["segment"].nunique() == 3
    agreement = pd.crosstab(out["segment"], true).max(axis=1).sum() / len(out)
    assert agreement > 0.95, agreement

def test_does_not_modify():
    """Returns a copy"""
    df = pd.DataFrame({"a": [1.0, 2.0, 10.0, 11.0], "b": [1.0, 1.0, 5.0, 5.0]})
    segment(df, ["a", "b"], 2, 0)
    assert "segment" not in df.columns
:::

:::exercise unsup-pca Components for 95%
Write `components_for(X, threshold)` that standardises `X`, fits a full `PCA()`, and returns the smallest number of components whose cumulative explained variance ratio is at least `threshold`.

@@starter
import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

def components_for(X, threshold):
    return 0

@@solution
import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

def components_for(X, threshold):
    pca = PCA().fit(StandardScaler().fit_transform(X))
    cumulative = np.cumsum(pca.explained_variance_ratio_)
    return int(np.argmax(cumulative >= threshold) + 1)

@@tests
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

def test_breast_cancer():
    """Matches the expected count"""
    X, _ = load_breast_cancer(return_X_y=True)
    c = np.cumsum(PCA().fit(StandardScaler().fit_transform(X)).explained_variance_ratio_)
    assert components_for(X, 0.95) == int(np.argmax(c >= 0.95) + 1)
    assert components_for(X, 0.5) < components_for(X, 0.95) < 30

def test_redundant_features():
    """Perfectly correlated features need only one component"""
    x = np.random.default_rng(0).normal(size=200)
    X = np.column_stack([x, 2 * x, -3 * x])
    assert components_for(X, 0.99) == 1
:::

:::quiz unsup-quiz Quick check
? Why scale features before k-means?
- [x] It uses distances, so features with large numbers would dominate
- [ ] k-means requires values between 0 and 1
- [ ] It makes clustering faster
> Standardise first, as with PCA.

? What does a silhouette score near 1 mean?
- [x] Points sit firmly in their own cluster, far from others
- [ ] The clusters overlap heavily
- [ ] There's only one cluster
> Values near 0 suggest overlapping clusters.

? The first principal component is:
- [x] The direction that captures the most variance in the data
- [ ] The most important original feature
- [ ] The target variable
> Components are combinations of the original features.

? Why fit PCA only on training data when using it before a model?
- [x] Fitting on all data leaks information from the test set
- [ ] PCA can't handle large datasets
> Pipelines make this automatic.
:::

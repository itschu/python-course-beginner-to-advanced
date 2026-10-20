---
title: Deep learning or gradient boosting?
summary: Why tree ensembles still win on most tabular data, where neural networks win instead, what embeddings add for categorical features, and a head-to-head on match prediction where the Phase 6 goal model turns out to be a tiny neural network.
minutes: 50
kind: lesson
colab: notebooks/07-10-tabular-deep-learning.ipynb
---

Deep learning dominates images, audio and text. On **tables** of features, which is most business, finance and sports data, gradient-boosted trees usually match or beat neural networks, train faster and need less tuning. Knowing which tool to reach for is part of being a professional, and it saves weeks.

## A head-to-head on tabular data

A large benchmark study (Grinsztajn, Oyallon and Varoquaux, *Why do tree-based models still outperform deep learning on tabular data?*, NeurIPS 2022) found two main reasons trees win on typical tables:

1. **Irregular targets.** Real-world rules often have sharp thresholds ("risk jumps once debt passes 40% of income"). Trees cut at thresholds naturally; neural networks are biased towards smooth functions.
2. **Uninformative features.** Tables often include columns that don't matter. Trees mostly ignore them; MLPs are hurt by them.

Here's a synthetic "credit risk" table built to have both properties: the label depends on thresholds and an interaction in five features, five more features are pure noise, and 10% of labels are flipped at random (so about 90% accuracy is the best possible).

```python
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

rng = np.random.default_rng(0)
X = rng.normal(size=(3000, 10))
risky = ((X[:, 0] > 0.5) & (X[:, 1] < 0)) | (X[:, 2] > 1.2) | ((X[:, 3] < -0.8) & (X[:, 4] > 0.3))
y = np.where(rng.random(3000) < 0.1, ~risky, risky).astype(int)       # 10% label noise
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=0)

models = {
    "logistic regression": make_pipeline(StandardScaler(), LogisticRegression()),
    "gradient boosting": HistGradientBoostingClassifier(random_state=0),
    "neural network (MLP)": make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(64, 64), early_stopping=True,
                                                                          max_iter=1000, random_state=0)),
}
print("                      all 10 features   5 informative only")
for name, model in models.items():
    all_features = model.fit(X_train, y_train).score(X_test, y_test)
    informative = model.fit(X_train[:, :5], y_train).score(X_test[:, :5], y_test)
    print(f"{name:>22}: {all_features:15.3f} {informative:18.3f}")
```

- Gradient boosting gets close to the 90% ceiling with default settings.
- The MLP is well behind, and dropping the noise columns helps it a lot. It helps the trees hardly at all.
- Logistic regression can't represent the thresholds and interactions.

Neural networks can be pushed closer with careful tuning, feature engineering and more data, but that's exactly the cost trees save you.

## Where neural networks win

| Situation | Why |
| --- | --- |
| Images, audio, video | Convolutions and transformers learn the features; trees on raw pixels can't. On Fashion-MNIST, this phase's MLP reached 89% and the CNN 91.5% (lessons 7 and 8). |
| Text | Pretrained transformers understand context and word order (lesson 9). |
| Huge datasets | Millions of rows let networks learn patterns too complex for hand-made features. |
| Many high-cardinality categories | **Embeddings** learn a compact vector for each product, user or store. |
| Several input types at once | One network can combine an image, some text and a few numbers. |
| You need to fine-tune or continue training | Networks can be updated incrementally; tree ensembles are usually retrained. |

## Embeddings for categorical features

One-hot encoding a feature with 10,000 product IDs makes 10,000 sparse columns. An **embedding layer** instead learns a short vector (say 16 numbers) for each category, trained along with the rest of the network. Products that behave similarly end up with similar vectors.

```python static
team_embedding = nn.Embedding(num_embeddings=20, embedding_dim=8)   # 20 teams, 8 numbers each
vectors = team_embedding(torch.tensor([3, 17]))                    # shape (2, 8): two teams' vectors
```

An embedding is just a lookup table of trainable weights: mathematically the same as a one-hot vector multiplied by a weight matrix, but much cheaper.

## Match prediction: structure beats flexibility

The companion notebook applies embeddings to the course's football data and compares two networks with the market on the 2024-25 season, all trained walk-forward (refitted before each month, on earlier matches only):

- **PoissonNet**: each team gets a one-number *attack* embedding and a one-number *defence* embedding, and the home side's log expected goals are `base + home advantage + attack[home] − defence[away]`. It's trained with the Poisson log-likelihood and time-decay weights. That's exactly the Phase 6 goal model, written as a neural network with 42 parameters.
- **EmbeddingMLP**: an 8-number embedding per team, fed through a hidden layer to home/draw/away outputs. Over 800 parameters, and free to learn any pattern. Its number of training epochs is chosen on 2023-24.

```python static
class PoissonNet(nn.Module):
    def __init__(self, n_teams):
        super().__init__()
        self.attack = nn.Embedding(n_teams, 1)
        self.defence = nn.Embedding(n_teams, 1)
        self.base = nn.Parameter(torch.tensor(0.3))
        self.home_adv = nn.Parameter(torch.tensor(0.2))

    def forward(self, h, a):
        log_home = self.base + self.home_adv + (self.attack(h) - self.defence(a)).squeeze(1)
        log_away = self.base + (self.attack(a) - self.defence(h)).squeeze(1)
        return log_home, log_away
```

The results (test log loss on 2024-25, lower is better):

| Model | Log loss |
| --- | --- |
| Market (bookmaker, margin removed) | 1.0394 |
| PoissonNet, walk-forward | 1.0440 |
| Base rates (the H/D/A frequencies of the two previous seasons) | 1.0547 |
| PoissonNet fitted once on 2022-24, never updated | 1.0612 |
| EmbeddingMLP, walk-forward | 1.0749 |

What they show:

- **PoissonNet scores exactly what Phase 6's scikit-learn `PoissonRegressor` scored** (1.0440). Same model, different library. Many classical statistical models are small neural networks with a sensible structure.
- **Fitted once and never updated, it's worse than base rates.** Team strength drifts, so models must keep learning. That's a data problem no architecture fixes.
- **The flexible EmbeddingMLP never beats base rates.** Even with its epochs tuned on a validation season, about 1,000 noisy results aren't enough for it to learn more than noise.

With small, noisy data, a model whose structure matches how the data is generated beats a flexible one every time.

## A practical decision guide

1. **Tabular data?** Start with a simple baseline, then gradient boosting (Phase 5). Only try a neural network if you have lots of data, embeddings to learn, or need to combine data types.
2. **Images, audio or text?** Start from a pretrained network and fine-tune (lessons 8 and 9).
3. **Small data?** Prefer models with the right structure (like the goal model) over flexible ones, and validate honestly.
4. **Whatever you choose,** compare with baselines on data the model never saw.

## Practice

:::exercise emb-forward An embedding lookup
Write `embed(table, ids)`: `table` is an array of shape `(n_categories, dim)` and `ids` an integer array of category numbers. Return the rows of `table` for those ids, shape `(len(ids), dim)`. Then write `embed_one_hot(table, ids)` that gets the same result by building a one-hot matrix of shape `(len(ids), n_categories)` and multiplying it by `table`.

@@starter
import numpy as np

def embed(table, ids):
    pass

def embed_one_hot(table, ids):
    pass

@@solution
import numpy as np

def embed(table, ids):
    return table[np.asarray(ids)]

def embed_one_hot(table, ids):
    one_hot = np.eye(table.shape[0])[np.asarray(ids)]
    return one_hot @ table

@@tests
import numpy as np

def test_lookup():
    """Rows in the order of the ids, repeats allowed"""
    table = np.arange(12, dtype=float).reshape(4, 3)
    assert np.array_equal(embed(table, [2, 0, 2]), [[6, 7, 8], [0, 1, 2], [6, 7, 8]])

def test_same_as_one_hot():
    """A lookup equals one-hot times the table"""
    table = np.random.default_rng(0).normal(size=(20, 8))
    ids = np.array([3, 17, 3, 0])
    assert np.allclose(embed(table, ids), embed_one_hot(table, ids))
    assert embed_one_hot(table, ids).shape == (4, 8)
:::

:::exercise emb-backward The embedding's backward pass
Write `embedding_grad(ids, dout, n_categories)`. `dout` has shape `(len(ids), dim)`: the gradient for each looked-up row. Return the gradient for the whole table, shape `(n_categories, dim)`: each category's row is the **sum** of the gradients of every position where it was used (zero for unused categories). Careful: a team that appears twice in a batch must get both gradients (`np.add.at` handles repeated indices; `grad[ids] += dout` doesn't).

@@starter
import numpy as np

def embedding_grad(ids, dout, n_categories):
    return np.zeros((n_categories, dout.shape[1]))

@@solution
import numpy as np

def embedding_grad(ids, dout, n_categories):
    grad = np.zeros((n_categories, dout.shape[1]))
    np.add.at(grad, np.asarray(ids), dout)
    return grad

@@tests
import numpy as np

def test_repeated_ids_accumulate():
    """Category 2 appears twice, so its gradients add up"""
    dout = np.array([[1.0, 0.0], [0.5, 0.5], [2.0, -1.0]])
    grad = embedding_grad([2, 0, 2], dout, 4)
    assert np.allclose(grad, [[0.5, 0.5], [0.0, 0.0], [3.0, -1.0], [0.0, 0.0]])

def test_matches_one_hot_gradient():
    """Same as the gradient of one_hot @ table"""
    rng = np.random.default_rng(1)
    ids, dout = rng.integers(0, 5, 12), rng.normal(size=(12, 3))
    one_hot = np.eye(5)[ids]
    assert np.allclose(embedding_grad(ids, dout, 5), one_hot.T @ dout)
:::

:::quiz dlvb-quiz Quick check
? You have 20,000 rows of customer features (age, plan, monthly spend…) and want to predict churn. What should you try first?
- [x] Gradient boosting, after a simple baseline
- [ ] A convolutional network
- [ ] A fine-tuned transformer
> Tabular data: trees are usually as good or better, and much cheaper to tune.

? Why do neural networks tend to struggle on tables with many irrelevant columns?
- [x] They don't ignore uninformative features as easily as trees, which simply rarely split on them
- [ ] They can't read numbers
- [ ] Irrelevant columns make the network too small
> Removing the noise columns helped the MLP far more than the trees.

? What is an embedding layer?
- [x] A trainable lookup table that maps each category to a short vector of numbers
- [ ] A way to compress images
- [ ] A type of activation function
> Equivalent to one-hot encoding followed by a linear layer, but much cheaper.

? The flexible EmbeddingMLP did worse than base rates on match prediction. What's the main reason?
- [x] Too little, too noisy data for a model with that much freedom
- [ ] Neural networks can't predict football
- [ ] It used the wrong optimiser
> The structured 42-parameter model learned a lot from the same data.
:::

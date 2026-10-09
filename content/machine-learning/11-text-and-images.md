---
title: Text and images with classic ML
summary: Turn text into features with bag-of-words and TF-IDF to classify reviews, and classify handwritten digits from raw pixels, before deep learning takes over in Phase 7.
minutes: 50
kind: lesson
---

Models need numbers. Tables are easy; text and images need converting first. The classic techniques in this lesson are still widely used: they're fast, cheap, interpretable and strong baselines for the deep learning approaches in Phase 7.

## Text as numbers: bag of words

The simplest representation counts how often each word appears, ignoring order: a **bag of words**:

```python
from sklearn.feature_extraction.text import CountVectorizer

docs = ["great value, great quality", "terrible quality", "great service"]
vectorizer = CountVectorizer()
X = vectorizer.fit_transform(docs)

print(vectorizer.get_feature_names_out())
print(X.toarray())
```

Each column is a word from the **vocabulary** learned during `fit`; each row is a document. The result is a **sparse matrix**: most entries are zero, so only the non-zero ones are stored.

## TF-IDF

Common words like "the" appear everywhere and carry little information. **TF-IDF** (term frequency × inverse document frequency) down-weights words that appear in many documents and up-weights distinctive ones:

```python
from sklearn.feature_extraction.text import TfidfVectorizer

docs = ["the kettle is great", "the blender is terrible", "the kettle broke"]
tfidf = TfidfVectorizer()
X = tfidf.fit_transform(docs)
for word, weight in zip(tfidf.get_feature_names_out(), X.toarray()[0]):
    if weight > 0:
        print(f"{word:>8}: {weight:.2f}")
```

In the first document, "great" outweighs "the", which appears in every document.

## Classifying reviews

TF-IDF plus logistic regression is a classic, surprisingly strong text classifier:

```python
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline

reviews = pd.read_csv("data/reviews.csv")
X_train, X_test, y_train, y_test = train_test_split(reviews["review"], reviews["sentiment"], test_size=0.25,
                                                    random_state=0, stratify=reviews["sentiment"])

model = make_pipeline(TfidfVectorizer(), LogisticRegression(max_iter=1000))
model.fit(X_train, y_train)
print(f"test accuracy: {model.score(X_test, y_test):.3f}")

new = ["This blender is excellent quality", "Broke after a week, total waste", "bad", "not terrible at all"]
for text, label in zip(new, model.predict(new)):
    print(f"{label:>8}: {text}")
```

Look closely at the last two. The model calls the single word "bad" **positive**. Why? In this training data, "bad" only ever appears in the phrase "not bad at all", which is positive. Models learn the data, not the language, so they pick up every quirk of their training set.

And "not terrible at all" comes out negative, because a bag of words throws away order: it just sees "terrible". Adding **n-grams** (pairs of consecutive words) captures short phrases like "not terrible" and "at all":

```python
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

reviews = pd.read_csv("data/reviews.csv")
model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2)), LogisticRegression(max_iter=1000, C=10))
model.fit(reviews["review"], reviews["sentiment"])
print(model.predict(["not terrible at all", "terrible", "not great"]))

vectorizer, clf = model[0], model[-1]
words = vectorizer.get_feature_names_out()
order = np.argsort(clf.coef_[0])
print("most negative:", list(words[order[:8]]))
print("most positive:", list(words[order[-8:]]))
```

The model's weights tell you which words and phrases push towards each class, so you can explain its decisions. Modern language models (transformers, Phase 7) understand order and context far better, but for many business tasks TF-IDF with a linear model is a fast, strong baseline that's hard to beat by much.

## Images as numbers: pixels

A greyscale image is a grid of brightness values. The digits dataset contains 1,797 handwritten digits, each 8×8 pixels:

```python
import matplotlib.pyplot as plt
from sklearn.datasets import load_digits

digits = load_digits()
print(digits.images.shape, "->", digits.data.shape)    # each 8x8 image flattened to 64 features

fig, axes = plt.subplots(2, 8, figsize=(9, 2.6))
for ax, image, label in zip(axes.ravel(), digits.images, digits.target):
    ax.imshow(image, cmap="gray_r")
    ax.set_title(label)
    ax.axis("off")
fig.tight_layout()
plt.show()
```

Flatten each image into a vector of 64 pixel values, and any classifier can learn from it:

```python
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

X, y = load_digits(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

for name, model in [("logistic regression", make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))),
                    ("k-nearest neighbours", KNeighborsClassifier(n_neighbors=3)),
                    ("support vector machine", SVC(gamma="scale"))]:
    model.fit(X_train, y_train)
    print(f"{name:>22}: test accuracy {model.score(X_test, y_test):.3f}")
```

Two new models appeared: **k-nearest neighbours** predicts the majority label among the k most similar training images, and a **support vector machine** finds the boundary with the widest margin between classes (with a kernel to make it non-linear). Both work well on small, clean images.

Which digits get confused?

```python
import matplotlib.pyplot as plt
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.svm import SVC

digits = load_digits()
X_train, X_test, y_train, y_test, img_train, img_test = train_test_split(
    digits.data, digits.target, digits.images, test_size=0.25, random_state=0, stratify=digits.target)
pred = SVC(gamma="scale").fit(X_train, y_train).predict(X_test)
wrong = np.flatnonzero(pred != y_test)
print(f"{len(wrong)} mistakes out of {len(y_test)}")

fig, axes = plt.subplots(1, min(6, len(wrong)), figsize=(8, 1.8))
for ax, i in zip(np.atleast_1d(axes), wrong[:6]):
    ax.imshow(img_test[i], cmap="gray_r")
    ax.set_title(f"true {y_test[i]}, pred {pred[i]}", fontsize=8)
    ax.axis("off")
fig.tight_layout()
plt.show()
```

Pixel features work for tiny, centred digits, but they break down for real photos: shift a cat ten pixels to the left and every feature changes. Convolutional neural networks (Phase 7) learn features that don't care where in the image something appears.

## Practice

:::exercise text-clf A sentiment classifier
Write `train_sentiment(texts, labels)` that returns a fitted pipeline of `TfidfVectorizer(ngram_range=(1, 2))` and `LogisticRegression(max_iter=1000, C=10)`.

Then write `predict_sentiment(model, texts)` returning a list of predicted labels.

@@starter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

def train_sentiment(texts, labels):
    return None

def predict_sentiment(model, texts):
    return []

@@solution
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

def train_sentiment(texts, labels):
    model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2)), LogisticRegression(max_iter=1000, C=10))
    return model.fit(texts, labels)

def predict_sentiment(model, texts):
    return list(model.predict(texts))

@@tests
import pandas as pd
from sklearn.model_selection import train_test_split

def test_accuracy():
    """Classifies held-out reviews accurately"""
    r = pd.read_csv("data/reviews.csv")
    Xtr, Xte, ytr, yte = train_test_split(r["review"], r["sentiment"], test_size=0.25, random_state=1, stratify=r["sentiment"])
    model = train_sentiment(Xtr, ytr)
    preds = predict_sentiment(model, Xte)
    accuracy = sum(p == t for p, t in zip(preds, yte)) / len(yte)
    assert accuracy > 0.95, accuracy

def test_bigrams():
    """Uses word pairs"""
    r = pd.read_csv("data/reviews.csv")
    model = train_sentiment(r["review"], r["sentiment"])
    assert any(" " in f for f in model[0].get_feature_names_out()), "use ngram_range=(1, 2)"
:::

:::exercise img-knn Choose k for digits
Write `best_k(X_train, y_train, ks)` that evaluates `KNeighborsClassifier(n_neighbors=k)` for each `k` with 5-fold cross-validation (accuracy) and returns the `k` with the highest mean score (the smallest such `k` if there's a tie).

@@starter
from sklearn.model_selection import cross_val_score
from sklearn.neighbors import KNeighborsClassifier

def best_k(X_train, y_train, ks):
    return ks[0]

@@solution
from sklearn.model_selection import cross_val_score
from sklearn.neighbors import KNeighborsClassifier

def best_k(X_train, y_train, ks):
    scores = {k: cross_val_score(KNeighborsClassifier(n_neighbors=k), X_train, y_train, cv=5).mean() for k in ks}
    best = max(scores.values())
    return min(k for k, s in scores.items() if s == best)

@@tests
from sklearn.datasets import load_digits
from sklearn.model_selection import cross_val_score
from sklearn.neighbors import KNeighborsClassifier

def test_reference():
    """Picks the best k by cross-validation"""
    X, y = load_digits(return_X_y=True)
    ks = [1, 3, 5, 15, 51]
    s = {k: cross_val_score(KNeighborsClassifier(n_neighbors=k), X, y, cv=5).mean() for k in ks}
    m = max(s.values())
    assert best_k(X, y, ks) == min(k for k, v in s.items() if v == m)
:::

:::quiz text-quiz Quick check
? What does a bag-of-words representation ignore?
- [x] Word order
- [ ] Which words appear
- [ ] How often words appear
> "Not good" and "good, not" look identical without n-grams.

? Why does TF-IDF down-weight a word like "the"?
- [x] It appears in almost every document, so it doesn't distinguish them
- [ ] It's too short
- [ ] It's a stop word in every language
> Distinctive words get higher weights.

? How does k-nearest neighbours classify a new image?
- [x] By the majority label of the k most similar training images
- [ ] By learning weights for each pixel
- [ ] By building a decision tree
> It stores the training data and compares at prediction time.

? Why do raw pixel features struggle with real photographs?
- [x] Moving or resizing the object changes all the pixel values
- [ ] Photos have too few pixels
- [ ] Colour can't be represented as numbers
> CNNs learn features that tolerate shifts and changes of scale.
:::

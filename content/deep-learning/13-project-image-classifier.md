---
title: "Project: an image classifier, end to end"
summary: Train a CNN with augmentation and a one-cycle learning-rate schedule, evaluate it with per-class accuracy, a confusion matrix and error analysis, then package it with metadata, an inference function and a model card, ready to serve.
minutes: 150
kind: project
colab: notebooks/07-11-project-image-classifier.ipynb
---

A model in a notebook isn't a product. In this project you'll take an image classifier all the way: train it well, evaluate it honestly, understand its mistakes, and package it so that an application (like the API you'll build in Phase 8) can use it.

The training runs in Colab. The evaluation and packaging utilities, which are plain NumPy, you'll write and test here first.

:::colab Run the project notebook
Open it with **Open in Colab** at the top of the page, switch to a GPU runtime, and run it top to bottom. Training takes several minutes on a GPU. The notebook has two **Your turn** tasks with checks; you'll write the same functions below.
:::

## The plan

1. **Data**: Fashion-MNIST, normalised with the training set's mean (0.286) and standard deviation (0.353), with random shifts and flips for training.
2. **Model**: three convolutional blocks (32 → 64 → 128 channels, two convolutions each, batch normalisation), then **global average pooling** and a single linear layer.
3. **Training**: AdamW with a **one-cycle** learning-rate schedule for 12 epochs, keeping the weights from the best validation epoch.
4. **Evaluation**: test accuracy, per-class accuracy, a confusion matrix, and the most confident mistakes.
5. **Packaging**: weights, metadata (classes and preprocessing), an inference function, and a model card.

## The model

```python static
def conv_block(c_in, c_out):
    return nn.Sequential(
        nn.Conv2d(c_in, c_out, 3, padding=1, bias=False), nn.BatchNorm2d(c_out), nn.ReLU(),
        nn.Conv2d(c_out, c_out, 3, padding=1, bias=False), nn.BatchNorm2d(c_out), nn.ReLU(),
        nn.MaxPool2d(2),
    )

class FashionNet(nn.Module):
    def __init__(self, n_classes=10):
        super().__init__()
        self.features = nn.Sequential(conv_block(1, 32), conv_block(32, 64), conv_block(64, 128))   # 128 x 3 x 3
        self.head = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(0.3), nn.Linear(128, n_classes))

    def forward(self, x):
        return self.head(self.features(x))
```

Two details worth knowing:

- **Global average pooling** (`AdaptiveAvgPool2d(1)`) averages each of the 128 final feature maps to one number. That replaces lesson 8's big dense layer, so this deeper network has fewer parameters (about 288,000 against 422,000).
- The convolutions have `bias=False` because the batch normalisation straight after them has its own shift, which makes a bias redundant.

## Training with a one-cycle schedule

```python static
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.OneCycleLR(optimizer, max_lr=3e-3, epochs=EPOCHS,
                                                steps_per_epoch=len(train_loader))
for epoch in range(EPOCHS):
    model.train()
    for X, y in train_loader:
        loss = nn.functional.cross_entropy(model(X.to(device)), y.to(device))
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        scheduler.step()                  # one-cycle steps every batch, not every epoch
    ...                                   # evaluate, keep the best weights
```

**One-cycle** raises the learning rate for the first part of training, then anneals it to nearly zero. The high middle phase moves quickly across the loss landscape; the low final phase settles into a good minimum. **AdamW** is Adam with weight decay applied correctly (decoupled from the gradient), the usual choice for modern networks.

### What to expect

When we ran the notebook, validation accuracy reached 94.0% by the final epoch and **test accuracy was 93.2%**, up from 91.5% for lesson 8's CNN, with fewer parameters. The validation accuracy dips around epoch 2, when the one-cycle schedule hits its peak learning rate, then climbs steadily as the rate anneals.

Per class, bags, trousers, sandals and sneakers are almost always right (97–99%). **Shirts are the hardest at 78%**: of 1,000 test shirts, 105 were called T-shirts, 52 coats and 35 pullovers. T-shirt/top, pullover and coat are the next hardest classes. At 28×28 pixels these are genuinely ambiguous. And look at the gallery of most confident mistakes: in our run, several look more like the *predicted* class than the label (a "sneaker" shaped like an ankle boot, "T-shirts" and a "trouser" that look like dresses). Some Fashion-MNIST labels are debatable or simply wrong. That's typical: error analysis often finds problems in the data rather than the model, and more training can't fix those.

## Step 1: Evaluation tools

:::exercise ic-confusion Confusion matrix and per-class accuracy
Write two functions for integer class labels:

- `confusion(labels, predictions, n_classes)`: an integer array of shape `(n_classes, n_classes)` where entry `[i, j]` counts examples of true class `i` predicted as class `j`.
- `per_class_accuracy(labels, predictions, n_classes)`: for each class, the share of its examples predicted correctly (the diagonal divided by the row totals).

@@starter
import numpy as np

def confusion(labels, predictions, n_classes):
    return np.zeros((n_classes, n_classes), dtype=int)

def per_class_accuracy(labels, predictions, n_classes):
    return np.zeros(n_classes)

@@solution
import numpy as np

def confusion(labels, predictions, n_classes):
    cm = np.zeros((n_classes, n_classes), dtype=int)
    np.add.at(cm, (np.asarray(labels), np.asarray(predictions)), 1)
    return cm

def per_class_accuracy(labels, predictions, n_classes):
    cm = confusion(labels, predictions, n_classes)
    return np.diag(cm) / cm.sum(axis=1)

@@tests
import numpy as np

def test_confusion():
    """Rows are true classes, columns predictions"""
    labels = np.array([0, 0, 1, 1, 1, 2])
    preds = np.array([0, 1, 1, 1, 2, 2])
    assert np.array_equal(confusion(labels, preds, 3), [[1, 1, 0], [0, 2, 1], [0, 0, 1]])

def test_per_class():
    """Diagonal over row totals"""
    labels = np.array([0, 0, 1, 1, 1, 2])
    preds = np.array([0, 1, 1, 1, 2, 2])
    assert np.allclose(per_class_accuracy(labels, preds, 3), [0.5, 2 / 3, 1.0])

def test_matches_sklearn():
    """Agrees with scikit-learn"""
    from sklearn.metrics import confusion_matrix
    rng = np.random.default_rng(0)
    labels, preds = rng.integers(0, 10, 500), rng.integers(0, 10, 500)
    assert np.array_equal(confusion(labels, preds, 10), confusion_matrix(labels, preds, labels=range(10)))
:::

:::exercise ic-topk Top-k accuracy and confident mistakes
Write two functions that take `probs`, an array of shape `(n, n_classes)` of predicted probabilities, and integer `labels`:

- `top_k_accuracy(probs, labels, k)`: the share of examples whose true class is among the `k` highest probabilities.
- `confident_mistakes(probs, labels, n)`: the indices of the `n` wrong predictions (where the top class isn't the label) with the highest top-class probability, most confident first.

@@starter
import numpy as np

def top_k_accuracy(probs, labels, k):
    return 0.0

def confident_mistakes(probs, labels, n):
    return np.array([], dtype=int)

@@solution
import numpy as np

def top_k_accuracy(probs, labels, k):
    top_k = np.argsort(probs, axis=1)[:, -k:]
    return float(np.mean([label in row for row, label in zip(top_k, labels)]))

def confident_mistakes(probs, labels, n):
    pred = probs.argmax(axis=1)
    confidence = probs.max(axis=1)
    wrong = np.flatnonzero(pred != np.asarray(labels))
    return wrong[np.argsort(-confidence[wrong])][:n]

@@tests
import numpy as np

probs = np.array([
    [0.7, 0.2, 0.1],    # predicted 0, label 0: right
    [0.1, 0.3, 0.6],    # predicted 2, label 1: wrong (0.6), label in top 2
    [0.9, 0.06, 0.04],  # predicted 0, label 2: wrong (0.9), label not in top 2
    [0.2, 0.5, 0.3],    # predicted 1, label 0: wrong (0.5), label not in top 2
])
labels = np.array([0, 1, 2, 0])

def test_top_k():
    """Top-1 is ordinary accuracy; top-3 of 3 classes is always 1"""
    assert np.isclose(top_k_accuracy(probs, labels, 1), 0.25)
    assert np.isclose(top_k_accuracy(probs, labels, 2), 0.5)
    assert np.isclose(top_k_accuracy(probs, labels, 3), 1.0)

def test_confident_mistakes():
    """Wrong predictions, most confident first"""
    assert list(confident_mistakes(probs, labels, 2)) == [2, 1]
    assert list(confident_mistakes(probs, labels, 10)) == [2, 1, 3]
:::

## Step 2: Packaging

A saved model is only usable if the application repeats the **exact** preprocessing used in training. The notebook saves it next to the weights:

```python static
torch.save(model.state_dict(), "fashion_net.pt")
metadata = {
    "architecture": "FashionNet",
    "classes": CLASSES,
    "input": {"size": [28, 28], "channels": 1, "mean": 0.2860, "std": 0.3530, "background": "black"},
    "test_accuracy": round(test_acc, 4),
}
json.dump(metadata, open("fashion_net.json", "w"), indent=2)
```

:::exercise ic-preprocess Preprocessing for inference
Write `preprocess(images, metadata)`. `images` is a uint8 array of shape `(n, 28, 28)` with values 0–255, and `metadata["input"]` has `"mean"` and `"std"`. Scale to 0–1, normalise with `(x - mean) / std`, and add a channel dimension, returning a float32 array of shape `(n, 1, 28, 28)`. Also write `top_class(logits, classes)`, which turns an `(n, n_classes)` array of logits into a list of `(class_name, probability)` tuples using a stable softmax.

@@starter
import numpy as np

def preprocess(images, metadata):
    return images

def top_class(logits, classes):
    return []

@@solution
import numpy as np

def preprocess(images, metadata):
    x = np.asarray(images, dtype=np.float32) / 255.0
    x = (x - metadata["input"]["mean"]) / metadata["input"]["std"]
    return x[:, None, :, :].astype(np.float32)

def top_class(logits, classes):
    z = logits - logits.max(axis=1, keepdims=True)
    p = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True)
    return [(classes[i], float(p[row, i])) for row, i in enumerate(p.argmax(axis=1))]

@@tests
import numpy as np

meta = {"input": {"mean": 0.2860, "std": 0.3530}}

def test_preprocess():
    """Shape, dtype and values"""
    images = np.zeros((3, 28, 28), dtype=np.uint8)
    images[0, 0, 0] = 255
    x = preprocess(images, meta)
    assert x.shape == (3, 1, 28, 28) and x.dtype == np.float32
    assert np.isclose(x[0, 0, 0, 0], (1 - 0.2860) / 0.3530, atol=1e-5)
    assert np.isclose(x[1, 0, 5, 5], -0.2860 / 0.3530, atol=1e-5)

def test_top_class():
    """Names and softmax probabilities"""
    out = top_class(np.array([[2.0, 0.0, 0.0], [0.0, 0.0, 1000.0]]), ["shirt", "bag", "boot"])
    assert out[0][0] == "shirt" and np.isclose(out[0][1], np.exp(2) / (np.exp(2) + 2))
    assert out[1] == ("boot", 1.0)
:::

## Step 3: A model card

Finish with a short model card (the notebook generates one): what the model does, the data it was trained on, its performance including the weakest classes, and its limitations. This one's main limitation is important: it expects images that look like Fashion-MNIST, a single centred item, greyscale, on a black background. A phone photo of a shirt on a bed would need retraining or fine-tuning on representative images. Saying so up front is part of doing the job properly.

## Going further

1. Train longer, or with a higher `max_lr`, changing one thing at a time and judging by validation accuracy.
2. Add `transforms.RandomRotation(10)` to the augmentation.
3. Try **test-time augmentation**: average the predicted probabilities for each test image and its mirror image.
4. Adapt a ResNet-18 to 1-channel 28×28 input and compare.
5. Keep the files: in Phase 8 you'll load `fashion_net.pt` and `fashion_net.json` into a web API.

:::tip Portfolio piece
A clean notebook (or repository) with the training code, the confusion matrix, a gallery of the most confident mistakes and the model card is a solid portfolio project. Error analysis is what hiring managers look for: it shows you understand what your model does, not just its accuracy.
:::

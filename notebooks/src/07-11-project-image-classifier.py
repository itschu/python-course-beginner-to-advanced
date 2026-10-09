# %% [markdown]
# # Project: an image classifier, end to end
#
# Companion notebook for **Phase 7, lesson 11** of the PyPath course.
#
# You'll train a CNN on Fashion-MNIST with augmentation and a learning-rate schedule, evaluate it
# properly (per-class accuracy, confusion matrix, error analysis), and package it for use in an
# application: saved weights, metadata, an inference function and a model card. In Phase 8 you'll
# serve a model like this from a web API.
#
# Choose *Runtime → Change runtime type → T4 GPU* first. Training takes several minutes on a GPU
# (much longer on a CPU).
#
# Tasks marked **Your turn** have check cells; reference solutions are at the bottom.

# %%
import copy
import json

import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import confusion_matrix
from torch import nn
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms

device = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(0)
print("device:", device)


def check(name, condition):
    try:
        ok = bool(condition())
    except Exception as error:
        ok, name = False, f"{name} ({type(error).__name__})"
    print(("✓ " if ok else "✗ ") + name)

# %% [markdown]
# ## 1. Data
#
# Images are normalised with the training set's mean and standard deviation (0.286 and 0.353 for
# Fashion-MNIST). Whatever preprocessing you use in training must be repeated exactly at
# prediction time, so it goes into the saved metadata later.

# %%
MEAN, STD = 0.2860, 0.3530
train_tf = transforms.Compose([transforms.RandomCrop(28, padding=2), transforms.RandomHorizontalFlip(),
                               transforms.ToTensor(), transforms.Normalize((MEAN,), (STD,))])
eval_tf = transforms.Compose([transforms.ToTensor(), transforms.Normalize((MEAN,), (STD,))])

augmented = datasets.FashionMNIST("data", train=True, download=True, transform=train_tf)
plain = datasets.FashionMNIST("data", train=True, download=True, transform=eval_tf)
test_set = datasets.FashionMNIST("data", train=False, download=True, transform=eval_tf)
CLASSES = plain.classes

order = torch.randperm(60_000, generator=torch.Generator().manual_seed(0))
train_loader = DataLoader(Subset(augmented, order[:54_000]), batch_size=128, shuffle=True, num_workers=2)
val_loader = DataLoader(Subset(plain, order[54_000:]), batch_size=512, num_workers=2)
test_loader = DataLoader(test_set, batch_size=512, num_workers=2)
print("classes:", CLASSES)

# %% [markdown]
# ## 2. The model
#
# Three convolutional blocks (32 → 64 → 128 channels), then **global average pooling**: each of
# the 128 final feature maps is averaged to a single number. That replaces a large dense layer,
# so the network has far fewer parameters than lesson 8's CNN.

# %%
def conv_block(c_in, c_out):
    return nn.Sequential(
        nn.Conv2d(c_in, c_out, 3, padding=1, bias=False), nn.BatchNorm2d(c_out), nn.ReLU(),
        nn.Conv2d(c_out, c_out, 3, padding=1, bias=False), nn.BatchNorm2d(c_out), nn.ReLU(),
        nn.MaxPool2d(2),
    )


class FashionNet(nn.Module):
    def __init__(self, n_classes=10):
        super().__init__()
        self.features = nn.Sequential(conv_block(1, 32), conv_block(32, 64), conv_block(64, 128))  # 128 x 3 x 3
        self.head = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(0.3), nn.Linear(128, n_classes))

    def forward(self, x):
        return self.head(self.features(x))


model = FashionNet().to(device)
print("parameters:", sum(p.numel() for p in model.parameters()))

# %% [markdown]
# ## 3. Training with a one-cycle schedule
#
# `OneCycleLR` warms the learning rate up, then anneals it down to almost zero by the last step.
# It often trains faster and more reliably than a constant rate. It's stepped after every batch,
# not every epoch.

# %%
EPOCHS = 12


@torch.no_grad()
def evaluate(model, loader):
    model.eval()
    correct, total_loss, all_logits, all_labels = 0, 0.0, [], []
    for X, y in loader:
        X, y = X.to(device), y.to(device)
        logits = model(X)
        total_loss += nn.functional.cross_entropy(logits, y, reduction="sum").item()
        correct += (logits.argmax(1) == y).sum().item()
        all_logits.append(logits.cpu())
        all_labels.append(y.cpu())
    n = len(loader.dataset)
    return total_loss / n, correct / n, torch.cat(all_logits), torch.cat(all_labels)


optimizer = torch.optim.AdamW(model.parameters(), lr=3e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.OneCycleLR(optimizer, max_lr=3e-3, epochs=EPOCHS, steps_per_epoch=len(train_loader))
best = {"val_loss": float("inf")}
for epoch in range(EPOCHS):
    model.train()
    for X, y in train_loader:
        X, y = X.to(device), y.to(device)
        loss = nn.functional.cross_entropy(model(X), y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        scheduler.step()
    val_loss, val_acc, _, _ = evaluate(model, val_loader)
    print(f"epoch {epoch:2d}: val loss {val_loss:.3f}, val accuracy {val_acc:.3f}")
    if val_loss < best["val_loss"]:
        best = {"val_loss": val_loss, "val_acc": val_acc, "epoch": epoch, "state": copy.deepcopy(model.state_dict())}
model.load_state_dict(best["state"])
print(f"best epoch {best['epoch']}: val accuracy {best['val_acc']:.3f}")

# %% [markdown]
# ## 4. Evaluation
#
# Evaluate on the test set **once**. Overall accuracy hides a lot, so look at each class.

# %%
test_loss, test_acc, test_logits, test_labels = evaluate(model, test_loader)
test_pred = test_logits.argmax(1)
print(f"test accuracy: {test_acc:.3f}")

cm = confusion_matrix(test_labels, test_pred)
plt.figure(figsize=(7, 6))
plt.imshow(cm, cmap="Blues")
plt.xticks(range(10), CLASSES, rotation=90)
plt.yticks(range(10), CLASSES)
for i in range(10):
    for j in range(10):
        plt.text(j, i, cm[i, j], ha="center", va="center", fontsize=7, color="white" if cm[i, j] > 500 else "black")
plt.xlabel("predicted")
plt.ylabel("true")
plt.tight_layout()
plt.show()

# %% [markdown]
# **Your turn 1.** Write `per_class_accuracy(labels, predictions, n_classes)`: a NumPy array with,
# for each class, the share of that class's examples predicted correctly. Which class is hardest?

# %%
def per_class_accuracy(labels, predictions, n_classes):
    ...  # YOUR CODE HERE

# %%
check("Your turn 1", lambda: np.allclose(per_class_accuracy(np.array([0, 0, 1, 1, 1]), np.array([0, 1, 1, 1, 0]), 2), [0.5, 2 / 3]))

# %% [markdown]
# ### The most confident mistakes
#
# Looking at errors is the best way to find out what to improve: bad labels, genuinely
# ambiguous images, or a real weakness of the model.

# %%
probs = torch.softmax(test_logits, dim=1)
confidence = probs.max(1).values
wrong = torch.nonzero(test_pred != test_labels).squeeze(1)
worst = wrong[confidence[wrong].argsort(descending=True)[:10]]
raw_test = datasets.FashionMNIST("data", train=False, download=True)      # un-normalised, for display
fig, axes = plt.subplots(2, 5, figsize=(11, 5))
for ax, i in zip(axes.ravel(), worst.tolist()):
    ax.imshow(raw_test[i][0], cmap="gray_r")
    ax.set_title(f"true: {CLASSES[test_labels[i]]}\npred: {CLASSES[test_pred[i]]} ({confidence[i]:.0%})", fontsize=8)
    ax.axis("off")
plt.tight_layout()
plt.show()

# %% [markdown]
# ## 5. Packaging the model
#
# An application needs three things: the weights, the exact preprocessing, and the class names.
# Save the metadata next to the weights.

# %%
torch.save(model.state_dict(), "fashion_net.pt")
metadata = {
    "architecture": "FashionNet",
    "classes": CLASSES,
    "input": {"size": [28, 28], "channels": 1, "mean": MEAN, "std": STD, "background": "black"},
    "test_accuracy": round(test_acc, 4),
    "trained_epochs": EPOCHS,
}
with open("fashion_net.json", "w") as f:
    json.dump(metadata, f, indent=2)
print(json.dumps(metadata, indent=2))

# %% [markdown]
# **Your turn 2.** Write `predict(model, images, metadata)`. `images` is a uint8 NumPy array of
# shape `(n, 28, 28)` with values 0–255. Scale to 0–1, normalise with the metadata's mean and std,
# add the channel dimension, run the model in eval mode without gradients, and return a list of
# `(class_name, probability)` tuples for the top class of each image.

# %%
def predict(model, images, metadata):
    ...  # YOUR CODE HERE

# %%
sample = raw_test.data[:5].numpy()
check("Your turn 2", lambda: [name for name, _ in predict(model, sample, metadata)] ==
      [CLASSES[i] for i in test_pred[:5].tolist()] and all(0 < p <= 1 for _, p in predict(model, sample, metadata)))

# %% [markdown]
# ## 6. Model card
#
# Write down what the model is for and where it shouldn't be used.

# %%
card = f"""# FashionNet: clothing image classifier

**Task:** classify a 28×28 greyscale image of a single clothing item into one of 10 classes.
**Data:** Fashion-MNIST (60,000 training images, 10,000 test images).
**Performance:** {test_acc:.1%} test accuracy. Hardest classes: shirt, T-shirt/top, pullover and coat,
which are often confused with each other (see the confusion matrix).
**Limitations:** expects centred items on a black background, like Fashion-MNIST. Real photos
(colour, clutter, different backgrounds) will need retraining or fine-tuning on representative data.
"""
print(card)

# %% [markdown]
# ## Ideas to go further
#
# 1. Train for more epochs, or try `max_lr=1e-2`. Change one thing at a time and judge by validation accuracy.
# 2. Add `transforms.RandomRotation(10)` to the augmentation.
# 3. Replace FashionNet with a ResNet-18 adapted to 1-channel 28×28 inputs.
# 4. **Test-time augmentation:** average the predictions for each test image and its mirror image.
#
# ## Solutions

# %%
def per_class_accuracy(labels, predictions, n_classes):
    labels, predictions = np.asarray(labels), np.asarray(predictions)
    return np.array([(predictions[labels == c] == c).mean() for c in range(n_classes)])


def predict(model, images, metadata):
    x = torch.tensor(images, dtype=torch.float32) / 255.0
    x = ((x - metadata["input"]["mean"]) / metadata["input"]["std"]).unsqueeze(1).to(device)
    model.eval()
    with torch.no_grad():
        probs = torch.softmax(model(x), dim=1).cpu()
    top_p, top_i = probs.max(1)
    return [(metadata["classes"][i], float(p)) for p, i in zip(top_p.tolist(), top_i.tolist())]


check("Your turn 1", lambda: np.allclose(per_class_accuracy(np.array([0, 0, 1, 1, 1]), np.array([0, 1, 1, 1, 0]), 2), [0.5, 2 / 3]))
check("Your turn 2", lambda: [name for name, _ in predict(model, sample, metadata)] ==
      [CLASSES[i] for i in test_pred[:5].tolist()] and all(0 < p <= 1 for _, p in predict(model, sample, metadata)))
print("per-class test accuracy:")
for name, acc in zip(CLASSES, per_class_accuracy(test_labels.numpy(), test_pred.numpy(), 10)):
    print(f"  {name:>12}: {acc:.3f}")

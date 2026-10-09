# %% [markdown]
# # Training loops, validation and early stopping
#
# Companion notebook for **Phase 7, lesson 7** of the PyPath course.
#
# Choose *Runtime → Change runtime type → T4 GPU* first. On a CPU, training takes a few minutes.

# %%
import copy

import matplotlib.pyplot as plt
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset, random_split
from torchvision import datasets
from torchvision.transforms import ToTensor

DATA_URL = "https://raw.githubusercontent.com/itschu/python-course-beginner-to-advanced/main/public/data/"
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
# ## 1. Datasets and DataLoaders
#
# **Fashion-MNIST**: 70,000 greyscale 28×28 images of clothing in 10 classes. A `Dataset` returns one
# `(image, label)` pair at a time; a `DataLoader` batches and shuffles them.

# %%
full_train = datasets.FashionMNIST(root="data", train=True, download=True, transform=ToTensor())
test_set = datasets.FashionMNIST(root="data", train=False, download=True, transform=ToTensor())
train_set, val_set = random_split(full_train, [50_000, 10_000], generator=torch.Generator().manual_seed(0))
classes = full_train.classes
print(len(train_set), "training,", len(val_set), "validation,", len(test_set), "test images")

image, label = train_set[0]
print("one image:", tuple(image.shape), "| label:", label, classes[label])

train_loader = DataLoader(train_set, batch_size=128, shuffle=True)
val_loader = DataLoader(val_set, batch_size=512)
test_loader = DataLoader(test_set, batch_size=512)
images, labels = next(iter(train_loader))
print("one batch:", tuple(images.shape), tuple(labels.shape))

# %%
fig, axes = plt.subplots(1, 8, figsize=(12, 2))
for ax, img, lab in zip(axes, images, labels):
    ax.imshow(img.squeeze(), cmap="gray_r")
    ax.set_title(classes[lab], fontsize=8)
    ax.axis("off")
plt.show()

# %% [markdown]
# ## 2. A model, and functions for one epoch
#
# `model.train()` switches dropout on; `model.eval()` switches it off. `torch.no_grad()` skips
# gradient tracking during evaluation, which saves memory and time.

# %%
def make_mlp():
    return nn.Sequential(
        nn.Flatten(),                       # 1x28x28 image -> 784 numbers
        nn.Linear(784, 256), nn.ReLU(), nn.Dropout(0.2),
        nn.Linear(256, 10),                 # 10 logits, one per class
    )


def train_one_epoch(model, loader, loss_fn, optimizer):
    model.train()
    total = 0.0
    for X, y in loader:
        X, y = X.to(device), y.to(device)
        loss = loss_fn(model(X), y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        total += loss.item() * len(y)
    return total / len(loader.dataset)


@torch.no_grad()
def evaluate(model, loader, loss_fn):
    model.eval()
    total_loss, correct = 0.0, 0
    for X, y in loader:
        X, y = X.to(device), y.to(device)
        logits = model(X)
        total_loss += loss_fn(logits, y).item() * len(y)
        correct += (logits.argmax(dim=1) == y).sum().item()
    return total_loss / len(loader.dataset), correct / len(loader.dataset)

# %% [markdown]
# ## 3. Training with early stopping
#
# After every epoch: evaluate on the validation set, keep a copy of the best weights, and stop when
# the validation loss hasn't improved for `patience` epochs. A learning-rate scheduler halves the
# learning rate when progress stalls.

# %%
def fit(model, epochs=30, lr=1e-3, patience=3):
    loss_fn = nn.CrossEntropyLoss()        # softmax + cross-entropy, from logits
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=1)
    history, best_loss, best_state, best_epoch = [], float("inf"), None, 0
    for epoch in range(epochs):
        train_loss = train_one_epoch(model, train_loader, loss_fn, optimizer)
        val_loss, val_acc = evaluate(model, val_loader, loss_fn)
        scheduler.step(val_loss)
        history.append((train_loss, val_loss, val_acc))
        print(f"epoch {epoch:2d}: train loss {train_loss:.3f}, val loss {val_loss:.3f}, val accuracy {val_acc:.3f}")
        if val_loss < best_loss:
            best_loss, best_epoch, best_state = val_loss, epoch, copy.deepcopy(model.state_dict())
        elif epoch - best_epoch >= patience:
            print(f"early stop: no improvement since epoch {best_epoch}")
            break
    model.load_state_dict(best_state)
    return history


model = make_mlp().to(device)
history = fit(model)

# %%
plt.plot([h[0] for h in history], label="training loss")
plt.plot([h[1] for h in history], label="validation loss")
plt.xlabel("epoch")
plt.legend()
plt.show()

test_loss, test_acc = evaluate(model, test_loader, nn.CrossEntropyLoss())
print(f"test accuracy (evaluated once, at the end): {test_acc:.3f}")

# %% [markdown]
# ## 4. Saving and loading
#
# Save the `state_dict` (the weights), not the whole model object. To load, build the same
# architecture and load the weights into it.

# %%
torch.save(model.state_dict(), "fashion_mlp.pt")

restored = make_mlp().to(device)
restored.load_state_dict(torch.load("fashion_mlp.pt", map_location=device))
print("restored model test accuracy:", round(evaluate(restored, test_loader, nn.CrossEntropyLoss())[1], 3))

# %% [markdown]
# ## Exercises
#
# **Exercise 1.** Write a `Dataset` for a pandas DataFrame: `HousesDataset(df)` should return
# `(features, price)` where `features` is a float32 tensor of the columns
# `size_sqm, bedrooms, bathrooms, age_years, distance_km, has_garden`, and `price` is a float32
# scalar tensor of the price in thousands.

# %%
houses = pd.read_csv(DATA_URL + "houses.csv")

class HousesDataset(Dataset):
    COLUMNS = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]

    def __init__(self, df):
        ...  # YOUR CODE HERE

    def __len__(self):
        ...  # YOUR CODE HERE

    def __getitem__(self, i):
        ...  # YOUR CODE HERE

# %%
check("Exercise 1", lambda: len(HousesDataset(houses)) == 800
      and HousesDataset(houses)[0][0].shape == (6,) and HousesDataset(houses)[0][0].dtype == torch.float32
      and abs(HousesDataset(houses)[0][1].item() - houses["price"].iloc[0] / 1000) < 1e-3)

# %% [markdown]
# **Exercise 2.** Write `accuracy(logits, labels)` that returns the fraction of rows whose
# highest logit is at the correct label, as a Python float.

# %%
def accuracy(logits, labels):
    ...  # YOUR CODE HERE

# %%
check("Exercise 2", lambda: abs(accuracy(torch.tensor([[2.0, 1.0], [0.0, 3.0], [1.0, 0.0]]),
                                         torch.tensor([0, 1, 1])) - 2 / 3) < 1e-6)

# %% [markdown]
# **Exercise 3 (open-ended).** Add a second hidden layer of 128 units to `make_mlp`, or try a
# learning rate of `3e-3`. Retrain, and compare validation accuracy. Change one thing at a time,
# and only look at the test set for your final choice.

# %% [markdown]
# ## Solutions

# %%
class HousesDataset(Dataset):
    COLUMNS = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]

    def __init__(self, df):
        self.X = torch.tensor(df[self.COLUMNS].to_numpy(), dtype=torch.float32)
        self.y = torch.tensor(df["price"].to_numpy() / 1000, dtype=torch.float32)

    def __len__(self):
        return len(self.y)

    def __getitem__(self, i):
        return self.X[i], self.y[i]


def accuracy(logits, labels):
    return (logits.argmax(dim=1) == labels).float().mean().item()


check("Exercise 1", lambda: len(HousesDataset(houses)) == 800
      and HousesDataset(houses)[0][0].shape == (6,) and HousesDataset(houses)[0][0].dtype == torch.float32
      and abs(HousesDataset(houses)[0][1].item() - houses["price"].iloc[0] / 1000) < 1e-3)
check("Exercise 2", lambda: abs(accuracy(torch.tensor([[2.0, 1.0], [0.0, 3.0], [1.0, 0.0]]),
                                         torch.tensor([0, 1, 1])) - 2 / 3) < 1e-6)

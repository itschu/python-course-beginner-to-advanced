---
title: Training loops, validation and early stopping
summary: Load data with Dataset and DataLoader, write reusable train and evaluate functions, use a validation set with early stopping and a learning-rate scheduler, and save and reload models, on 70,000 images of clothing.
minutes: 60
kind: lesson
colab: notebooks/07-07-training-loops.ipynb
---

Real training runs need more structure than the five-step loop: data that doesn't fit in one tensor, separate training and evaluation modes, a validation set, early stopping, and saving the best model. This lesson builds the training loop you'll reuse for the rest of the phase, on **Fashion-MNIST**: 70,000 greyscale 28×28 images of clothing in 10 classes (T-shirt, trouser, pullover, dress, coat, sandal, shirt, sneaker, bag, ankle boot).

:::colab Run the notebook
Open the companion notebook with the **Open in Colab** button at the top of the page, and switch to a GPU runtime. Training takes a minute or two on a GPU (a few minutes on a CPU).
:::

## Dataset and DataLoader

A **`Dataset`** knows how many examples there are and how to fetch example `i`. A **`DataLoader`** wraps it to produce shuffled mini-batches. `torchvision` ships Fashion-MNIST as a ready-made dataset:

```python static
from torch.utils.data import DataLoader, random_split
from torchvision import datasets
from torchvision.transforms import ToTensor

full_train = datasets.FashionMNIST(root="data", train=True, download=True, transform=ToTensor())
test_set = datasets.FashionMNIST(root="data", train=False, download=True, transform=ToTensor())
train_set, val_set = random_split(full_train, [50_000, 10_000], generator=torch.Generator().manual_seed(0))

train_loader = DataLoader(train_set, batch_size=128, shuffle=True)
val_loader = DataLoader(val_set, batch_size=512)
images, labels = next(iter(train_loader))
print(images.shape, labels.shape)      # torch.Size([128, 1, 28, 28]) torch.Size([128])
```

`ToTensor()` converts each image to a float tensor of shape (channels, height, width) with values from 0 to 1. Image tensors in PyTorch are always **channels first**.

For your own data, write a small class with `__len__` and `__getitem__`:

```python static
from torch.utils.data import Dataset

class HousesDataset(Dataset):
    COLUMNS = ["size_sqm", "bedrooms", "bathrooms", "age_years", "distance_km", "has_garden"]

    def __init__(self, df):
        self.X = torch.tensor(df[self.COLUMNS].to_numpy(), dtype=torch.float32)
        self.y = torch.tensor(df["price"].to_numpy() / 1000, dtype=torch.float32)

    def __len__(self):
        return len(self.y)

    def __getitem__(self, i):
        return self.X[i], self.y[i]
```

## Train and evaluate functions

Two modes matter:

- `model.train()` turns on training behaviour: dropout active, batch normalisation updating its statistics.
- `model.eval()` turns it off for evaluation. Forgetting this is a classic bug: dropout stays on at test time and scores look randomly worse.

```python static
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
```

`loss.item()` turns a one-element tensor into a Python number. Accumulating `loss` itself (the tensor) would keep the whole computation graph alive and eat memory.

## Early stopping and learning-rate schedules

The model is a simple MLP: flatten the image into 784 numbers, one hidden layer of 256 units with dropout, and 10 outputs. The `fit` function evaluates on the validation set after each epoch, keeps a copy of the best weights, and stops after three epochs without improvement:

```python static
import copy

def make_mlp():
    return nn.Sequential(
        nn.Flatten(),
        nn.Linear(784, 256), nn.ReLU(), nn.Dropout(0.2),
        nn.Linear(256, 10),
    )

def fit(model, epochs=30, lr=1e-3, patience=3):
    loss_fn = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=1)
    best_loss, best_state, best_epoch = float("inf"), None, 0
    for epoch in range(epochs):
        train_loss = train_one_epoch(model, train_loader, loss_fn, optimizer)
        val_loss, val_acc = evaluate(model, val_loader, loss_fn)
        scheduler.step(val_loss)                  # halve the learning rate if progress stalls
        if val_loss < best_loss:
            best_loss, best_epoch, best_state = val_loss, epoch, copy.deepcopy(model.state_dict())
        elif epoch - best_epoch >= patience:
            break
    model.load_state_dict(best_state)             # restore the best epoch's weights
    return model
```

A **learning-rate scheduler** changes the learning rate during training. `ReduceLROnPlateau` halves it whenever the validation loss stops improving, letting the optimiser take finer steps once it's close to a good solution. Others decay it on a fixed schedule (`StepLR`, `CosineAnnealingLR`) or warm it up first, which is standard for transformers.

When we ran it, training stopped after 23 epochs, with the best validation loss at epoch 19 and **about 89% test accuracy**. Your numbers will differ slightly: GPUs aren't perfectly deterministic, and the random seed only fixes so much. You'll see the validation loss improve sharply right after the scheduler halves the learning rate.

`copy.deepcopy(model.state_dict())` matters: a plain `model.state_dict()` returns references to the live weights, which keep changing as training continues.

## Saving and loading

Save the **state dict** (a dictionary of weight tensors), not the model object. To load, build the same architecture and load the weights into it:

```python static
torch.save(model.state_dict(), "fashion_mlp.pt")

restored = make_mlp().to(device)
restored.load_state_dict(torch.load("fashion_mlp.pt", map_location=device))
restored.eval()                                    # ready for predictions
```

`map_location` lets a model trained on a GPU load on a CPU-only machine, such as the API server you'll build in Phase 8.

## Reproducibility

`torch.manual_seed(0)` fixes the initial weights and the shuffling order, so reruns on the same machine are close to identical. Pass a seeded `generator` to `random_split` so the train/validation split never changes between runs. That stops validation scores moving just because different images landed in the validation set.

## Practice in the notebook

1. Write `HousesDataset` for the course's house-price data.
2. Write `accuracy(logits, labels)`.
3. Experiment: add a second hidden layer, or change the learning rate, judging by validation accuracy.

:::quiz loops-quiz Quick check
? You forget `model.eval()` before measuring test accuracy on a model with dropout. What happens?
- [x] Dropout stays active, so predictions are noisier and accuracy usually looks worse
- [ ] Nothing changes
- [ ] The model trains on the test set
> Always switch modes: `model.train()` for training, `model.eval()` for evaluation.

? Why accumulate `loss.item()` rather than `loss` in the training loop?
- [x] The tensor keeps its computation graph alive, wasting memory
- [ ] `.item()` is more accurate
- [ ] `loss` can't be added up
> `.item()` returns a plain Python float.

? What does `ReduceLROnPlateau` do?
- [x] Lowers the learning rate when the validation loss stops improving
- [ ] Stops training early
- [ ] Increases the batch size
> Smaller steps help the optimiser settle into a good solution.

? Why save `model.state_dict()` rather than the whole model with `torch.save(model)`?
- [x] The weights are portable; pickling the whole object ties the file to your exact code
- [ ] State dicts are encrypted
- [ ] `torch.save(model)` doesn't save the weights
> Rebuild the architecture in code, then load the weights into it.
:::

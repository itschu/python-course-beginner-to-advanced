# %% [markdown]
# # Convolutional neural networks and transfer learning
#
# Companion notebook for **Phase 7, lesson 8** of the PyPath course.
#
# Choose *Runtime → Change runtime type → T4 GPU* first. Part 1 trains in a few minutes on a GPU;
# part 2 (transfer learning) really needs one.

# %%
import copy

import matplotlib.pyplot as plt
import numpy as np
import torch
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
# ## Part 1: a CNN for Fashion-MNIST
#
# ### Data, with augmentation
#
# **Data augmentation** makes small random changes to training images (shifts, flips) so the model
# sees a slightly different version every epoch. Validation and test images are never augmented.
# Two copies of the dataset with different transforms share the same train/validation split.

# %%
train_tf = transforms.Compose([
    transforms.RandomCrop(28, padding=2),       # shift by up to 2 pixels
    transforms.RandomHorizontalFlip(),          # clothes look the same mirrored
    transforms.ToTensor(),
])
plain_tf = transforms.ToTensor()

augmented = datasets.FashionMNIST("data", train=True, download=True, transform=train_tf)
plain = datasets.FashionMNIST("data", train=True, download=True, transform=plain_tf)
test_set = datasets.FashionMNIST("data", train=False, download=True, transform=plain_tf)

order = torch.randperm(60_000, generator=torch.Generator().manual_seed(0))
train_set, val_set = Subset(augmented, order[:50_000]), Subset(plain, order[50_000:])
train_loader = DataLoader(train_set, batch_size=128, shuffle=True, num_workers=2)
val_loader = DataLoader(val_set, batch_size=512, num_workers=2)
test_loader = DataLoader(test_set, batch_size=512, num_workers=2)
classes = plain.classes

# %% [markdown]
# ### The model
#
# Each block is convolution → batch normalisation → ReLU → max pooling. Convolutions find local
# patterns with a small set of shared weights; pooling halves the image size so later layers see
# larger regions. **Batch normalisation** rescales each channel's activations during training,
# which makes deeper networks train faster and more reliably.

# %%
class SmallCNN(nn.Module):
    def __init__(self, n_classes=10):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2),   # 32x14x14
            nn.Conv2d(32, 64, kernel_size=3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2),  # 64x7x7
        )
        self.classifier = nn.Sequential(
            nn.Flatten(), nn.Dropout(0.3),
            nn.Linear(64 * 7 * 7, 128), nn.ReLU(),
            nn.Linear(128, n_classes),
        )

    def forward(self, x):
        return self.classifier(self.features(x))


model = SmallCNN().to(device)
print("parameters:", sum(p.numel() for p in model.parameters()))
print("output for a batch of 2:", tuple(model(torch.zeros(2, 1, 28, 28, device=device)).shape))

# %% [markdown]
# ### Training (same loop as lesson 7)

# %%
def run_epoch(model, loader, loss_fn, optimizer=None):
    """Trains if an optimizer is given, otherwise evaluates. Returns (loss, accuracy)."""
    training = optimizer is not None
    model.train(training)
    total_loss, correct = 0.0, 0
    with torch.set_grad_enabled(training):
        for X, y in loader:
            X, y = X.to(device), y.to(device)
            logits = model(X)
            loss = loss_fn(logits, y)
            if training:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            total_loss += loss.item() * len(y)
            correct += (logits.argmax(1) == y).sum().item()
    return total_loss / len(loader.dataset), correct / len(loader.dataset)


def fit(model, train_loader, val_loader, epochs=15, lr=1e-3, patience=3):
    loss_fn = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=1)
    best_loss, best_epoch, best_state = float("inf"), 0, None
    for epoch in range(epochs):
        train_loss, train_acc = run_epoch(model, train_loader, loss_fn, optimizer)
        val_loss, val_acc = run_epoch(model, val_loader, loss_fn)
        scheduler.step(val_loss)
        print(f"epoch {epoch:2d}: train acc {train_acc:.3f}, val loss {val_loss:.3f}, val acc {val_acc:.3f}")
        if val_loss < best_loss:
            best_loss, best_epoch, best_state = val_loss, epoch, copy.deepcopy(model.state_dict())
        elif epoch - best_epoch >= patience:
            break
    model.load_state_dict(best_state)
    return model


model = fit(SmallCNN().to(device), train_loader, val_loader)
test_loss, test_acc = run_epoch(model, test_loader, nn.CrossEntropyLoss())
print(f"test accuracy: {test_acc:.3f}")

# %% [markdown]
# ### What did the first layer learn?
#
# Each of the 32 first-layer filters is a 3×3 grid of weights. Many look like edge or stripe
# detectors, the same kind of filters you applied by hand in the lesson.

# %%
filters = model.features[0].weight.detach().cpu()[:, 0]
fig, axes = plt.subplots(4, 8, figsize=(8, 4))
for ax, f in zip(axes.ravel(), filters):
    ax.imshow(f, cmap="RdBu")
    ax.axis("off")
plt.show()

# %% [markdown]
# **Exercise 1.** Write `conv_output_size(size, kernel, padding=0, stride=1)`, the side length of a
# convolution's output: $\lfloor (size + 2 \cdot padding - kernel) / stride \rfloor + 1$. Check it
# against PyTorch.

# %%
def conv_output_size(size, kernel, padding=0, stride=1):
    ...  # YOUR CODE HERE

# %%
check("Exercise 1", lambda: conv_output_size(28, 3, padding=1) == 28 and conv_output_size(28, 5) == 24
      and conv_output_size(32, 3, padding=1, stride=2) == nn.Conv2d(1, 1, 3, padding=1, stride=2)(torch.zeros(1, 1, 32, 32)).shape[-1])

# %% [markdown]
# ## Part 2: transfer learning
#
# Training a big CNN from scratch needs millions of images. **Transfer learning** starts from a
# network already trained on ImageNet (1.2 million photos, 1,000 classes), whose early layers have
# learned general features such as edges, textures and shapes. You replace the last layer with
# one for your classes and fine-tune.
#
# Here: a ResNet-18 fine-tuned on **CIFAR-10** (32×32 colour photos of planes, cars, birds, cats…).
# To keep it quick, it uses 10,000 training images and upsamples them to 128×128.

# %%
from torchvision.models import ResNet18_Weights, resnet18

weights = ResNet18_Weights.DEFAULT
imagenet_norm = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
cifar_train_tf = transforms.Compose([transforms.Resize(128), transforms.RandomHorizontalFlip(),
                                     transforms.ToTensor(), imagenet_norm])
cifar_test_tf = transforms.Compose([transforms.Resize(128), transforms.ToTensor(), imagenet_norm])

cifar_train = datasets.CIFAR10("data", train=True, download=True, transform=cifar_train_tf)
cifar_val = datasets.CIFAR10("data", train=True, download=True, transform=cifar_test_tf)
cifar_test = datasets.CIFAR10("data", train=False, download=True, transform=cifar_test_tf)
order = torch.randperm(50_000, generator=torch.Generator().manual_seed(0))
small_train = DataLoader(Subset(cifar_train, order[:10_000]), batch_size=64, shuffle=True, num_workers=2)
small_val = DataLoader(Subset(cifar_val, order[10_000:12_000]), batch_size=256, num_workers=2)
cifar_test_loader = DataLoader(Subset(cifar_test, range(2_000)), batch_size=256, num_workers=2)

# %%
def make_resnet(pretrained):
    net = resnet18(weights=weights if pretrained else None)
    net.fc = nn.Linear(net.fc.in_features, 10)      # new head for 10 classes
    return net.to(device)

# Step 1: freeze the pretrained body and train only the new head
net = make_resnet(pretrained=True)
for name, p in net.named_parameters():
    p.requires_grad = name.startswith("fc.")
net = fit(net, small_train, small_val, epochs=2, lr=1e-3)

# Step 2: unfreeze everything and fine-tune gently with a small learning rate
for p in net.parameters():
    p.requires_grad = True
net = fit(net, small_train, small_val, epochs=3, lr=1e-4)
print(f"pretrained ResNet-18, test accuracy: {run_epoch(net, cifar_test_loader, nn.CrossEntropyLoss())[1]:.3f}")

# %%
# For comparison: the same network from random weights, same data and epochs
scratch = fit(make_resnet(pretrained=False), small_train, small_val, epochs=5, lr=1e-3)
print(f"ResNet-18 from scratch, test accuracy: {run_epoch(scratch, cifar_test_loader, nn.CrossEntropyLoss())[1]:.3f}")

# %% [markdown]
# With only 10,000 images and a few epochs, the pretrained network should be far ahead.
# That's why transfer learning is the default for real image projects: start from pretrained
# weights unless you have a very good reason not to.
#
# **Exercise 2.** Count how many parameters are trainable after freezing everything except
# the head (`fc`). Write `count_trainable(model)`.

# %%
def count_trainable(model):
    ...  # YOUR CODE HERE

# %%
frozen = make_resnet(pretrained=False)
for name, p in frozen.named_parameters():
    p.requires_grad = name.startswith("fc.")
check("Exercise 2", lambda: count_trainable(frozen) == 512 * 10 + 10)

# %% [markdown]
# ## Solutions

# %%
def conv_output_size(size, kernel, padding=0, stride=1):
    return (size + 2 * padding - kernel) // stride + 1


def count_trainable(model):
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


check("Exercise 1", lambda: conv_output_size(28, 3, padding=1) == 28 and conv_output_size(28, 5) == 24
      and conv_output_size(32, 3, padding=1, stride=2) == nn.Conv2d(1, 1, 3, padding=1, stride=2)(torch.zeros(1, 1, 32, 32)).shape[-1])
check("Exercise 2", lambda: count_trainable(frozen) == 512 * 10 + 10)

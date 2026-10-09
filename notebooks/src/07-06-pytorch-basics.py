# %% [markdown]
# # PyTorch fundamentals
#
# Companion notebook for **Phase 7, lesson 6** of the PyPath course.
#
# **Before you start:** in Colab, choose *Runtime → Change runtime type → T4 GPU*. Everything also
# runs on a CPU, just more slowly.
#
# Exercises are marked **Exercise**. Each has a check cell that prints ✓ when your answer is right.
# Solutions are at the bottom.

# %%
import numpy as np
import torch
from torch import nn

device = "cuda" if torch.cuda.is_available() else "cpu"
print("PyTorch", torch.__version__, "| device:", device)


def check(name, condition):
    """Print ✓ or ✗ for an exercise without stopping the notebook."""
    try:
        ok = bool(condition())
    except Exception as error:  # an unfinished exercise usually raises
        ok, name = False, f"{name} ({type(error).__name__})"
    print(("✓ " if ok else "✗ ") + name)

# %% [markdown]
# ## 1. Tensors
#
# A tensor is PyTorch's NumPy array: same idea, plus GPU support and automatic gradients.

# %%
a = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
b = torch.ones(2, 2)
print(a + b)
print(a @ b)                       # matrix multiplication, as in NumPy
print(a.shape, a.dtype, a.device)

x = torch.arange(12).reshape(3, 4)
print(x)
print("row 1:", x[1], "| column 2:", x[:, 2])
print("broadcasting:", (x + torch.tensor([10, 20, 30, 40]))[0])

# %%
# NumPy interop: from_numpy shares memory with the array; .numpy() goes back (CPU tensors only)
arr = np.array([1.0, 2.0, 3.0])
t = torch.from_numpy(arr)
arr[0] = 100.0
print(t)                            # changed too: same memory
print(t.numpy(), type(t.numpy()))

# Moving to the GPU (a no-op on a CPU runtime)
t_device = torch.randn(3, 3).to(device)
print(t_device.device)

# %% [markdown]
# ## 2. Autograd
#
# Set `requires_grad=True` and PyTorch records every operation. `backward()` then runs
# backpropagation and stores gradients in `.grad`. This is the single neuron from lesson 3:
# the gradients should match the values you computed by hand there (−0.620051 and −0.310026) to
# about six decimal places. PyTorch uses 32-bit floats by default, NumPy 64-bit.

# %%
x_in, y_true = torch.tensor(2.0), torch.tensor(1.0)
w = torch.tensor(0.5, requires_grad=True)
b = torch.tensor(-0.2, requires_grad=True)

a = torch.sigmoid(w * x_in + b)
loss = -(y_true * torch.log(a) + (1 - y_true) * torch.log(1 - a))
loss.backward()
print(f"dL/dw = {w.grad.item():.6f}, dL/db = {b.grad.item():.6f}")

# %%
# Gradients accumulate: call backward twice and they add up. That's why training loops
# call optimizer.zero_grad() every step.
w = torch.tensor(3.0, requires_grad=True)
(w ** 2).backward()
print("after one backward:", w.grad.item())
(w ** 2).backward()
print("after two backwards:", w.grad.item())

# Turn tracking off when you don't need gradients (evaluation, inference)
with torch.no_grad():
    y = w * 2
print("requires_grad inside no_grad:", y.requires_grad)

# %% [markdown]
# **Exercise 1.** Use autograd to compute the derivative of $f(x) = x^3 + 2x$ at $x = 2$.
# (By hand: $3x^2 + 2 = 14$.)

# %%
def derivative_at_two():
    x = torch.tensor(2.0, requires_grad=True)
    ...  # YOUR CODE HERE: compute f, call backward, return x.grad as a float

# %%
check("Exercise 1", lambda: abs(derivative_at_two() - 14.0) < 1e-6)

# %% [markdown]
# ## 3. Models with `nn.Module`
#
# A model is a class that creates its layers in `__init__` and says how to use them in `forward`.
# This is the two-layer network from lesson 3, which you built by hand in NumPy.

# %%
class MoonsNet(nn.Module):
    def __init__(self, n_hidden=16):
        super().__init__()
        self.hidden = nn.Linear(2, n_hidden)
        self.out = nn.Linear(n_hidden, 1)

    def forward(self, x):
        return self.out(torch.relu(self.hidden(x))).squeeze(1)   # raw scores (logits)


model = MoonsNet()
print(model)
print("parameters:", sum(p.numel() for p in model.parameters()))

# %% [markdown]
# ## 4. A training loop
#
# The same five steps as your NumPy loop: forward, loss, zero the gradients, backward, step.

# %%
from sklearn.datasets import make_moons
from sklearn.model_selection import train_test_split

X, y = make_moons(n_samples=600, noise=0.25, random_state=0)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=0)
X_train, X_test = torch.tensor(X_train, dtype=torch.float32), torch.tensor(X_test, dtype=torch.float32)
y_train, y_test = torch.tensor(y_train, dtype=torch.float32), torch.tensor(y_test, dtype=torch.float32)

torch.manual_seed(0)
model = MoonsNet().to(device)
loss_fn = nn.BCEWithLogitsLoss()          # sigmoid + log loss in one, numerically stable
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
X_train, y_train, X_test, y_test = X_train.to(device), y_train.to(device), X_test.to(device), y_test.to(device)

for step in range(500):
    logits = model(X_train)               # 1. forward
    loss = loss_fn(logits, y_train)       # 2. loss
    optimizer.zero_grad()                 # 3. clear old gradients
    loss.backward()                       # 4. backpropagation
    optimizer.step()                      # 5. update every weight
    if step % 100 == 0:
        print(f"step {step:3d}: loss {loss.item():.3f}")

model.eval()
with torch.no_grad():
    accuracy = ((model(X_test) > 0).float() == y_test).float().mean().item()
print(f"test accuracy: {accuracy:.3f}")

# %%
import matplotlib.pyplot as plt

xx, yy = np.meshgrid(np.linspace(-2, 3, 200), np.linspace(-1.5, 2, 200))
grid = torch.tensor(np.c_[xx.ravel(), yy.ravel()], dtype=torch.float32).to(device)
with torch.no_grad():
    probs = torch.sigmoid(model(grid)).cpu().numpy().reshape(xx.shape)
plt.contourf(xx, yy, probs, levels=20, cmap="RdBu", alpha=0.6)
plt.scatter(X[:, 0], X[:, 1], c=y, cmap="RdBu", edgecolor="k", s=12)
plt.title("PyTorch network on the moons")
plt.show()

# %% [markdown]
# **Exercise 2.** Build the same architecture with `nn.Sequential` instead of a class:
# Linear(2 → 16), ReLU, Linear(16 → 1). It should have the same number of parameters as `MoonsNet`.

# %%
def make_sequential():
    ...  # YOUR CODE HERE: return an nn.Sequential

# %%
check("Exercise 2", lambda: sum(p.numel() for p in make_sequential().parameters()) == 65
      and make_sequential()(torch.zeros(5, 2)).shape == (5, 1))

# %% [markdown]
# **Exercise 3.** Write `train_steps(model, X, y, steps, lr)` that trains any binary classifier
# returning logits of shape `(n,)` with `BCEWithLogitsLoss` and SGD, and returns the final loss as a float.

# %%
def train_steps(model, X, y, steps, lr):
    ...  # YOUR CODE HERE

# %%
torch.manual_seed(1)
check("Exercise 3", lambda: train_steps(MoonsNet().to(device), X_train, y_train, 300, 0.5) < 0.35)

# %% [markdown]
# ## Solutions

# %%
def derivative_at_two():
    x = torch.tensor(2.0, requires_grad=True)
    f = x ** 3 + 2 * x
    f.backward()
    return x.grad.item()


def make_sequential():
    return nn.Sequential(nn.Linear(2, 16), nn.ReLU(), nn.Linear(16, 1))


def train_steps(model, X, y, steps, lr):
    loss_fn = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.SGD(model.parameters(), lr=lr)
    for _ in range(steps):
        loss = loss_fn(model(X), y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    return loss.item()


check("Exercise 1", lambda: abs(derivative_at_two() - 14.0) < 1e-6)
check("Exercise 2", lambda: sum(p.numel() for p in make_sequential().parameters()) == 65
      and make_sequential()(torch.zeros(5, 2)).shape == (5, 1))
torch.manual_seed(1)
check("Exercise 3", lambda: train_steps(MoonsNet().to(device), X_train, y_train, 300, 0.5) < 0.35)

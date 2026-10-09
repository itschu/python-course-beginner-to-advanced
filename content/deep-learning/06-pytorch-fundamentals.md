---
title: PyTorch fundamentals
summary: Set up Google Colab with a free GPU, then learn PyTorch's tensors, automatic gradients, nn.Module models and the five-step training loop, mapping each piece to the NumPy network you built.
minutes: 60
kind: lesson
colab: notebooks/07-06-pytorch-basics.ipynb
---

You've built a neural network library by hand. **PyTorch** is the professional version: the same ideas, with automatic backpropagation, GPU acceleration and a huge ecosystem of models. It's the most widely used deep learning library in research and increasingly in industry.

PyTorch doesn't run in this browser, so from here on the code runs in **Google Colab**: free notebooks in the cloud, with GPUs.

:::colab Set up Colab (once)
1. Click **Open in Colab** at the top of this page and sign in with a Google account.
2. Choose **Runtime → Change runtime type → T4 GPU → Save**.
3. Run cells with **Shift+Enter**. PyTorch is already installed.
4. To keep your work, use **File → Save a copy in Drive**.

Colab's free tier gives you a GPU for a few hours at a time. That's plenty for this course.
:::

The code on this page is the same as the notebook's. Read it here, run it there; each exercise in the notebook has a check that prints ✓ when you're right.

## Tensors

A **tensor** is PyTorch's array: NumPy's ndarray, plus the ability to live on a GPU and track gradients. Almost everything you know from NumPy carries over.

```python static
import torch

a = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
b = torch.ones(2, 2)
print(a @ b)                  # tensor([[3., 3.], [7., 7.]])
print(a.shape, a.dtype)       # torch.Size([2, 2]) torch.float32

x = torch.arange(12).reshape(3, 4)
print(x[:, 2])                # tensor([ 2,  6, 10])
print(x + torch.tensor([10, 20, 30, 40]))   # broadcasting, as in NumPy
```

| NumPy | PyTorch |
| --- | --- |
| `np.array(data)` | `torch.tensor(data)` |
| `np.zeros((3, 4))`, `np.random.randn(3, 4)` | `torch.zeros(3, 4)`, `torch.randn(3, 4)` |
| `x.reshape(...)`, `x.T`, `x @ y` | the same |
| `x.sum(axis=0)` | `x.sum(dim=0)` |
| default `float64` | default `float32` (faster on GPUs) |
| `torch.from_numpy(arr)`, `t.numpy()` | convert between the two (sharing memory) |

### CPU and GPU

```python static
device = "cuda" if torch.cuda.is_available() else "cpu"
x = torch.randn(1000, 1000).to(device)     # move data to the GPU
model = model.to(device)                   # move a model's weights to the GPU
```

A model and its data must be on the same device. Most PyTorch errors in the first week are "expected all tensors to be on the same device": the fix is a `.to(device)`.

## Autograd: backpropagation for free

Create a tensor with `requires_grad=True` and PyTorch records every operation applied to it. Calling `.backward()` on the result runs backpropagation and fills in `.grad`. Here's the single neuron from lesson 3, whose gradients you calculated by hand:

```python static
x, y = torch.tensor(2.0), torch.tensor(1.0)
w = torch.tensor(0.5, requires_grad=True)
b = torch.tensor(-0.2, requires_grad=True)

a = torch.sigmoid(w * x + b)
loss = -(y * torch.log(a) + (1 - y) * torch.log(1 - a))
loss.backward()
print(w.grad, b.grad)          # tensor(-0.6201) tensor(-0.3100): the same as your NumPy version
```

Two things to know:

- **Gradients accumulate.** Each `backward()` *adds* to `.grad`. That's why training loops call `optimizer.zero_grad()` every step.
- **Turn tracking off** when you don't need gradients, for evaluation and predictions: `with torch.no_grad(): ...`. It's faster and uses less memory.

## Models: `nn.Module`

A model is a class. Create the layers in `__init__`, and describe how data flows through them in `forward`. Here's lesson 3's two-moons network:

```python static
from torch import nn

class MoonsNet(nn.Module):
    def __init__(self, n_hidden=16):
        super().__init__()
        self.hidden = nn.Linear(2, n_hidden)     # your Dense(2, 16)
        self.out = nn.Linear(n_hidden, 1)

    def forward(self, x):
        return self.out(torch.relu(self.hidden(x))).squeeze(1)   # logits

model = MoonsNet()
print(sum(p.numel() for p in model.parameters()))   # 65
```

For a simple stack of layers, `nn.Sequential(nn.Linear(2, 16), nn.ReLU(), nn.Linear(16, 1))` does the same job without a class, just like your `Sequential`.

## The training loop

Every PyTorch training loop has the same five steps. They're exactly what your `fit` function did:

```python static
loss_fn = nn.BCEWithLogitsLoss()                       # sigmoid + log loss, numerically stable
optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

for step in range(500):
    logits = model(X_train)                            # 1. forward pass
    loss = loss_fn(logits, y_train)                    # 2. loss
    optimizer.zero_grad()                              # 3. clear old gradients
    loss.backward()                                    # 4. backpropagation
    optimizer.step()                                   # 5. update every parameter

model.eval()
with torch.no_grad():
    accuracy = ((model(X_test) > 0).float() == y_test).float().mean().item()
print(accuracy)                                        # about 0.91
```

It reaches about 91% test accuracy, in line with your NumPy network's 92% (small differences come from random initialisation and the optimiser).

Your library and PyTorch side by side:

| Your NumPy library | PyTorch |
| --- | --- |
| `Dense(2, 16, rng)` | `nn.Linear(2, 16)` |
| `ReLU()` | `nn.ReLU()` or `torch.relu` |
| `Sequential([...])` | `nn.Sequential(...)` or an `nn.Module` subclass |
| `SoftmaxCrossEntropy()` | `nn.CrossEntropyLoss()` (takes logits) |
| `model.backward(loss_fn.backward())` | `loss.backward()` |
| `Adam(lr).step(params, grads)` | `torch.optim.Adam(model.parameters(), lr).step()` |

:::tip Losses take logits
`nn.CrossEntropyLoss` and `nn.BCEWithLogitsLoss` apply softmax or sigmoid internally, which is more numerically stable. So models output raw scores, with **no** softmax or sigmoid at the end. Apply `torch.softmax` or `torch.sigmoid` yourself only when you want probabilities.
:::

## Practice in the notebook

The notebook's exercises:

1. Use autograd to find the derivative of $x^3 + 2x$ at $x = 2$.
2. Rebuild `MoonsNet` with `nn.Sequential`.
3. Write a reusable `train_steps(model, X, y, steps, lr)` function.

:::quiz pt-quiz Quick check
? Why does a PyTorch training loop call `optimizer.zero_grad()` every step?
- [x] Gradients accumulate across `backward()` calls, so old ones must be cleared
- [ ] It resets the learning rate
- [ ] It sets the weights to zero
> Without it, each step would use the sum of all previous gradients.

? You get "Expected all tensors to be on the same device". What's the fix?
- [x] Move the model and the data to the same device with `.to(device)`
- [ ] Reinstall PyTorch
- [ ] Use NumPy arrays instead
> A model on the GPU can only process tensors on the GPU.

? Your classifier ends with `nn.Softmax()` and you train it with `nn.CrossEntropyLoss()`. What's wrong?
- [x] CrossEntropyLoss applies softmax itself, so softmax gets applied twice
- [ ] Nothing
- [ ] CrossEntropyLoss only works for regression
> Output raw logits and let the loss handle softmax.

? What does `with torch.no_grad():` do?
- [x] Stops PyTorch recording operations for backpropagation, saving memory and time
- [ ] Freezes the model's weights permanently
- [ ] Deletes the gradients
> Use it for evaluation and predictions.
:::

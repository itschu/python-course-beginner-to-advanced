---
title: Convolutional networks and transfer learning
summary: How convolutions find patterns in images with a handful of shared weights, pooling, channels and batch normalisation, a CNN that beats the MLP on Fashion-MNIST, and fine-tuning a pretrained ResNet.
minutes: 70
kind: lesson
colab: notebooks/07-08-cnns.ipynb
---

The MLP in the last lesson flattened each image into 784 numbers, throwing away the fact that neighbouring pixels belong together. **Convolutional neural networks (CNNs)** keep the 2-D structure. They're why computers became good at seeing, and the ideas behind them (local patterns, shared weights, building complex features from simple ones) reappear throughout deep learning.

The first half of this lesson runs in your browser, in NumPy. The second half uses PyTorch in the companion notebook.

## A convolution, by hand

A **convolution** slides a small grid of weights, the **kernel** or **filter**, across the image. At each position it multiplies the kernel by the patch of pixels underneath and sums the result. The output is a **feature map** that's large wherever the patch looks like the kernel.

(Strictly, deep learning libraries compute a *cross-correlation*: the kernel isn't flipped. Everyone calls it convolution anyway.)

```python
import matplotlib.pyplot as plt
import numpy as np

# A simple 28x28 test image: a filled square and a ring
yy, xx = np.mgrid[:28, :28]
image = np.zeros((28, 28))
image[5:14, 4:13] = 1.0
image[((yy - 18) ** 2 + (xx - 18) ** 2 < 36) & ((yy - 18) ** 2 + (xx - 18) ** 2 > 12)] = 1.0

def conv2d(img, kernel):
    """Valid convolution (cross-correlation): no padding, stride 1."""
    kh, kw = kernel.shape
    out = np.zeros((img.shape[0] - kh + 1, img.shape[1] - kw + 1))
    for i in range(out.shape[0]):
        for j in range(out.shape[1]):
            out[i, j] = np.sum(img[i:i + kh, j:j + kw] * kernel)
    return out

kernels = {
    "vertical edges": np.array([[1, 0, -1], [1, 0, -1], [1, 0, -1]], dtype=float),
    "horizontal edges": np.array([[1, 1, 1], [0, 0, 0], [-1, -1, -1]], dtype=float),
    "blur": np.full((3, 3), 1 / 9),
}

fig, axes = plt.subplots(1, 4, figsize=(11, 3))
axes[0].imshow(image, cmap="gray_r")
axes[0].set_title("image")
for ax, (name, k) in zip(axes[1:], kernels.items()):
    out = conv2d(image, k)
    if name == "blur":
        ax.imshow(out, cmap="gray_r")
    else:                                   # red and blue: opposite edge directions
        ax.imshow(out, cmap="RdBu", vmin=-3, vmax=3)
    ax.set_title(name)
for ax in axes:
    ax.axis("off")
fig.tight_layout()
plt.show()
print("output size:", conv2d(image, kernels["blur"]).shape)
```

The vertical-edge kernel lights up (red or blue, depending on the direction) on the left and right sides of the shapes and ignores their tops and bottoms; the horizontal one does the opposite. A CNN **learns** its kernels: you never write them by hand. Its first layer typically ends up with edge and colour detectors like these. Later layers combine them into corners, textures, parts and whole objects.

## Why convolutions work so well

- **Local patterns.** Each output looks at a small neighbourhood, which is where visual information lives.
- **Shared weights.** The same 3×3 kernel is used at every position, so a pattern learned in one corner is recognised everywhere. A 3×3 kernel has 9 weights, however big the image. A dense layer from a 28×28 image to a 28×28 output needs 614,656 weights.
- **Translation equivariance.** Shift the image and the feature map shifts with it.

## Channels, padding, stride and pooling

- **Channels.** A colour image has 3 input channels (red, green, blue). A convolutional layer has many filters, each producing one output channel; `nn.Conv2d(1, 32, kernel_size=3)` takes 1 channel in and produces 32 feature maps. Each filter spans all input channels, so it has `in_channels × 3 × 3` weights plus a bias.
- **Padding** adds a border of zeros so the output stays the same size. With a 3×3 kernel, `padding=1` keeps 28×28 as 28×28.
- **Stride** is the step between positions. Stride 2 halves the output size.
- **Pooling** shrinks feature maps. **Max pooling** with a 2×2 window keeps the largest value in each block, halving height and width. That makes later layers see larger regions of the original image.

The output size of a convolution or pooling layer is:

$$
\left\lfloor \frac{\text{size} + 2 \cdot \text{padding} - \text{kernel}}{\text{stride}} \right\rfloor + 1
$$

```python
import numpy as np

def max_pool(img, size=2):
    h, w = img.shape[0] // size, img.shape[1] // size
    return img[:h * size, :w * size].reshape(h, size, w, size).max(axis=(1, 3))

x = np.array([[1, 3, 2, 0],
              [4, 2, 1, 1],
              [0, 1, 5, 6],
              [2, 2, 7, 8]], dtype=float)
print(max_pool(x))

# Parameter counts: a small CNN layer versus a dense layer on the same image
conv_params = 32 * (1 * 3 * 3) + 32              # nn.Conv2d(1, 32, 3)
dense_params = (28 * 28) * 128 + 128              # nn.Linear(784, 128)
print(f"Conv2d(1, 32, 3): {conv_params} parameters; Linear(784, 128): {dense_params:,} parameters")
```

## A CNN in PyTorch

The notebook's model has two convolutional blocks and a small classifier:

```python static
class SmallCNN(nn.Module):
    def __init__(self, n_classes=10):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2),   # 32 x 14 x 14
            nn.Conv2d(32, 64, kernel_size=3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2),  # 64 x 7 x 7
        )
        self.classifier = nn.Sequential(
            nn.Flatten(), nn.Dropout(0.3),
            nn.Linear(64 * 7 * 7, 128), nn.ReLU(),
            nn.Linear(128, n_classes),
        )

    def forward(self, x):
        return self.classifier(self.features(x))
```

- **Batch normalisation** (`nn.BatchNorm2d`) standardises each channel's activations over the mini-batch, then applies a learned scale and shift. Deep networks train faster and more reliably with it. Like dropout, it behaves differently in `train()` and `eval()` mode.
- **Data augmentation** makes small random changes to each training image every epoch: here, shifts of up to 2 pixels and horizontal flips. The model sees more variety, which reduces overfitting. Validation and test images are never augmented.

```python static
train_tf = transforms.Compose([
    transforms.RandomCrop(28, padding=2),       # random shift
    transforms.RandomHorizontalFlip(),          # mirrored clothes are still clothes
    transforms.ToTensor(),
])
```

When we ran the notebook, the CNN reached **91.5% test accuracy** after 15 epochs (the maximum allowed; it was still improving slowly), against 89.4% for lesson 7's MLP. It has about 422,000 parameters, but most of them are in the final dense layer: the two convolutional layers have just 18,816 between them. Notice that training accuracy (about 91%) ends up *below* validation accuracy. That's not a bug: augmentation and dropout make the training task harder, and both are switched off for validation.

## Transfer learning

Training a large CNN from scratch needs a lot of data and computing time. **Transfer learning** reuses a network already trained on ImageNet (1.2 million photos in 1,000 categories). Its early layers detect general features (edges, textures, shapes) that are useful for almost any images. You:

1. Load the pretrained network and replace its final layer with one for your classes.
2. **Freeze** the pretrained layers and train only the new head for an epoch or two.
3. **Unfreeze** everything and fine-tune with a small learning rate, so the pretrained features adapt without being wrecked.

```python static
from torchvision.models import ResNet18_Weights, resnet18

net = resnet18(weights=ResNet18_Weights.DEFAULT)      # downloads ImageNet weights
net.fc = nn.Linear(net.fc.in_features, 10)            # new head: 10 classes
net = net.to(device)

for name, p in net.named_parameters():                # step 2: train only the head
    p.requires_grad = name.startswith("fc.")
fit(net, small_train, small_val, epochs=2, lr=1e-3)

for p in net.parameters():                            # step 3: fine-tune everything, gently
    p.requires_grad = True
fit(net, small_train, small_val, epochs=3, lr=1e-4)
```

Inputs must be prepared the way the network saw them in training: resized, and normalised with ImageNet's channel means and standard deviations. The notebook fine-tunes on 10,000 CIFAR-10 photos, then trains the same architecture from random weights on the same data for comparison. With this little data, expect the pretrained network to come out far ahead. That's why transfer learning is the default for real image projects.

**ResNet** stands for *residual network*. Each block adds its input to its output (`out = block(x) + x`), giving gradients a shortcut back through the network. Residual connections are what made networks with 100+ layers trainable, and every transformer uses them too.

## Practice

:::exercise cnn-conv Convolution
Write `conv2d(image, kernel, padding=0)`: pad the 2-D `image` with `padding` rows and columns of zeros on every side (`np.pad`), then slide the 2-D `kernel` over it with stride 1, returning the array of sums of element-wise products (no kernel flip).

@@starter
import numpy as np

def conv2d(image, kernel, padding=0):
    return image

@@solution
import numpy as np

def conv2d(image, kernel, padding=0):
    img = np.pad(np.asarray(image, dtype=float), padding)
    kh, kw = kernel.shape
    out = np.zeros((img.shape[0] - kh + 1, img.shape[1] - kw + 1))
    for i in range(out.shape[0]):
        for j in range(out.shape[1]):
            out[i, j] = np.sum(img[i:i + kh, j:j + kw] * kernel)
    return out

@@tests
import numpy as np

def test_small_example():
    """Hand-checkable values"""
    image = np.arange(16, dtype=float).reshape(4, 4)
    kernel = np.array([[1.0, 0.0], [0.0, -1.0]])
    assert np.array_equal(conv2d(image, kernel), np.full((3, 3), -5.0))

def test_padding_keeps_size():
    """A 3x3 kernel with padding 1 keeps the size"""
    image = np.random.default_rng(0).normal(size=(6, 5))
    out = conv2d(image, np.ones((3, 3)), padding=1)
    assert out.shape == (6, 5)
    assert np.isclose(out[0, 0], image[:2, :2].sum())

def test_not_flipped():
    """Cross-correlation: the kernel is not flipped"""
    image = np.zeros((3, 3)); image[0, 0] = 1.0
    kernel = np.array([[1.0, 2.0], [3.0, 4.0]])
    assert conv2d(image, kernel)[0, 0] == 1.0
:::

:::exercise cnn-pool Max pooling
Write `max_pool(image, size=2)` that splits a 2-D array into non-overlapping `size × size` blocks and returns the maximum of each block. Ignore leftover rows or columns that don't fill a whole block.

@@starter
import numpy as np

def max_pool(image, size=2):
    return image

@@solution
import numpy as np

def max_pool(image, size=2):
    h, w = image.shape[0] // size, image.shape[1] // size
    return image[:h * size, :w * size].reshape(h, size, w, size).max(axis=(1, 3))

@@tests
import numpy as np

def test_example():
    """2x2 pooling of a 4x4 array"""
    x = np.array([[1, 3, 2, 0], [4, 2, 1, 1], [0, 1, 5, 6], [2, 2, 7, 8]], dtype=float)
    assert np.array_equal(max_pool(x), [[4.0, 2.0], [2.0, 8.0]])

def test_leftovers_and_size():
    """A 5x7 array with 2x2 blocks gives 2x3; size 3 also works"""
    x = np.arange(35, dtype=float).reshape(5, 7)
    assert max_pool(x).shape == (2, 3) and max_pool(x)[1, 2] == x[3, 5]
    assert np.array_equal(max_pool(np.arange(36.0).reshape(6, 6), 3), [[14.0, 17.0], [32.0, 35.0]])
:::

:::exercise cnn-shapes Output sizes and parameters
Write two functions:

- `conv_output_size(size, kernel, padding=0, stride=1)` using the formula above.
- `conv_params(in_channels, out_channels, kernel)` returning the number of parameters in a `Conv2d` layer with a square kernel and a bias.

@@starter
def conv_output_size(size, kernel, padding=0, stride=1):
    return size

def conv_params(in_channels, out_channels, kernel):
    return 0

@@solution
def conv_output_size(size, kernel, padding=0, stride=1):
    return (size + 2 * padding - kernel) // stride + 1

def conv_params(in_channels, out_channels, kernel):
    return out_channels * (in_channels * kernel * kernel + 1)

@@tests
def test_sizes():
    """Same, valid and strided convolutions"""
    assert conv_output_size(28, 3, padding=1) == 28
    assert conv_output_size(28, 5) == 24
    assert conv_output_size(32, 3, padding=1, stride=2) == 16
    assert conv_output_size(224, 7, padding=3, stride=2) == 112

def test_params():
    """Weights span all input channels"""
    assert conv_params(1, 32, 3) == 320
    assert conv_params(32, 64, 3) == 18496
    assert conv_params(3, 64, 7) == 9472
:::

:::quiz cnn-quiz Quick check
? Why does a convolutional layer need far fewer parameters than a dense layer on the same image?
- [x] The same small kernel is reused at every position
- [ ] It only looks at the centre of the image
- [ ] It uses smaller numbers
> Weight sharing: a 3×3 kernel has 9 weights whatever the image size.

? A 32×32 image goes through `Conv2d(3, 16, 3, padding=1)` then `MaxPool2d(2)`. What shape comes out?
- [ ] 16 × 32 × 32
- [x] 16 × 16 × 16
- [ ] 3 × 16 × 16
> Padding 1 keeps 32×32; pooling halves it; 16 filters give 16 channels.

? Should validation images be augmented?
- [ ] Yes, with the same random changes as training
- [x] No, validation and test images should be left as they are
- [ ] Only the test images
> Augmentation is a training-time regulariser; evaluation should reflect real inputs.

? When fine-tuning a pretrained network, why use a small learning rate after unfreezing?
- [x] Large updates would destroy the useful pretrained features
- [ ] Pretrained networks can't use large learning rates
- [ ] It makes the new head train faster
> Fine-tuning should adjust the features gently, not relearn them from scratch.
:::

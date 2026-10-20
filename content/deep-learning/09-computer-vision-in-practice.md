---
title: Computer vision in practice
summary: What separates a vision model that works in a notebook from one that works in the world. Data augmentation, robustness to shifted and noisy images, shortcut learning, object detection with bounding boxes and IoU, segmentation, and pretrained image embeddings.
minutes: 60
kind: lesson
---

Lesson 8 trained a CNN and fine-tuned a pretrained ResNet. This lesson is about the problems that appear after that: images in the real world aren't centred, lit and cropped like your training set; models find shortcuts you didn't intend; and many tasks need more than a single label per image.

The runnable examples use scikit-learn's built-in handwritten digits (8×8 pixel images), so they run in your browser in a second. The ideas are exactly the same at 224×224 with a CNN; the PyTorch code for that is shown alongside.

## How brittle is a model?

Here's a nearest-neighbour classifier trained on 10 examples of each digit. Test it on the normal test images, then on the same images shifted by at most one pixel in each direction, a change a person wouldn't even notice:

```python
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier

digits = load_digits()
images = digits.images / 16.0          # 8x8 images, scaled to 0-1
X_train, X_test, y_train, y_test = train_test_split(images, digits.target, test_size=0.5,
                                                    random_state=0, stratify=digits.target)

def shift(img, dx, dy):
    """Move an image dx pixels right and dy pixels down, filling the gap with zeros."""
    out = np.zeros_like(img)
    h, w = img.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = img[max(-dy, 0):h - max(dy, 0), max(-dx, 0):w - max(dx, 0)]
    return out

rng = np.random.default_rng(0)
X_test_shifted = np.array([shift(im, *rng.integers(-1, 2, size=2)) for im in X_test])

# 10 labelled examples per digit
idx = np.concatenate([rng.choice(np.where(y_train == d)[0], 10, replace=False) for d in range(10)])
model = KNeighborsClassifier(n_neighbors=1).fit(X_train[idx].reshape(len(idx), -1), y_train[idx])

flat = lambda a: a.reshape(len(a), -1)
print(f"accuracy on test images:          {model.score(flat(X_test), y_test):.3f}")
print(f"accuracy on images shifted ≤1 px: {model.score(flat(X_test_shifted), y_test):.3f}")
```

Accuracy falls by more than half. The model compares pixels position by position, so a one-pixel shift makes a 3 look more like some other digit than like the training 3s. Real photos vary far more: position, scale, rotation, lighting, blur, background. CNNs handle small shifts better than this, thanks to their shared filters and pooling, but they're brittle in the same way to variations they never saw in training.

## Data augmentation

**Data augmentation** creates extra training images by transforming the ones you have in ways that **don't change the label**: a 3 shifted by a pixel is still a 3. The model sees the variation during training instead of meeting it for the first time in production.

```python
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier

digits = load_digits()
images = digits.images / 16.0
X_train, X_test, y_train, y_test = train_test_split(images, digits.target, test_size=0.5,
                                                    random_state=0, stratify=digits.target)

def shift(img, dx, dy):
    out = np.zeros_like(img)
    h, w = img.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = img[max(-dy, 0):h - max(dy, 0), max(-dx, 0):w - max(dx, 0)]
    return out

rng = np.random.default_rng(0)
X_test_shifted = np.array([shift(im, *rng.integers(-1, 2, size=2)) for im in X_test])
idx = np.concatenate([rng.choice(np.where(y_train == d)[0], 10, replace=False) for d in range(10)])
X_small, y_small = X_train[idx], y_train[idx]

# Nine copies of each training image: every shift of up to one pixel, including no shift.
offsets = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
X_aug = np.array([shift(im, dx, dy) for dx, dy in offsets for im in X_small])
y_aug = np.tile(y_small, len(offsets))

flat = lambda a: a.reshape(len(a), -1)
for name, (X, y) in {"original 100 images": (X_small, y_small), "augmented 900 images": (X_aug, y_aug)}.items():
    model = KNeighborsClassifier(n_neighbors=1).fit(flat(X), y)
    print(f"{name:<21} test {model.score(flat(X_test), y_test):.3f}   shifted {model.score(flat(X_test_shifted), y_test):.3f}")
```

Augmentation recovers almost all of the accuracy on shifted images, and helps a little on the unshifted ones too, without a single new labelled example. That's why every serious vision training pipeline uses it.

Choose augmentations that match what changes in your real images, and that keep the label true:

- **Horizontal flips** are fine for cats and cars, but not for digits or text (a flipped 2 isn't a 2), and not for medical images where left and right matter.
- **Rotations** of a few degrees suit photos; 180° rotations turn a 6 into a 9.
- **Colour and brightness changes** help with lighting, but not when colour is the label (ripe versus unripe fruit).
- **Crops and scaling** teach the model that objects appear at different sizes and positions.

In PyTorch, augmentations are part of the training dataset's transform, applied freshly each epoch, so the model sees a different variant every time. Note that only the **training** transform augments:

```python static
from torchvision.transforms import v2
import torch

train_transform = v2.Compose([
    v2.RandomResizedCrop(224, scale=(0.7, 1.0)),
    v2.RandomHorizontalFlip(),
    v2.ColorJitter(brightness=0.2, contrast=0.2),
    v2.ToImage(),
    v2.ToDtype(torch.float32, scale=True),
    v2.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])
test_transform = v2.Compose([   # no randomness at evaluation time
    v2.Resize(256), v2.CenterCrop(224),
    v2.ToImage(), v2.ToDtype(torch.float32, scale=True),
    v2.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])
```

## Shortcut learning

Models learn whatever pattern predicts the label most easily, whether or not it's the one you meant. A famous kind of failure: a model that "detects" a disease from X-rays is really detecting which hospital's scanner took the image, because one hospital had sicker patients. Another learned to recognise wolves by the snow in the background.

You can reproduce the effect. Here, every training image gets a small marker in its top row that encodes the label, like a watermark that happens to correlate with the class. The model scores perfectly while the marker is there:

```python
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

digits = load_digits()
images = digits.images / 16.0
X_train, X_test, y_train, y_test = train_test_split(images, digits.target, test_size=0.5,
                                                    random_state=0, stratify=digits.target)

def add_marker(imgs, labels):
    """Put a bright pixel in the top or bottom row, at a position that depends on the label."""
    marked = imgs.copy()
    for img, label in zip(marked, labels):
        img[0, :] = 0
        img[7, :] = 0
        row = 0 if label < 8 else 7
        img[row, label % 8] = 1.0
    return marked

flat = lambda a: a.reshape(len(a), -1)
model = LogisticRegression(max_iter=3000).fit(flat(add_marker(X_train, y_train)), y_train)
print(f"test images with the marker:    {model.score(flat(add_marker(X_test, y_test)), y_test):.3f}")
print(f"test images without the marker: {model.score(flat(X_test), y_test):.3f}")
```

Without the marker, accuracy collapses: the model learned the marker, not the digits, even though the digits were there all along. Real shortcuts are subtler: a hospital's text overlay, the camera model, the photographer's habits, the time of day. Defences:

- **Test on data from a different source** (another site, camera, period) than you trained on. This is the computer-vision version of walk-forward validation.
- **Look at the images the model gets right and wrong**, not just the accuracy. Saliency maps such as Grad-CAM show which pixels drove a prediction; if they light up the corner, you have a shortcut.
- **Remove or randomise suspected shortcuts** in training: crop out overlays, augment colours, balance where each class's images come from.

## Beyond one label per image

Classification answers "what's in this image?". Many applications need "where?":

| Task | Output | Examples |
| --- | --- | --- |
| Classification | One label per image | Is this X-ray abnormal? Which product is this? |
| Object detection | A **bounding box** and label for each object | Counting cars, finding defects on a production line |
| Segmentation | A label for every **pixel** | Measuring a tumour, separating road from pavement |

Detection models are judged with **intersection over union (IoU)**: the area where the predicted box and the true box overlap, divided by the area they cover together. IoU is 1 for a perfect box and 0 for no overlap; a prediction usually counts as correct when its IoU with a true box is at least 0.5. Segmentation uses the same idea per pixel. You'll implement IoU in the exercises.

Pretrained detectors are as easy to use as the pretrained classifiers in lesson 8:

```python static
import torch
from torchvision.io import read_image
from torchvision.models.detection import fasterrcnn_resnet50_fpn_v2, FasterRCNN_ResNet50_FPN_V2_Weights

weights = FasterRCNN_ResNet50_FPN_V2_Weights.DEFAULT
model = fasterrcnn_resnet50_fpn_v2(weights=weights).eval()
image = read_image("street.jpg")
with torch.no_grad():
    result = model([weights.transforms()(image)])[0]
for box, label, score in zip(result["boxes"], result["labels"], result["scores"]):
    if score > 0.8:
        print(weights.meta["categories"][label], [round(v) for v in box.tolist()], f"{score:.2f}")
```

## Image embeddings and zero-shot classification

The layer before a pretrained network's output is an **embedding**: a vector that summarises the image. Images that look alike get nearby vectors, which makes embeddings useful for search ("find photos like this one"), clustering, deduplication, and as features for a small model trained on your own labels. This is transfer learning without any fine-tuning.

Transfer works when the pretraining data was large and varied (millions of photos), so its features are general. When the source task is narrow, its features can be worse than starting from raw pixels; that's why you start from a model trained on a broad dataset, as in lesson 8.

Models such as **CLIP** are trained on hundreds of millions of images paired with captions, so images and text share one embedding space. That allows **zero-shot classification**: describe the classes in words, and pick the description whose embedding is closest to the image's. No training at all:

```python static
from transformers import pipeline

classifier = pipeline("zero-shot-image-classification", model="openai/clip-vit-base-patch32")
print(classifier("kitchen.jpg", candidate_labels=["a kettle", "a toaster", "a blender", "a coffee grinder"]))
```

Zero-shot accuracy is usually below a fine-tuned model's, but it's a fast way to prototype, to label a first batch of data, or to handle categories you have no examples of yet.

## Practice

:::exercise cv-shift Shifting an image
Write `shift(img, dx, dy)` for a 2-D NumPy array: move the image `dx` pixels to the right (negative means left) and `dy` pixels down (negative means up). Pixels that move off the edge are lost, and the uncovered area is filled with zeros. The result has the same shape and dtype as the input, and the input must not be changed. Shifts larger than the image give all zeros.

@@starter
import numpy as np

def shift(img, dx, dy):
    return img

@@solution
import numpy as np

def shift(img, dx, dy):
    h, w = img.shape
    out = np.zeros_like(img)
    if abs(dx) >= w or abs(dy) >= h:
        return out
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = img[max(-dy, 0):h - max(dy, 0), max(-dx, 0):w - max(dx, 0)]
    return out

@@tests
import numpy as np

def test_right_and_down():
    """Shifting right by 1 and down by 1"""
    img = np.arange(9).reshape(3, 3)
    assert shift(img, 1, 1).tolist() == [[0, 0, 0], [0, 0, 1], [0, 3, 4]]

def test_left_and_up():
    """Shifting left by 1 and up by 2"""
    img = np.arange(1, 10).reshape(3, 3)
    assert shift(img, -1, -2).tolist() == [[8, 9, 0], [0, 0, 0], [0, 0, 0]]

def test_no_shift_and_copy():
    """No shift returns an equal copy, and the input is unchanged"""
    img = np.ones((4, 5))
    out = shift(img, 0, 0)
    out[0, 0] = 7
    assert img[0, 0] == 1 and out.shape == (4, 5)

def test_too_far():
    """Shifting further than the image leaves nothing"""
    assert shift(np.ones((3, 3)), 5, 0).sum() == 0
    assert shift(np.ones((3, 3)), 0, -3).sum() == 0

@@hint
Work out which block of the output receives pixels and which block of the input they come from. For a positive `dy`, output rows `dy:h` receive input rows `0:h-dy`.

@@hint
`max(dy, 0)` and `min(dy, 0)` let one expression handle both directions: output rows are `max(dy, 0):h + min(dy, 0)` and input rows are `max(-dy, 0):h - max(dy, 0)`.
:::

:::exercise cv-iou Intersection over union
Boxes are tuples `(x1, y1, x2, y2)` with `x1 < x2` and `y1 < y2`. Write:

- `iou(a, b)`: the area of the overlap divided by the area of the union (`area(a) + area(b) - overlap`). Boxes that don't overlap, or only touch at an edge, have IoU 0.
- `match_rate(predicted, truth, threshold=0.5)`: the fraction of true boxes that have at least one predicted box with IoU at least `threshold`. Return 0.0 if there are no true boxes.

@@starter
def iou(a, b):
    return 0.0

def match_rate(predicted, truth, threshold=0.5):
    return 0.0

@@solution
def iou(a, b):
    width = min(a[2], b[2]) - max(a[0], b[0])
    height = min(a[3], b[3]) - max(a[1], b[1])
    if width <= 0 or height <= 0:
        return 0.0
    overlap = width * height
    area = lambda box: (box[2] - box[0]) * (box[3] - box[1])
    return overlap / (area(a) + area(b) - overlap)

def match_rate(predicted, truth, threshold=0.5):
    if not truth:
        return 0.0
    found = sum(any(iou(p, t) >= threshold for p in predicted) for t in truth)
    return found / len(truth)

@@tests
import math

def test_identical():
    """A box matches itself perfectly"""
    assert iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1.0

def test_partial():
    """Two 10x10 boxes overlapping by half"""
    assert math.isclose(iou((0, 0, 10, 10), (5, 0, 15, 10)), 50 / 150)

def test_contained():
    """A small box inside a big one"""
    assert math.isclose(iou((0, 0, 10, 10), (2, 2, 4, 4)), 4 / 100)

def test_disjoint_and_touching():
    """No overlap, or only an edge, is 0"""
    assert iou((0, 0, 1, 1), (2, 2, 3, 3)) == 0.0
    assert iou((0, 0, 1, 1), (1, 0, 2, 1)) == 0.0

def test_match_rate():
    """Two of three true boxes are found"""
    truth = [(0, 0, 10, 10), (20, 20, 30, 30), (50, 50, 60, 60)]
    predicted = [(1, 1, 10, 10), (21, 19, 31, 29), (80, 80, 90, 90)]
    assert math.isclose(match_rate(predicted, truth), 2 / 3)
    assert match_rate(predicted, []) == 0.0

@@hint
The overlap's width is `min(right edges) - max(left edges)`; if that's zero or negative, the boxes don't overlap.
:::

:::quiz cv-practice-check Quick check
? Which augmentation would be a mistake for a handwritten-digit classifier?
- [ ] Shifting by a pixel
- [ ] Small changes in brightness
- [x] Horizontal flips
> A flipped 2, 3 or 7 isn't a valid digit, so flipping teaches the model wrong labels.

? A skin-lesion model scores 95% in testing but fails in a new clinic. Which is the most likely cause?
- [ ] The test set was too small
- [x] It learned a shortcut tied to the original clinic's images, such as a ruler, a stain or the camera
- [ ] It needed more epochs
> Test on images from a different source before trusting a vision model in a new setting.

? A predicted box overlaps a true box, covering 40 units out of a combined (union) area of 100. Is it a match at the usual threshold?
- [ ] Yes
- [x] No: IoU is 0.4, below 0.5
> IoU = intersection / union = 40 / 100.

? What makes zero-shot classification with CLIP possible?
- [ ] It was trained on every possible label
- [x] Images and text share an embedding space, so class descriptions can be compared with images directly
- [ ] It fine-tunes itself on each image
> Describe each class in words and pick the description closest to the image.
:::

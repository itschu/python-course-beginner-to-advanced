---
title: What is TinyML?
summary: Why run models on microcontrollers, the constraints you design for (memory, latency, energy), and the pipeline this phase follows from sensor data to firmware.
minutes: 35
kind: lesson
---

**TinyML** means running machine learning models on microcontrollers: chips with kilobytes of memory that run for months on a battery. Your phone already does it: the chip that listens for "Hey Siri" or "OK Google" is a tiny always-on model, and it only wakes the main processor when it hears the phrase. So do fitness trackers counting steps, smart doorbells detecting people, and factory sensors predicting when a motor will fail.

## Why not send the data to the cloud?

| Reason | Example |
| --- | --- |
| **Latency** | A drone stabilising itself, or a machine detecting a jam, can't wait 200 ms for a server |
| **Power** | Sending data over Wi-Fi or cellular uses far more energy than computing on the device; a tiny model on a coin cell can run for a year |
| **Privacy** | Audio and video never leave the device: only "someone knocked" does |
| **Connectivity** | Farms, oceans, mines and wearables are often offline |
| **Cost** | Millions of devices sending raw sensor data adds up |

## The constraints

You've trained models with millions of parameters in Phase 7. A microcontroller changes the rules:

| | Your laptop (PyTorch) | Raspberry Pi Pico 2 | Smaller MCUs |
| --- | --- | --- | --- |
| RAM | 16 GB | 520 KB | 16–64 KB |
| Storage for the model | unlimited | 4 MB flash | 64–256 KB flash |
| Compute | GPU, billions of ops per ms | ~150 MHz, a few million ops per ms | 16–64 MHz |
| Floating point | fast | fast `f32` (Pico 2), **none** on the original Pico | often none |
| Power budget | 50 W | ~0.1 W | milliwatts or less |

So TinyML models are **small** (thousands of parameters, not millions), use **cheap features** that can be computed on the device, and are usually **quantized** to 8-bit integers: four times smaller than `f32`, and fast on chips without a floating-point unit.

## Counting a model's cost

For a dense (fully connected) layer with `n_in` inputs and `n_out` outputs:

- **parameters** = `n_in × n_out` weights + `n_out` biases
- **multiply-accumulates (MACs)** per prediction = `n_in × n_out`

Memory for the weights is parameters × bytes per parameter: 4 for `f32`, 1 for `int8`. The model also needs RAM for the **activations** (the outputs of each layer) while it runs.

```python
def dense_cost(layers):
    """layers: sizes like [5, 8, 4] for 5 inputs, 8 hidden units, 4 outputs."""
    params = macs = 0
    for n_in, n_out in zip(layers, layers[1:]):
        params += n_in * n_out + n_out
        macs += n_in * n_out
    return params, macs

for layers in ([5, 8, 4], [120, 64, 64, 4], [784, 128, 10]):
    params, macs = dense_cost(layers)
    print(f"{str(layers):<18} {params:>7,} params  {params * 4 / 1024:7.1f} KB as f32  "
          f"{params / 1024:6.1f} KB as int8  {macs:>7,} MACs")
```

The gesture model you'll build in this phase is the first one: 84 parameters and 72 multiply-accumulates. It runs in **microseconds** on a Pico.

## The pipeline

This phase follows the standard TinyML workflow, and each step is a lesson:

```text
 1. collect sensor data        accelerometer windows, labelled by gesture          (lesson 2)
 2. design features            cheap to compute on the chip, integers only         (lesson 2)
 3. train a small model        in Python, with scikit-learn                        (lesson 3)
 4. quantize                   float32 → int8 weights and activations               (lesson 4)
 5. export                     generate Rust source code with the model's numbers   (lesson 5)
 6. integer inference in Rust  bit-exact with the Python reference                  (lesson 6)
 7. deploy and measure         Embassy firmware: latency, memory, power             (lesson 7)
 8. project                    an end-to-end gesture recogniser                     (lesson 8)
```

The dataset is `data/gestures.csv`: 240 windows of wrist accelerometer data, each 1.6 seconds long at 25 samples per second, labelled **idle**, **wave**, **shake** or **circle**. It's synthetic, generated with realistic variation between "people" (wrist angle, speed, size of the movement, sensor noise), so the techniques transfer directly to data you record yourself.

```python
import pandas as pd

df = pd.read_csv("data/gestures.csv")
print(df.head())
print(df.groupby("gesture")["window"].nunique())
```

## Tools you'll hear about

- **TensorFlow Lite for Microcontrollers** (now LiteRT for Microcontrollers): Google's C++ runtime for quantized TensorFlow models; the industry standard.
- **Edge Impulse**: a hosted platform covering the whole pipeline (data collection, features, training, quantization, export as a C++ library). Great for prototypes.
- **CMSIS-NN**: Arm's optimised int8 kernels for Cortex-M, used under the hood by TFLite Micro.
- **Rust**: `microflow` (compiles TFLite models to Rust), `burn` (no_std), `tract`, and hand-written integer code like you'll write here.

Doing it by hand first means you'll understand exactly what those tools do, and you'll be able to debug them when the numbers don't match.

## Practice

:::exercise tinyml-model-budget Will the model fit?
Write `model_memory(layers, weight_bytes=1, bias_bytes=4)` that returns the bytes needed for a dense network's parameters (biases are often kept as 32-bit integers even when weights are int8), and `peak_activation_bytes(layers, bytes_per_value=1)`: while one layer runs, its input and output must both be in memory, so the peak is the largest `n_in + n_out` over all layers, times `bytes_per_value`.

Then write `fits(layers, flash_kb, ram_kb)`, which is `True` when the parameters fit in `flash_kb` kilobytes and the peak activations fit in `ram_kb` kilobytes (1 KB = 1024 bytes).

@@starter
def model_memory(layers, weight_bytes=1, bias_bytes=4):
    pass

def peak_activation_bytes(layers, bytes_per_value=1):
    pass

def fits(layers, flash_kb, ram_kb):
    pass

@@solution
def model_memory(layers, weight_bytes=1, bias_bytes=4):
    total = 0
    for n_in, n_out in zip(layers, layers[1:]):
        total += n_in * n_out * weight_bytes + n_out * bias_bytes
    return total

def peak_activation_bytes(layers, bytes_per_value=1):
    return max(n_in + n_out for n_in, n_out in zip(layers, layers[1:])) * bytes_per_value

def fits(layers, flash_kb, ram_kb):
    return model_memory(layers) <= flash_kb * 1024 and peak_activation_bytes(layers) <= ram_kb * 1024

@@tests
def test_gesture_model():
    """The gesture model: 72 int8 weights and 12 int32 biases"""
    assert model_memory([5, 8, 4]) == 72 + 12 * 4

def test_float():
    """f32 everything"""
    assert model_memory([5, 8, 4], weight_bytes=4, bias_bytes=4) == 84 * 4

def test_activations():
    """Peak activations are the biggest input + output pair"""
    assert peak_activation_bytes([784, 128, 10]) == 912
    assert peak_activation_bytes([10, 100, 100, 2], bytes_per_value=4) == 800

def test_fits():
    """A 784-128-10 network fits in 128 KB of flash but not 64 KB"""
    assert fits([784, 128, 10], flash_kb=128, ram_kb=16)
    assert not fits([784, 128, 10], flash_kb=64, ram_kb=16)
    assert not fits([5, 8, 4], flash_kb=1, ram_kb=0)

@@hint
Loop over `zip(layers, layers[1:])` to get each layer's `(n_in, n_out)`.
:::

:::quiz tinyml-intro-check Quick check
? Why are TinyML models usually quantized to int8?
- [x] Four times less memory than f32, and fast integer maths on chips without a floating-point unit
- [ ] int8 is more accurate
- [ ] Microcontrollers can't store floats
> Accuracy usually drops slightly; size and speed improve a lot.

? A dense layer with 16 inputs and 8 outputs. How many parameters?
- [ ] 128
- [x] 136
- [ ] 24
> 16 × 8 weights + 8 biases.

? Which is NOT a usual reason to run a model on the device instead of the cloud?
- [ ] Latency
- [ ] Privacy
- [x] To use a bigger model
> The device is far more limited; you trade model size for latency, energy, privacy and offline operation.
:::

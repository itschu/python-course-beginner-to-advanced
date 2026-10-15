---
title: Deploying on a microcontroller
summary: Put the model into Embassy firmware with a sampling task and an inference task, smooth the predictions, measure latency, memory and power, and plan for updates.
minutes: 55
kind: lesson
language: rust
---

You have features, a quantized model and Rust code that matches Python bit for bit. This lesson assembles them into firmware for a Raspberry Pi Pico with an MPU-6050 accelerometer (wired as in Phase 12: SDA to GP4, SCL to GP5).

## The architecture

```text
 ┌──────────────── sampler task (25 Hz) ───────────────┐      ┌──────── inference task ────────┐
 │ Ticker every 40 ms → read 6 bytes over I2C (async)  │      │ every 10 new samples:          │
 │ → push [x, y, z] into a 40-sample ring buffer       │ ───► │ copy the last 40 → features    │
 │ → every 10 samples, signal the inference task       │      │ → quantized MLP → class        │
 └─────────────────────────────────────────────────────┘      │ → smooth → set LED / send BLE  │
                                                              └────────────────────────────────┘
```

Two tasks, connected by a signal. The sampler must never miss its 40 ms deadline, so it does almost nothing; inference runs in the gaps.

```rust static
#![no_std]
#![no_main]

mod model;          // generated in lesson 5
mod inference;      // features, quantize_input, dense, relu_requantize, argmax (lesson 6)

use embassy_executor::Spawner;
use embassy_rp::i2c::{self, I2c};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, mutex::Mutex, signal::Signal};
use embassy_time::{Duration, Instant, Ticker};

const N: usize = 40;
static WINDOW: Mutex<CriticalSectionRawMutex, [[i16; 3]; N]> = Mutex::new([[0; 3]; N]);
static READY: Signal<CriticalSectionRawMutex, ()> = Signal::new();

#[embassy_executor::task]
async fn sampler(mut imu: I2c<'static, embassy_rp::peripherals::I2C0, i2c::Async>) {
    imu.write_async(0x68u16, [0x6B, 0x00]).await.unwrap();          // wake the MPU-6050
    let mut ticker = Ticker::every(Duration::from_millis(40));      // 25 Hz, without drift
    let mut count = 0usize;
    loop {
        let mut raw = [0u8; 6];
        if imu.write_read_async(0x68u16, [0x3B], &mut raw).await.is_ok() {
            let sample = [
                i16::from_be_bytes([raw[0], raw[1]]),
                i16::from_be_bytes([raw[2], raw[3]]),
                i16::from_be_bytes([raw[4], raw[5]]),
            ];
            let mut w = WINDOW.lock().await;
            w.rotate_left(1);                                       // oldest sample out
            w[N - 1] = sample;                                      // newest in
            count += 1;
            if count >= N && count % 10 == 0 {
                READY.signal(());
            }
        }
        ticker.next().await;
    }
}

#[embassy_executor::task]
async fn classifier() {
    let mut smoother = inference::Smoother::new();
    loop {
        READY.wait().await;
        let window = *WINDOW.lock().await;                          // copy, then release the lock
        let started = Instant::now();
        let logits = inference::predict(&window);
        let elapsed = started.elapsed();
        if let Some(class) = smoother.update(&logits) {
            defmt::info!("{} ({} us)", model::CLASSES[class], elapsed.as_micros());
        }
    }
}
```

A few details worth noticing:

- `Ticker` fires every 40 ms **on schedule**, even if a read took 3 ms; `Timer::after(40 ms)` in a loop would drift.
- The window lives in a `static` protected by an async mutex; the classifier **copies** it (240 bytes) and releases the lock straight away, so it never delays the sampler.
- `rotate_left` moves 39 samples each time. A ring buffer with a head index (Phase 12's checkpoint) avoids that copy; at 25 Hz it doesn't matter.
- Latency is **measured on the device** with `Instant`, not guessed.

## Smoothing predictions

Single predictions flicker, especially at the start and end of a gesture, when the window holds half of one movement and half of another. Real products only report a gesture when:

1. the model is **confident**: the winning logit beats the runner-up by a margin, and
2. the prediction is **stable**: the same class wins several windows in a row.

You'll implement this in the exercise. It turns a 98%-accurate classifier into one that almost never produces a false event, at the cost of a few hundred milliseconds of delay.

## Measuring what matters

| Metric | How to measure | Budget for this project |
| --- | --- | --- |
| **Inference latency** | `Instant::now()` around `predict`, or toggle a GPIO and use a logic analyser | well under the 400 ms between windows (it's tens of microseconds) |
| **Flash** | `cargo size --release` (from `cargo-binutils`) or the linker map | model ≈ 200 bytes; firmware with Embassy ≈ 30–60 KB of 2 MB |
| **RAM** | static data from `cargo size`; stack with `flip-link` or stack painting | window 240 bytes + buffers; all static, no heap |
| **Power** | a USB power meter, or a Nordic Power Profiler Kit for microamp detail | the CPU sleeps between samples; most of the energy is the IMU and radio |
| **Accuracy on the device** | log predictions plus raw windows over USB or BLE, and replay them in Python | must match the Python reference exactly |

The last row is the important one. Log raw windows from the device, run them through your Python reference, and confirm the classes agree. If they don't, the bug is in the features or the integer code, not the model.

## Updating the model

Models need retraining when you collect more data or find failure cases. Options, from simplest:

1. **Reflash** the whole firmware (fine for prototypes and products with USB access).
2. **Over-the-air (OTA) updates** of the whole firmware via Wi-Fi or BLE, with a bootloader that keeps the old version if the new one fails (`embassy-boot` supports this, with two flash slots).
3. **Model-only updates**: store the weights in a separate flash region with a version number and a CRC, and load them at boot. Weights become data instead of code, so they must be validated: check the CRC, check the version is compatible with the firmware's feature code, and run the check vectors before switching over.

Always embed a **model version** and report it, so logs from the field can be matched to the training run that produced the model.

## Other routes to the device

You built every piece by hand so you'd understand it. In practice you might use:

- **TensorFlow Lite for Microcontrollers** (C++): train in Keras, convert with the TFLite converter using full-integer quantization, compile in the `.tflite` file. It supports convolutional and recurrent layers and uses CMSIS-NN kernels on Arm chips. From Rust, call it through FFI (Phase 10) or use **microflow**, which compiles a `.tflite` model directly into Rust code.
- **Edge Impulse**: upload sensor data, design features and a model in the browser, and download a C++ library or firmware for dozens of boards. Excellent for fast prototypes.
- **Burn** (Rust): define and train the model in Rust, then compile it for `no_std`.
- **ExecuTorch** (PyTorch): export PyTorch models to phones, wearables and some microcontrollers.

Whichever you use, the checklist from this phase still applies: integer-friendly features, a size and latency budget, quantization with a measured accuracy cost, bit-exact checks against a reference, and smoothing on the device.

## Practice

:::exercise tinyml-rs-smoother Confident, stable predictions
Write a `Smoother` that decides when to report a gesture. `update(&mut self, logits: &[i32; 4]) -> Option<usize>`:

1. Find the best and second-best logits. If `best − second < MARGIN`, the prediction is **not confident**: reset the streak and return `None`.
2. Otherwise, if the best class is the same as last time, increase the streak, else start a new streak of 1.
3. Report the class (`Some(class)`) **once**, at the moment the streak reaches `STABLE`. Return `None` while waiting, and `None` for further identical predictions after reporting (a new streak must start before the same class can be reported again).

Use `MARGIN = 1000` and `STABLE = 3`.

@@starter
const MARGIN: i32 = 1000;
const STABLE: u32 = 3;

struct Smoother {
    class: Option<usize>,
    streak: u32,
}

impl Smoother {
    fn new() -> Smoother {
        Smoother { class: None, streak: 0 }
    }

    fn update(&mut self, logits: &[i32; 4]) -> Option<usize> {
        todo!()
    }
}

@@solution
const MARGIN: i32 = 1000;
const STABLE: u32 = 3;

struct Smoother {
    class: Option<usize>,
    streak: u32,
}

impl Smoother {
    fn new() -> Smoother {
        Smoother { class: None, streak: 0 }
    }

    fn update(&mut self, logits: &[i32; 4]) -> Option<usize> {
        let mut best = 0;
        for i in 1..4 {
            if logits[i] > logits[best] {
                best = i;
            }
        }
        let second = (0..4).filter(|&i| i != best).map(|i| logits[i]).max().unwrap_or(i32::MIN);
        if logits[best] - second < MARGIN {
            self.class = None;
            self.streak = 0;
            return None;
        }
        if self.class == Some(best) {
            self.streak += 1;
        } else {
            self.class = Some(best);
            self.streak = 1;
        }
        if self.streak == STABLE { Some(best) } else { None }
    }
}

@@tests
const SHAKE: [i32; 4] = [-9000, -14000, 7000, -14000];
const WAVE: [i32; 4] = [-3500, -4900, -2700, 6400];
const UNSURE: [i32; 4] = [1500, -3000, -3500, 1000];

fn run(seq: &[[i32; 4]]) -> Vec<Option<usize>> {
    let mut s = Smoother::new();
    seq.iter().map(|l| s.update(l)).collect()
}

/// Reports once, on the third confident prediction in a row
#[test]
fn reports_once() {
    assert_eq!(run(&[SHAKE, SHAKE, SHAKE, SHAKE, SHAKE]), vec![None, None, Some(2), None, None]);
}

/// Unsure predictions reset the streak
#[test]
fn unsure_resets() {
    assert_eq!(run(&[SHAKE, SHAKE, UNSURE, SHAKE, SHAKE, SHAKE]), vec![None, None, None, None, None, Some(2)]);
}

/// A change of class starts a new streak
#[test]
fn class_change() {
    assert_eq!(run(&[WAVE, WAVE, SHAKE, WAVE, WAVE, WAVE]), vec![None, None, None, None, None, Some(3)]);
}

/// The same gesture can be reported again after an interruption
#[test]
fn again_after_break() {
    let seq = [WAVE, WAVE, WAVE, UNSURE, WAVE, WAVE, WAVE];
    assert_eq!(run(&seq)[6], Some(3));
}

@@hint
Find `best` with a loop, then `second` as the largest logit at any other index. If the margin is too small, reset (`class = None`, `streak = 0`) and return `None`.

@@hint
Return `Some(best)` only when `self.streak == STABLE` (exactly equal), so it's reported once per streak.
:::

:::quiz tinyml-deploy-check Quick check
? Why use a Ticker instead of `Timer::after` in the sampling loop?
- [x] A Ticker keeps a fixed schedule, so the sample rate doesn't drift when a read takes time
- [ ] Timer::after doesn't work with I2C
- [ ] It uses less RAM
> The model was trained on 25 Hz data; a drifting sample rate changes the features.

? The device's predictions disagree with Python's on logged windows. Where do you look first?
- [ ] Retrain the model with more data
- [x] The feature extraction and integer inference code, using the check vectors
- [ ] The learning rate
> If the same input gives different outputs, the implementation differs, not the model.

? What should a model-only over-the-air update check before switching to the new weights? (choose all that apply)
- [x] A CRC of the weights
- [x] That its version is compatible with the firmware's feature code
- [x] That the check vectors give the expected outputs
- [ ] That the battery is fully charged
> Treat downloaded weights as untrusted data.
:::

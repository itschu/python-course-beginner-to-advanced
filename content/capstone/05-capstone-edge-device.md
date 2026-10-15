---
title: "Capstone, part 3: ship a model on a device"
summary: The edge alternative to the server capstone. Specify, build, verify and operate a model that runs inside microcontroller firmware, and analyse a field log from the device.
minutes: 120
kind: project
---

Parts 1 and 2 built a system that runs on a server. Many of the most interesting ML products run somewhere else entirely: on a wrist, in a machine, on a farm. This part is the alternative (or additional) capstone for the second half of the course: **a model you trained, running inside firmware you wrote, on hardware you wired**.

It's deliberately open-ended. Pick a problem you care about; the gesture recogniser from Phase 13 is the template.

## Project ideas

| Idea | Sensor | Model | What makes it interesting |
| --- | --- | --- | --- |
| Exercise rep counter | accelerometer on the wrist or a dumbbell | classifier + peak counting | Counting, not just classifying; different exercises |
| Machine health monitor | accelerometer on a fan, pump or washing machine | anomaly detection (train on "normal" only) | No labelled failures: how do you set the threshold? |
| Fall detector | accelerometer at the hip | classifier with a very low false-alarm rate | The cost of errors is lopsided |
| Plant or room monitor | temperature, humidity, light (I2C) | forecasting the next hour, or "window left open" detection | Time series on a device (Phase 6 meets Phase 12) |
| Keyword or clap detector | microphone (I2S or ADC) | small CNN on audio features | Audio features (MFCC) and a much bigger model |
| Football kick classifier | IMU on a shin guard | classifier (pass, shot, dribble) | Fast motions, high sample rate |

## Milestones

### 1. Write the specification first

Before collecting data, write a one-page design doc (lesson 1 of this phase showed you how), adapted to a device:

```markdown
# Design: rep counter v1

## Decision and users
Count squats and push-ups for a home-workout app. The user sees the count live.

## Requirements (measured on the device)
- Accuracy: rep count within ±1 on 95% of 10-rep sets
- Latency: count appears within 1 s of each rep
- False reps: < 1 per 10 minutes of non-exercise movement
- Battery: 2 weeks on a 200 mAh LiPo at 1 hour of use per day
- Flash < 64 KB, RAM < 16 KB for the whole application

## Data
Sample rate, window, sensor range, who recorded it, how it's split (by person!)

## Features and model
Integer-friendly features; model family; parameter and MAC budget

## Verification
Python reference implementation; check vectors; bit-exact Rust tests

## Failure modes
Sensor disconnected; battery low; unknown movement; user wears it upside down
```

Notice the requirements are **measurable on the device**, including false alarms and battery life, not just "95% test accuracy".

### 2. Collect your own data

Write MicroPython (Phase 12) or Embassy firmware that streams raw samples over USB serial, and a Python script on your laptop that saves them with labels. Record several sessions, several people if you can, and plenty of "none of the above". Split train and test **by person or session**.

### 3. Train, quantize and export

Reuse the Phase 13 pipeline: integer features, the smallest model that meets the requirement, int8 quantization with calibration, measured accuracy cost, and a generated `model.rs` with check vectors.

### 4. Firmware

An Embassy application with:

- a sampling task on a `Ticker`,
- an inference task fed by a channel or signal,
- smoothing and a confidence threshold,
- a boot self-test that runs the check vectors,
- a watchdog,
- a model version string reported over the log or BLE,
- logic (features, inference, smoothing, state machines) in a hardware-free module with `cargo test` coverage.

### 5. Field test and report

Wear it, use it, log everything: raw windows (or at least features), predictions, latencies and the model version. Then analyse the log in Python, which is what the exercise below practises.

## The deliverables

A repository with:

```text
README.md            results first: device metrics vs. requirements, a photo or video, the model card
data/                (or a link to it) with a data card: who, how, when, sample rate
training/            Python: features.py (the reference), train.py, export.py
firmware/            Rust: Cargo.toml, src/main.rs (tasks), src/inference.rs (pure, tested), src/model.rs (generated)
analysis/            field log analysis notebook
```

Include a **model card** (see the next lesson) describing intended use, the people the data came from, the measured false-alarm rate, and known failure cases. A device that works well for the person who recorded the data and badly for everyone else is the classic TinyML failure; say honestly how far you tested.

## Practice

:::exercise edge-field-report Analyse a field log
Your device logs one record per prediction. Each record is a dict with:

- `"t_ms"`: device time
- `"device"`: the class the firmware reported (`None` when the smoother reported nothing)
- `"reference"`: the class the Python reference computed from the same logged window
- `"latency_us"`: how long inference took on the device

Write `field_report(log, hours)` returning a dict with:

- `"mismatches"`: the number of records where `device` is not `None` and differs from `reference` (these are **implementation bugs**: they should be 0)
- `"events_per_hour"`: the number of records where `device` is not `None` and not `"idle"`, divided by `hours`, rounded to 2 decimal places
- `"p95_latency_us"`: the 95th percentile of `latency_us` using the nearest-rank method: sort the values and take the one at position `ceil(0.95 × n)` (counting from 1)

@@starter
import math

def field_report(log, hours):
    pass

@@solution
import math

def field_report(log, hours):
    reported = [r for r in log if r["device"] is not None]
    mismatches = sum(1 for r in reported if r["device"] != r["reference"])
    events = sum(1 for r in reported if r["device"] != "idle")
    latencies = sorted(r["latency_us"] for r in log)
    rank = math.ceil(0.95 * len(latencies))
    return {
        "mismatches": mismatches,
        "events_per_hour": round(events / hours, 2),
        "p95_latency_us": latencies[rank - 1],
    }

@@tests
def record(t, device, reference, latency):
    return {"t_ms": t, "device": device, "reference": reference, "latency_us": latency}

LOG = [record(i * 400, None, "idle", 30 + i % 7) for i in range(40)]
LOG[5] = record(2000, "shake", "shake", 31)
LOG[12] = record(4800, "wave", "wave", 35)
LOG[20] = record(8000, "idle", "idle", 29)
LOG[30] = record(12000, "circle", "wave", 90)

def test_mismatches():
    """Counts reported predictions that disagree with the reference"""
    assert field_report(LOG, 0.5)["mismatches"] == 1

def test_events_per_hour():
    """Non-idle events per hour"""
    assert field_report(LOG, 0.5)["events_per_hour"] == 6.0

def test_p95():
    """Nearest-rank 95th percentile"""
    latencies = sorted(r["latency_us"] for r in LOG)
    assert field_report(LOG, 1)["p95_latency_us"] == latencies[37]

def test_small():
    """Works for a tiny log"""
    log = [record(0, "idle", "idle", 10), record(1, None, "idle", 20)]
    assert field_report(log, 2) == {"mismatches": 0, "events_per_hour": 0.0, "p95_latency_us": 20}

@@hint
Filter to the records where the device reported something first. For the percentile, `math.ceil(0.95 * n)` is a 1-based position, so index the sorted list with `rank - 1`.
:::

:::quiz edge-capstone-check Quick check
? Which requirement is most often missing from student TinyML projects?
- [ ] Test accuracy
- [x] A false-alarm rate measured on realistic "none of the above" activity
- [ ] The number of layers
> A gesture device that fires while you walk is unusable, whatever its accuracy.

? The field log shows 3 mismatches between the device and the Python reference. What does that mean?
- [ ] The model needs more training data
- [x] The firmware's feature or inference code differs from the reference: an implementation bug
- [ ] Normal quantization noise
> Quantization noise is already included in the int8 reference; device and reference should agree exactly.
:::

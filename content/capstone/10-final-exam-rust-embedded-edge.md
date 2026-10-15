---
title: "Final exam, part 2: Rust, embedded and edge AI"
summary: The second final test, covering Rust, Rust for ML, embedded systems and TinyML, followed by where to go from here.
minutes: 100
kind: checkpoint
language: rust
---

This test covers Phases 9 to 13. As before, take it without looking back at the lessons first.

**Passing standard:** at least three of the four exercises pass, and you score at least 10/12 on the quiz.

:::quiz final-rs-quiz Final quiz, part 2
? Which line fails to compile? `let s = String::from("a"); let t = s; let u = &t; println!("{s}");`
- [x] `println!("{s}")`: s was moved into t
- [ ] `let u = &t;`
- [ ] Nothing fails
> A String has one owner; after `let t = s;` the name `s` can't be used.

? A function signature is `fn parse(text: &str) -> Result<Market, ParseError>`. What does `?` do on an `Err` inside it?
- [ ] Panics
- [x] Returns the error to the caller (converting it with From if needed)
- [ ] Ignores it
> `?` is early return for errors.

? You need a collection of different model types that all implement `Predict`. What do you use?
- [ ] `Vec<impl Predict>`
- [x] `Vec<Box<dyn Predict>>`
- [ ] A generic `Vec<T>`
> Trait objects allow mixed types.

? Which type lets several threads update a shared counter map?
- [ ] `Rc<RefCell<HashMap<..>>>`
- [x] `Arc<Mutex<HashMap<..>>>`
- [ ] `&mut HashMap<..>` passed to each thread
> Arc for shared ownership across threads, Mutex for exclusive access.

? What does an async function return when called?
- [x] A future that does nothing until it's polled
- [ ] The result, after waiting
- [ ] A thread handle
> An executor (Tokio, Embassy) drives futures to completion.

? Why move a Python hot loop into Rust with PyO3 rather than rewriting the whole project?
- [x] Python stays for what it's good at; only the measured bottleneck changes, and it can be tested against the Python version
- [ ] PyO3 rewrites the rest automatically
- [ ] Rust can't read CSV files
> Profile first, then replace the hot spot.

? A button reads 1 when released and 0 when pressed. Which pin configuration is that?
- [x] Input with a pull-up, button to ground
- [ ] Input with a pull-down, button to 3.3 V
- [ ] Output
> Active low.

? An I2C sensor's 16-bit register reads 0xFF38. As a signed (two's complement) value, that's:
- [ ] 65336
- [x] −200
- [ ] 200
> 0xFF38 = 65336, and 65336 − 65536 = −200.

? Where should firmware feed the watchdog?
- [ ] In a timer interrupt
- [x] In the main loop, after the essential work is done
- [ ] Once at boot
> Feeding it from an interrupt keeps a frozen main loop alive.

? Why are TinyML models quantized to int8?
- [x] 4× less memory than f32 and fast integer arithmetic on chips without an FPU
- [ ] int8 models are more accurate
- [ ] Rust can't use floats
> At a small, measured accuracy cost.

? How is a layer's output turned back into int8 without floats on the device?
- [ ] By dividing by 256
- [x] Multiplying the int32 accumulator by a fixed-point multiplier and shifting right
- [ ] It isn't: the next layer uses int32 inputs
> (acc × m + 2^(shift−1)) >> shift.

? The device and the Python int8 reference disagree on a logged window. What does it indicate?
- [ ] The model needs retraining
- [x] An implementation difference in the features or integer inference
- [ ] Normal quantization error
> The int8 reference already includes quantization error; they should match exactly.
:::

:::exercise final-rs-top-teams Elo leaderboard
Write `top_teams(results: &[(&str, &str, u8, u8)], k: f64, n: usize) -> Vec<(String, i32)>`. Every team starts at 1500. For each result in order, update both teams' Elo ratings (expected home score `1 / (1 + 10^((away − home) / 400))`, actual 1, 0.5 or 0, change `k × (actual − expected)`). Return the `n` highest-rated teams as `(name, rating rounded to the nearest integer)`, highest first, breaking ties alphabetically.

@@starter
use std::collections::HashMap;

fn top_teams(results: &[(&str, &str, u8, u8)], k: f64, n: usize) -> Vec<(String, i32)> {
    todo!()
}

@@solution
use std::collections::HashMap;

fn top_teams(results: &[(&str, &str, u8, u8)], k: f64, n: usize) -> Vec<(String, i32)> {
    let mut ratings: HashMap<&str, f64> = HashMap::new();
    for &(home, away, hg, ag) in results {
        let rh = *ratings.get(home).unwrap_or(&1500.0);
        let ra = *ratings.get(away).unwrap_or(&1500.0);
        let expected = 1.0 / (1.0 + 10f64.powf((ra - rh) / 400.0));
        let actual = if hg > ag { 1.0 } else if hg == ag { 0.5 } else { 0.0 };
        let change = k * (actual - expected);
        ratings.insert(home, rh + change);
        ratings.insert(away, ra - change);
    }
    let mut table: Vec<(String, f64)> = ratings.into_iter().map(|(t, r)| (t.to_string(), r)).collect();
    table.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    table.into_iter().take(n).map(|(t, r)| (t, r.round() as i32)).collect()
}

@@tests
/// One win between equal teams
#[test]
fn one_match() {
    assert_eq!(top_teams(&[("A", "B", 1, 0)], 20.0, 2), vec![("A".to_string(), 1510), ("B".to_string(), 1490)]);
}

/// A short season
#[test]
fn season() {
    let results = [("A", "B", 2, 0), ("C", "A", 1, 1), ("B", "C", 0, 3), ("A", "C", 2, 1)];
    let top = top_teams(&results, 20.0, 3);
    assert_eq!(top[0].0, "A");
    assert_eq!(top.iter().map(|t| t.1).sum::<i32>(), 4500, "Elo is zero-sum: {top:?}");
}

/// Ties are alphabetical, and n limits the list
#[test]
fn ties() {
    let top = top_teams(&[("Z", "Y", 0, 0), ("B", "A", 1, 1)], 20.0, 3);
    assert_eq!(top, vec![("A".to_string(), 1500), ("B".to_string(), 1500), ("Y".to_string(), 1500)]);
}

@@hint
Keep a `HashMap<&str, f64>`, then collect into a Vec and sort with `b.1.total_cmp(&a.1).then(a.0.cmp(&b.0))`.
:::

:::exercise final-rs-neuron An int8 neuron
Write `neuron(x: &[i8], w: &[i8], bias: i32, mult: i64, shift: u32) -> i8`: the int32 dot product of `x` and `w` plus `bias`, then ReLU, then requantize with `(acc × mult + 2^(shift − 1)) >> shift` and clamp to `0..=127`. It must never panic or overflow, for any slices of equal length up to 1000 elements.

@@starter
fn neuron(x: &[i8], w: &[i8], bias: i32, mult: i64, shift: u32) -> i8 {
    todo!()
}

@@solution
fn neuron(x: &[i8], w: &[i8], bias: i32, mult: i64, shift: u32) -> i8 {
    let mut acc = bias as i64;
    for (a, b) in x.iter().zip(w) {
        acc += *a as i64 * *b as i64;
    }
    let acc = acc.max(0);
    ((acc * mult + (1i64 << (shift - 1))) >> shift).clamp(0, 127) as i8
}

@@tests
/// Dot product, bias and requantization
#[test]
fn basic() {
    // 2*3 + (-1)*4 + 100 = 102; × 0.5 = 51
    assert_eq!(neuron(&[2, -1], &[3, 4], 100, 1 << 23, 24), 51);
}

/// ReLU zeroes negative sums
#[test]
fn relu() {
    assert_eq!(neuron(&[10], &[-10], 0, 1 << 24, 24), 0);
}

/// Extreme inputs don't overflow and saturate at 127
#[test]
fn extremes() {
    let x = [-128i8; 1000];
    let w = [-128i8; 1000];
    assert_eq!(neuron(&x, &w, i32::MAX, 1 << 24, 24), 127);
}

@@hint
Accumulate in `i64`: 1000 products of 128 × 128 plus `i32::MAX` overflows an `i32`.
:::

:::exercise final-rs-long-press A long-press detector
Write a `LongPress` state machine for a button sampled every few milliseconds. `update(&mut self, pressed: bool, now_ms: u32) -> Option<Event>`:

- when the button goes down, remember the time
- if it's held for `HOLD_MS` (1000 ms) or more, report `Event::Long` **once**, while it's still held
- when it's released before that, report `Event::Short`
- releasing after a long press reports nothing

@@starter
const HOLD_MS: u32 = 1000;

#[derive(Debug, PartialEq)]
enum Event {
    Short,
    Long,
}

struct LongPress {
    down_since: Option<u32>,
    reported_long: bool,
}

impl LongPress {
    fn new() -> LongPress {
        LongPress { down_since: None, reported_long: false }
    }

    fn update(&mut self, pressed: bool, now_ms: u32) -> Option<Event> {
        todo!()
    }
}

@@solution
const HOLD_MS: u32 = 1000;

#[derive(Debug, PartialEq)]
enum Event {
    Short,
    Long,
}

struct LongPress {
    down_since: Option<u32>,
    reported_long: bool,
}

impl LongPress {
    fn new() -> LongPress {
        LongPress { down_since: None, reported_long: false }
    }

    fn update(&mut self, pressed: bool, now_ms: u32) -> Option<Event> {
        match (pressed, self.down_since) {
            (true, None) => {
                self.down_since = Some(now_ms);
                self.reported_long = false;
                None
            }
            (true, Some(start)) if !self.reported_long && now_ms.wrapping_sub(start) >= HOLD_MS => {
                self.reported_long = true;
                Some(Event::Long)
            }
            (false, Some(_)) => {
                self.down_since = None;
                if self.reported_long { None } else { Some(Event::Short) }
            }
            _ => None,
        }
    }
}

@@tests
fn run(samples: &[(bool, u32)]) -> Vec<Event> {
    let mut lp = LongPress::new();
    samples.iter().filter_map(|&(p, t)| lp.update(p, t)).collect()
}

/// A quick press is Short
#[test]
fn short() {
    assert_eq!(run(&[(false, 0), (true, 10), (true, 200), (false, 300)]), vec![Event::Short]);
}

/// Holding reports Long once, while held, and nothing on release
#[test]
fn long() {
    let samples: Vec<(bool, u32)> = (0..30).map(|i| (i < 25, i * 50)).collect();
    assert_eq!(run(&samples), vec![Event::Long]);
}

/// Works across the u32 timer wrap-around
#[test]
fn wraps() {
    let start = u32::MAX - 100;
    let samples = [(true, start), (true, start.wrapping_add(500)), (true, start.wrapping_add(1100)), (false, start.wrapping_add(1200))];
    assert_eq!(run(&samples), vec![Event::Long]);
}

@@hint
`match (pressed, self.down_since)` covers the cases: just pressed, held long enough, released, and everything else.

@@hint
Use `now_ms.wrapping_sub(start)` for elapsed time: millisecond timers wrap around, just like MicroPython's `ticks_ms`.
:::

## You made it

If you've worked through the whole course, you've gone from `print("Hello")` to:

- clean, tested, packaged **Python**, and data work with **pandas**;
- the **maths and statistics** behind models, and how to judge evidence;
- **classical ML**, **applied ML** on betting and FX data, and **deep learning** with PyTorch;
- **backends** with FastAPI that serve your models;
- **Rust**, from ownership and borrowing to traits, generics, concurrency, async and unsafe;
- **ML in Rust**: models from scratch, PyO3 extensions, and moving models between languages with proof they match;
- **embedded systems**: electronics, MicroPython, I2C/SPI/UART, interrupts, and portable, testable embedded Rust with Embassy;
- **edge AI**: integer features, int8 quantization, and bit-exact inference running on a microcontroller;
- and a **capstone** system, on a server or on a device.

Most importantly, you've learned to be **skeptical of your own results**: to ask what was known at prediction time, what the baseline is, whether a difference is bigger than luck, and whether the deployed system really computes what you tested. That habit separates professionals from people who just fit models, or just write firmware.

**Where next:** follow the 90-day plan from the careers lesson. Build something of your own (ideally a device that solves a real problem for someone), contribute to an open-source Rust or ML project, read a paper a month, and write about what you learn. Good luck.

---
title: A rug-pull classifier
summary: Generate labelled launches with drifting scam tactics, train logistic regression from scratch to flag rug pulls, evaluate it walk-forward with precision and recall, catch a leaky feature, and find out what even a perfect scam filter is worth.
minutes: 70
kind: lesson
language: rust
---

Lesson 4's checklist used thresholds someone made up. A model can learn the weights from data instead, and, more importantly, an honest evaluation tells you how good *any* filter is, hand-written or learned. This lesson puts together three things from earlier phases: logistic regression from scratch (Phase 11), walk-forward validation and leakage (Phase 6), and precision and recall (Phase 5).

## A labelled dataset

In real data you rarely know for sure which tokens were rug pulls. In the simulator you do. Each launch gets the five features a bot could see at launch, generated from its fate with plenty of overlap, so no single signal gives the answer away:

- **liquidity unlocked** and **mint not revoked**: 1 or 0
- **top-10 share** of the supply
- **creator's past rugs**, as $\ln(1 + k)$ so a creator with 10 past rugs isn't treated as 10 times worse than one with 1
- **early buyers**, the log of the number of distinct buying wallets in the first five minutes

There's one more realistic touch: **scammers adapt**. As checkers started flagging unlocked liquidity, more scams switched to locking the liquidity and dumping their own supply instead. In the simulated data, the share of rugs with unlocked liquidity falls steadily over time.

```rust
/// A tiny deterministic random generator (xorshift), so we need no crates.
struct Rng(u64);

impl Rng {
    fn uniform(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }

    /// A standard normal sample (Box–Muller).
    fn normal(&mut self) -> f64 {
        let u1 = self.uniform().max(1e-12);
        let u2 = self.uniform();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Fate {
    Rug,
    Fade,
    PumpAndDump,
    Survivor,
}

/// One simulated token: its fate and its price each minute, relative to the launch price.
struct Launch {
    fate: Fate,
    prices: Vec<f64>,
}

fn simulate_launch(rng: &mut Rng, minutes: usize) -> Launch {
    let u = rng.uniform();
    let fate = if u < 0.30 {
        Fate::Rug
    } else if u < 0.85 {
        Fate::Fade
    } else if u < 0.98 {
        Fate::PumpAndDump
    } else {
        Fate::Survivor
    };
    let volatility = 0.03 + 0.06 * rng.uniform(); // per minute
    let rug_at = 5 + (rng.uniform() * (minutes - 10) as f64) as usize;
    let peak_at = 10 + (rng.uniform() * 50.0) as usize;
    let mut price = 1.0;
    let mut prices = Vec::with_capacity(minutes);
    for t in 0..minutes {
        let drift = match fate {
            Fate::Rug => 0.004,
            Fate::Fade => -0.012,
            Fate::PumpAndDump if t < peak_at => 0.05,
            Fate::PumpAndDump => -0.03,
            Fate::Survivor => 0.008,
        };
        price *= (drift + volatility * rng.normal()).exp();
        if fate == Fate::Rug && t == rug_at {
            price *= 0.01; // the liquidity is pulled
        }
        prices.push(price);
    }
    Launch { fate, prices }
}
const FEATURES: [&str; 5] = ["liquidity unlocked", "mint not revoked", "top-10 share", "creator's past rugs", "early buyers"];

/// What a bot can see at launch, as numbers. `t` is how far through the dataset this launch is (0 to 1).
fn observe(rng: &mut Rng, fate: Fate, t: f64) -> [f64; 5] {
    let is_rug = fate == Fate::Rug;
    let chance = |rng: &mut Rng, p: f64| if rng.uniform() < p { 1.0 } else { 0.0 };
    // Scammers adapt: later rugs lock their liquidity more often and dump their own supply instead.
    let unlocked = chance(rng, if is_rug { 0.9 - 0.5 * t } else { 0.25 });
    let mint = chance(rng, if is_rug { 0.35 } else { 0.05 });
    let top10_mean = match fate {
        Fate::Rug => 0.42,
        Fate::PumpAndDump => 0.38,
        _ => 0.25,
    };
    let top10 = (top10_mean + 0.1 * rng.normal()).clamp(0.05, 0.95);
    let mut past_rugs = 0.0_f64;
    while rng.uniform() < if is_rug { 0.55 } else { 0.15 } {
        past_rugs += 1.0;
    }
    let buyers = 4.1 + if is_rug { -0.15 } else { 0.0 } + 0.6 * rng.normal();
    [unlocked, mint, top10, (1.0 + past_rugs).ln(), buyers]
}

struct Token {
    launch: Launch,
    features: [f64; 5],
}

/// Launches in time order, each with what was visible at launch.
fn dataset(seed: u64, n: usize) -> Vec<Token> {
    let mut rng = Rng(seed);
    (0..n)
        .map(|i| {
            let launch = simulate_launch(&mut rng, 240);
            let features = observe(&mut rng, launch.fate, i as f64 / n as f64);
            Token { launch, features }
        })
        .collect()
}
fn main() {
    let tokens = dataset(7, 6000);
    print!("{:<12}", "");
    for name in FEATURES {
        print!("{name:>20}");
    }
    println!("{:>14}", "4h multiple");
    for fate in [Fate::Rug, Fate::Fade, Fate::PumpAndDump, Fate::Survivor] {
        let group: Vec<&Token> = tokens.iter().filter(|t| t.launch.fate == fate).collect();
        print!("{:<12}", format!("{fate:?}"));
        for j in 0..FEATURES.len() {
            print!("{:>20.2}", group.iter().map(|t| t.features[j]).sum::<f64>() / group.len() as f64);
        }
        println!("{:>14.2}", group.iter().map(|t| t.launch.prices[239]).sum::<f64>() / group.len() as f64);
    }

    // The same signal at the start and the end of the dataset.
    let rugs_unlocked = |ts: &[Token]| {
        let rugs: Vec<&Token> = ts.iter().filter(|t| t.launch.fate == Fate::Rug).collect();
        rugs.iter().filter(|t| t.features[0] == 1.0).count() as f64 / rugs.len() as f64
    };
    println!("rugs with unlocked liquidity: first 2000 launches {:.0}%, last 2000 {:.0}%",
        rugs_unlocked(&tokens[..2000]) * 100.0, rugs_unlocked(&tokens[4000..]) * 100.0);
}
```

Every feature differs between rugs and the rest *on average*, but the distributions overlap heavily: a third of rugs have locked liquidity, and a quarter of honest tokens don't. And the drift is large: a rule learned on the early launches will be out of date by the end.

## Training and walk-forward evaluation

The launches are in time order, so the evaluation must be too: train on the first 4,000 launches and test on the 2,000 that came after. A random split would mix future launches into training and hide the drift.

The labels are imbalanced (about 30% rugs), and the two kinds of mistake cost different amounts: missing a rug loses nearly your whole stake, while wrongly skipping a good token costs you an opportunity. So instead of accuracy, measure:

- **precision**: of the tokens the filter flags as rugs, what fraction really are?
- **recall**: of all the rugs, what fraction does the filter catch?

```rust
/// A tiny deterministic random generator (xorshift), so we need no crates.
struct Rng(u64);

impl Rng {
    fn uniform(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }

    /// A standard normal sample (Box–Muller).
    fn normal(&mut self) -> f64 {
        let u1 = self.uniform().max(1e-12);
        let u2 = self.uniform();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Fate {
    Rug,
    Fade,
    PumpAndDump,
    Survivor,
}

/// One simulated token: its fate and its price each minute, relative to the launch price.
struct Launch {
    fate: Fate,
    prices: Vec<f64>,
}

fn simulate_launch(rng: &mut Rng, minutes: usize) -> Launch {
    let u = rng.uniform();
    let fate = if u < 0.30 {
        Fate::Rug
    } else if u < 0.85 {
        Fate::Fade
    } else if u < 0.98 {
        Fate::PumpAndDump
    } else {
        Fate::Survivor
    };
    let volatility = 0.03 + 0.06 * rng.uniform(); // per minute
    let rug_at = 5 + (rng.uniform() * (minutes - 10) as f64) as usize;
    let peak_at = 10 + (rng.uniform() * 50.0) as usize;
    let mut price = 1.0;
    let mut prices = Vec::with_capacity(minutes);
    for t in 0..minutes {
        let drift = match fate {
            Fate::Rug => 0.004,
            Fate::Fade => -0.012,
            Fate::PumpAndDump if t < peak_at => 0.05,
            Fate::PumpAndDump => -0.03,
            Fate::Survivor => 0.008,
        };
        price *= (drift + volatility * rng.normal()).exp();
        if fate == Fate::Rug && t == rug_at {
            price *= 0.01; // the liquidity is pulled
        }
        prices.push(price);
    }
    Launch { fate, prices }
}
const FEATURES: [&str; 5] = ["liquidity unlocked", "mint not revoked", "top-10 share", "creator's past rugs", "early buyers"];

/// What a bot can see at launch, as numbers. `t` is how far through the dataset this launch is (0 to 1).
fn observe(rng: &mut Rng, fate: Fate, t: f64) -> [f64; 5] {
    let is_rug = fate == Fate::Rug;
    let chance = |rng: &mut Rng, p: f64| if rng.uniform() < p { 1.0 } else { 0.0 };
    // Scammers adapt: later rugs lock their liquidity more often and dump their own supply instead.
    let unlocked = chance(rng, if is_rug { 0.9 - 0.5 * t } else { 0.25 });
    let mint = chance(rng, if is_rug { 0.35 } else { 0.05 });
    let top10_mean = match fate {
        Fate::Rug => 0.42,
        Fate::PumpAndDump => 0.38,
        _ => 0.25,
    };
    let top10 = (top10_mean + 0.1 * rng.normal()).clamp(0.05, 0.95);
    let mut past_rugs = 0.0_f64;
    while rng.uniform() < if is_rug { 0.55 } else { 0.15 } {
        past_rugs += 1.0;
    }
    let buyers = 4.1 + if is_rug { -0.15 } else { 0.0 } + 0.6 * rng.normal();
    [unlocked, mint, top10, (1.0 + past_rugs).ln(), buyers]
}

struct Token {
    launch: Launch,
    features: [f64; 5],
}

/// Launches in time order, each with what was visible at launch.
fn dataset(seed: u64, n: usize) -> Vec<Token> {
    let mut rng = Rng(seed);
    (0..n)
        .map(|i| {
            let launch = simulate_launch(&mut rng, 240);
            let features = observe(&mut rng, launch.fate, i as f64 / n as f64);
            Token { launch, features }
        })
        .collect()
}
fn sigmoid(z: f64) -> f64 {
    if z >= 0.0 { 1.0 / (1.0 + (-z).exp()) } else { let e = z.exp(); e / (1.0 + e) }
}

/// Logistic regression by gradient descent on standardised features.
struct Model {
    mean: [f64; 5],
    std: [f64; 5],
    w: [f64; 5],
    b: f64,
}

impl Model {
    fn fit(xs: &[[f64; 5]], ys: &[f64]) -> Model {
        let n = xs.len() as f64;
        let mut mean = [0.0; 5];
        let mut std = [0.0; 5];
        for j in 0..5 {
            mean[j] = xs.iter().map(|x| x[j]).sum::<f64>() / n;
            std[j] = (xs.iter().map(|x| (x[j] - mean[j]).powi(2)).sum::<f64>() / n).sqrt().max(1e-9);
        }
        let mut model = Model { mean, std, w: [0.0; 5], b: 0.0 };
        for _ in 0..500 {
            let (mut gw, mut gb) = ([0.0; 5], 0.0);
            for (x, &y) in xs.iter().zip(ys) {
                let z = model.scale(x);
                let err = sigmoid(model.score(&z)) - y;
                for j in 0..5 {
                    gw[j] += err * z[j];
                }
                gb += err;
            }
            for j in 0..5 {
                model.w[j] -= 0.5 * gw[j] / n;
            }
            model.b -= 0.5 * gb / n;
        }
        model
    }

    fn scale(&self, x: &[f64; 5]) -> [f64; 5] {
        let mut z = [0.0; 5];
        for j in 0..5 {
            z[j] = (x[j] - self.mean[j]) / self.std[j];
        }
        z
    }

    fn score(&self, z: &[f64; 5]) -> f64 {
        self.b + self.w.iter().zip(z).map(|(w, v)| w * v).sum::<f64>()
    }

    fn predict(&self, x: &[f64; 5]) -> f64 {
        sigmoid(self.score(&self.scale(x)))
    }
}

/// Precision and recall for "is a rug" at a probability threshold.
fn precision_recall(ys: &[f64], ps: &[f64], threshold: f64) -> (f64, f64) {
    let (mut tp, mut flagged, mut rugs) = (0.0_f64, 0.0_f64, 0.0_f64);
    for (&y, &p) in ys.iter().zip(ps) {
        if p >= threshold {
            flagged += 1.0;
            tp += y;
        }
        rugs += y;
    }
    (tp / flagged.max(1.0), tp / rugs.max(1.0))
}

fn main() {
    let tokens = dataset(7, 6000);
    let ys: Vec<f64> = tokens.iter().map(|t| if t.launch.fate == Fate::Rug { 1.0 } else { 0.0 }).collect();
    let xs: Vec<[f64; 5]> = tokens.iter().map(|t| t.features).collect();
    // Walk forward: train on the first two-thirds of launches, test on the later third.
    let split = 4000;
    let model = Model::fit(&xs[..split], &ys[..split]);
    for (name, w) in FEATURES.iter().zip(model.w) {
        println!("{name:>20}: weight {w:+.2}");
    }

    for (label, range) in [("train", 0..split), ("test", split..tokens.len())] {
        let ps: Vec<f64> = xs[range.clone()].iter().map(|x| model.predict(x)).collect();
        let (p, r) = precision_recall(&ys[range.clone()], &ps, 0.5);
        println!("{label:>5}: precision {:.2}, recall {:.2}", p, r);
    }
    // The checklist from lesson 4: unlocked liquidity or an unrevoked mint is a dealbreaker.
    let rule: Vec<f64> = xs[split..].iter().map(|x| if x[0] == 1.0 || x[1] == 1.0 { 1.0 } else { 0.0 }).collect();
    let (p, r) = precision_recall(&ys[split..], &rule, 0.5);
    println!(" rule: precision {:.2}, recall {:.2}", p, r);

    let mean = |ts: &[&Token]| ts.iter().map(|t| t.launch.prices[239]).sum::<f64>() / ts.len() as f64;
    let test: Vec<&Token> = tokens[split..].iter().collect();
    let passed: Vec<&Token> = test.iter().copied().filter(|t| model.predict(&t.features) < 0.5).collect();
    let no_rugs: Vec<&Token> = test.iter().copied().filter(|t| t.launch.fate != Fate::Rug).collect();
    println!("mean 4h multiple: all {:.2}, model's picks {:.2}, perfect rug filter {:.2}", mean(&test), mean(&passed), mean(&no_rugs));
}
```

Read the results carefully:

- **Every honest feature gets a sensible weight.** Concentration, past rugs, unlocked liquidity and an unrevoked mint all push towards "rug"; more early buyers push slightly away.
- **Recall drops from training to test.** Not because of overfitting (five weights can't overfit 4,000 examples), but because the scammers changed tactics. This is the population drift you measured with the PSI in Phase 6, and it's permanent in an adversarial market: **retrain regularly, and always evaluate on data from after the training period.**
- **The model beats the checklist on precision by a wide margin.** The checklist flags every token with unlocked liquidity, which includes lots of honest ones.
- **The last line is the important one.** Filtering out the model's flagged tokens improves the average result a little. Filtering out *every* rug, perfectly, still leaves an average loss of about 70%. Most tokens that aren't scams still fade to nothing.

A scam filter is necessary but nowhere near sufficient. It removes the worst losers, and a strategy still has to find the rare winners among what's left. Lesson 7 tests whether a simple one can.

## A leaky feature

It's tempting to add more features. Here's one that looks like a strong signal: the worst one-minute drop in the token's first four hours.

```rust
/// A tiny deterministic random generator (xorshift), so we need no crates.
struct Rng(u64);

impl Rng {
    fn uniform(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }

    /// A standard normal sample (Box–Muller).
    fn normal(&mut self) -> f64 {
        let u1 = self.uniform().max(1e-12);
        let u2 = self.uniform();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Fate {
    Rug,
    Fade,
    PumpAndDump,
    Survivor,
}

/// One simulated token: its fate and its price each minute, relative to the launch price.
struct Launch {
    fate: Fate,
    prices: Vec<f64>,
}

fn simulate_launch(rng: &mut Rng, minutes: usize) -> Launch {
    let u = rng.uniform();
    let fate = if u < 0.30 {
        Fate::Rug
    } else if u < 0.85 {
        Fate::Fade
    } else if u < 0.98 {
        Fate::PumpAndDump
    } else {
        Fate::Survivor
    };
    let volatility = 0.03 + 0.06 * rng.uniform(); // per minute
    let rug_at = 5 + (rng.uniform() * (minutes - 10) as f64) as usize;
    let peak_at = 10 + (rng.uniform() * 50.0) as usize;
    let mut price = 1.0;
    let mut prices = Vec::with_capacity(minutes);
    for t in 0..minutes {
        let drift = match fate {
            Fate::Rug => 0.004,
            Fate::Fade => -0.012,
            Fate::PumpAndDump if t < peak_at => 0.05,
            Fate::PumpAndDump => -0.03,
            Fate::Survivor => 0.008,
        };
        price *= (drift + volatility * rng.normal()).exp();
        if fate == Fate::Rug && t == rug_at {
            price *= 0.01; // the liquidity is pulled
        }
        prices.push(price);
    }
    Launch { fate, prices }
}
const FEATURES: [&str; 5] = ["liquidity unlocked", "mint not revoked", "top-10 share", "creator's past rugs", "early buyers"];

/// What a bot can see at launch, as numbers. `t` is how far through the dataset this launch is (0 to 1).
fn observe(rng: &mut Rng, fate: Fate, t: f64) -> [f64; 5] {
    let is_rug = fate == Fate::Rug;
    let chance = |rng: &mut Rng, p: f64| if rng.uniform() < p { 1.0 } else { 0.0 };
    // Scammers adapt: later rugs lock their liquidity more often and dump their own supply instead.
    let unlocked = chance(rng, if is_rug { 0.9 - 0.5 * t } else { 0.25 });
    let mint = chance(rng, if is_rug { 0.35 } else { 0.05 });
    let top10_mean = match fate {
        Fate::Rug => 0.42,
        Fate::PumpAndDump => 0.38,
        _ => 0.25,
    };
    let top10 = (top10_mean + 0.1 * rng.normal()).clamp(0.05, 0.95);
    let mut past_rugs = 0.0_f64;
    while rng.uniform() < if is_rug { 0.55 } else { 0.15 } {
        past_rugs += 1.0;
    }
    let buyers = 4.1 + if is_rug { -0.15 } else { 0.0 } + 0.6 * rng.normal();
    [unlocked, mint, top10, (1.0 + past_rugs).ln(), buyers]
}

struct Token {
    launch: Launch,
    features: [f64; 5],
}

/// Launches in time order, each with what was visible at launch.
fn dataset(seed: u64, n: usize) -> Vec<Token> {
    let mut rng = Rng(seed);
    (0..n)
        .map(|i| {
            let launch = simulate_launch(&mut rng, 240);
            let features = observe(&mut rng, launch.fate, i as f64 / n as f64);
            Token { launch, features }
        })
        .collect()
}
fn main() {
    let tokens = dataset(7, 6000);
    println!("features a bot can see at launch: {FEATURES:?}");
    // A tempting extra feature: the worst one-minute drop in the token's first four hours.
    let worst_drop = |t: &Token| {
        t.launch.prices.windows(2).map(|w| 1.0 - w[1] / w[0]).fold(0.0, f64::max)
    };
    let (mut flagged, mut correct) = (0, 0);
    let rugs = tokens.iter().filter(|t| t.launch.fate == Fate::Rug).count();
    for t in &tokens {
        if worst_drop(t) > 0.9 {
            flagged += 1;
            if t.launch.fate == Fate::Rug {
                correct += 1;
            }
        }
    }
    println!("rule 'worst one-minute drop > 90%': precision {:.2}, recall {:.2}",
        correct as f64 / flagged as f64, correct as f64 / rugs as f64);
    // Many of those rugs looked clean at launch: locked liquidity and a revoked mint.
    let clean = tokens.iter().filter(|t| t.launch.fate == Fate::Rug && t.features[0] == 0.0 && t.features[1] == 0.0).count();
    println!("{clean} of the {rugs} rugs had locked liquidity and a revoked mint at launch");
}
```

Perfect precision and recall, including the rugs that looked clean at launch. It's perfect because it *is* the label: a rug pull is a 99% drop in one minute, and the feature measures it after it has happened. A bot deciding whether to buy at launch can't know it.

Leaks in real projects are rarely this obvious. Any feature computed over a time window, such as "holders after one hour", "volume today" or "was it flagged by a checker", must end **before the moment the bot decides**. Write the decision time into each feature's name or type, and test it.

## Practice

:::exercise meme-precision-recall Precision and recall
Write `precision_recall(ys: &[f64], ps: &[f64], threshold: f64) -> (f64, f64)`. `ys` are labels (1.0 for a rug, 0.0 otherwise) and `ps` predicted probabilities. A token is **flagged** when `p >= threshold`.

- precision = flagged rugs / all flagged tokens (0.0 if nothing is flagged)
- recall = flagged rugs / all rugs (0.0 if there are no rugs)

Then write `best_threshold(ys: &[f64], ps: &[f64], min_precision: f64) -> Option<f64>`: among the thresholds `0.05, 0.10, …, 0.95`, the one with the highest recall whose precision is at least `min_precision` (the lowest such threshold if several tie), or `None` if none qualifies. Generate the thresholds from integers (`k as f64 / 20.0`) rather than adding 0.05 repeatedly, which accumulates rounding errors.

@@starter
fn precision_recall(ys: &[f64], ps: &[f64], threshold: f64) -> (f64, f64) {
    todo!()
}

fn best_threshold(ys: &[f64], ps: &[f64], min_precision: f64) -> Option<f64> {
    todo!()
}

@@solution
fn precision_recall(ys: &[f64], ps: &[f64], threshold: f64) -> (f64, f64) {
    let (mut tp, mut flagged, mut rugs) = (0.0_f64, 0.0_f64, 0.0_f64);
    for (&y, &p) in ys.iter().zip(ps) {
        if p >= threshold {
            flagged += 1.0;
            tp += y;
        }
        rugs += y;
    }
    let precision = if flagged > 0.0 { tp / flagged } else { 0.0 };
    let recall = if rugs > 0.0 { tp / rugs } else { 0.0 };
    (precision, recall)
}

fn best_threshold(ys: &[f64], ps: &[f64], min_precision: f64) -> Option<f64> {
    let mut best: Option<(f64, f64)> = None;
    for k in 1..20 {
        let t = k as f64 / 20.0;
        let (p, r) = precision_recall(ys, ps, t);
        if p >= min_precision && best.is_none_or(|(_, best_r)| r > best_r) {
            best = Some((t, r));
        }
    }
    best.map(|(t, _)| t)
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// Counts at a threshold
#[test]
fn counts() {
    let ys = [1.0, 1.0, 0.0, 0.0, 1.0];
    let ps = [0.9, 0.4, 0.6, 0.1, 0.7];
    let (p, r) = precision_recall(&ys, &ps, 0.5);
    assert!(close(p, 2.0 / 3.0) && close(r, 2.0 / 3.0), "got {p}, {r}");
}

/// Nothing flagged, or no rugs
#[test]
fn edge_cases() {
    assert_eq!(precision_recall(&[1.0, 0.0], &[0.1, 0.2], 0.5), (0.0, 0.0));
    assert_eq!(precision_recall(&[0.0, 0.0], &[0.9, 0.2], 0.5), (0.0, 0.0));
}

/// The threshold with the best recall at the required precision
#[test]
fn threshold() {
    let ys = [1.0, 1.0, 1.0, 0.0, 0.0, 0.0];
    let ps = [0.9, 0.7, 0.3, 0.6, 0.2, 0.1];
    // At 0.65 and above: precision 1.0, recall 2/3. Lower thresholds let in the 0.6 non-rug.
    assert_eq!(best_threshold(&ys, &ps, 1.0), Some(0.65));
    // Allowing precision 0.75 reaches the rug at 0.3 too.
    assert_eq!(best_threshold(&ys, &ps, 0.75), Some(0.25));
    assert_eq!(best_threshold(&[0.0, 0.0], &[0.9, 0.8], 0.5), None);
}

@@hint
`ys` are 0.0 or 1.0, so adding `y` for each flagged token counts the flagged rugs.

@@hint
Loop `for k in 1..20` with `let t = k as f64 / 20.0;`. Only replace the best when recall is strictly higher, so ties keep the lower threshold.
:::

:::exercise meme-walk-forward Walk-forward splits
Retraining regularly means evaluating the same way: train on everything up to a point, test on the next block, move forward, repeat. Write `walk_forward(n: usize, min_train: usize, test_size: usize) -> Vec<(std::ops::Range<usize>, std::ops::Range<usize>)>` returning `(train, test)` index ranges:

- the first fold trains on `0..min_train` and tests on `min_train..min_train + test_size`
- each later fold's training range grows to include the previous test block, and its test block is the next `test_size` indices
- the last test block may be shorter if `n` isn't a multiple, but must not be empty, and nothing may go past `n`

For example, `walk_forward(10, 4, 3)` is `[(0..4, 4..7), (0..7, 7..10)]`.

@@starter
use std::ops::Range;

fn walk_forward(n: usize, min_train: usize, test_size: usize) -> Vec<(Range<usize>, Range<usize>)> {
    todo!()
}

@@solution
use std::ops::Range;

fn walk_forward(n: usize, min_train: usize, test_size: usize) -> Vec<(Range<usize>, Range<usize>)> {
    let mut folds = Vec::new();
    let mut start = min_train;
    while start < n {
        let end = (start + test_size).min(n);
        folds.push((0..start, start..end));
        start = end;
    }
    folds
}

@@tests
/// The example from the prompt
#[test]
fn example() {
    assert_eq!(walk_forward(10, 4, 3), vec![(0..4, 4..7), (0..7, 7..10)]);
}

/// A short last block
#[test]
fn short_last() {
    assert_eq!(walk_forward(9, 4, 3), vec![(0..4, 4..7), (0..7, 7..9)]);
}

/// Test blocks never overlap their training data and cover the rest exactly once
#[test]
fn covers() {
    let folds = walk_forward(6000, 4000, 500);
    assert_eq!(folds.len(), 4);
    let mut next = 4000;
    for (train, test) in &folds {
        assert_eq!(train.end, test.start);
        assert_eq!(test.start, next);
        next = test.end;
    }
    assert_eq!(next, 6000);
}

/// Not enough data for any test block
#[test]
fn too_small() {
    assert!(walk_forward(100, 100, 10).is_empty());
}

@@hint
Keep a `start` index. Each fold is `(0..start, start..end)` with `end = (start + test_size).min(n)`; then set `start = end`.
:::

:::quiz meme-classifier-check Quick check
? The classifier's recall falls from training to test even though it has only five weights. What's the most likely reason?
- [ ] Overfitting
- [x] The scammers' tactics drifted after the training period
- [ ] The test set is too small
> Five weights can't memorise 4,000 launches. The data changed, which in an adversarial market it always will.

? Why evaluate a scam filter with precision and recall rather than accuracy?
- [ ] Accuracy can't be computed for probabilities
- [x] The classes are imbalanced and the two kinds of mistake cost very different amounts
- [ ] Precision and recall are always higher
> Missing a rug can cost the whole stake; skipping a good token costs an opportunity.

? A feature is "number of holders one hour after launch". When can a bot use it?
- [ ] Always: it's public on-chain data
- [x] Only for decisions made at least one hour after launch
- [ ] Never
> Public doesn't mean available yet. A feature must be computed from data that existed at decision time.

? Even a perfect rug filter leaves an average loss in the simulation. Why?
- [ ] The filter flags too many tokens
- [x] Most honest tokens still lose most of their value; scams are only one way to lose
- [ ] Fees are too high
> Avoiding scams removes the worst outcomes, but finding profitable trades among the rest is a separate, harder problem.
:::

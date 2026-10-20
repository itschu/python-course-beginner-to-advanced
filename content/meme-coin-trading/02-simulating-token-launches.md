---
title: Simulating token launches
summary: Build a seeded simulator of ten thousand launches (rug pulls, fades, pump-and-dumps and rare survivors), measure what buying at launch really returns, and see survivorship bias turn a losing strategy into a winning backtest.
minutes: 55
kind: lesson
language: rust
---

Before writing a bot, you need somewhere to test it where you know the truth. Real historical data hides the truth in two ways: you never learn which tokens were scams, and most data providers quietly drop tokens that died. A **simulator** fixes both. You decide how the market behaves, so you can check whether your tools recover what you put in.

The simulator in this lesson is used for the rest of the elective. It's deliberately simple, but it has the shape of the real thing: most tokens die, a few explode, and the average is dominated by rare winners.

## Four fates

Each simulated token gets one of four fates when it launches:

| Fate | Share | What happens |
| --- | --- | --- |
| `Rug` | 30% | Drifts up a little to attract buyers, then the creator pulls the liquidity and the price drops 99% in a minute |
| `Fade` | 55% | No scam, just no new buyers: the price bleeds away |
| `PumpAndDump` | 13% | A coordinated run-up for 10–60 minutes, then insiders sell and it collapses |
| `Survivor` | 2% | Attention keeps growing and the price trends up |

Prices move by a random percentage each minute, a **geometric random walk**: multiply by $e^{\mu + \sigma Z}$ where $\mu$ is the fate's drift, $\sigma$ the token's volatility (3–9% a minute, which is wild but realistic for new tokens) and $Z$ a standard normal sample. Prices are relative to the launch price, so 2.0 means "doubled" and 0.01 means "lost 99%".

The random generator is the xorshift you used in Phase 11, plus Box–Muller to turn uniform samples into normal ones. Seeding it makes every run identical, which matters more than it sounds: when a backtest result changes, you want to know it's because your code changed, not your luck.

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
fn main() {
    let mut rng = Rng(2024);
    let launches: Vec<Launch> = (0..10_000).map(|_| simulate_launch(&mut rng, 240)).collect();

    println!("{:<12} {:>6} {:>14} {:>16}", "fate", "count", "median after 4h", "average peak");
    for fate in [Fate::Rug, Fate::Fade, Fate::PumpAndDump, Fate::Survivor] {
        let group: Vec<&Launch> = launches.iter().filter(|l| l.fate == fate).collect();
        let mut finals: Vec<f64> = group.iter().map(|l| l.prices[l.prices.len() - 1]).collect();
        finals.sort_by(f64::total_cmp);
        let peak = group.iter().map(|l| l.prices.iter().cloned().fold(0.0, f64::max)).sum::<f64>() / group.len() as f64;
        println!("{:<12} {:>6} {:>14.3}x {:>15.2}x", format!("{fate:?}"), group.len(), finals[finals.len() / 2], peak);
    }
}
```

Two things stand out. First, rugs and pump-and-dumps both *peak* well above the launch price before collapsing: a chart of the first half hour can't tell them apart from a survivor. Second, the survivors are spectacular, often up five-fold or more in four hours. That's the lottery ticket that keeps people buying.

## What buying at launch returns

Suppose you buy every token at launch and sell four hours later. Each trade's result is its final price multiple. The **mean** tells you what you'd make on average per unit staked; the **median** tells you what a typical trade looks like:

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
fn main() {
    let mut rng = Rng(2024);
    let launches: Vec<Launch> = (0..10_000).map(|_| simulate_launch(&mut rng, 240)).collect();
    let rugs = launches.iter().filter(|l| l.fate == Fate::Rug).count();
    println!("{rugs} of {} launches were rug pulls", launches.len());
    let mut finals: Vec<f64> = launches.iter().map(|l| l.prices[l.prices.len() - 1]).collect();
    finals.sort_by(f64::total_cmp);

    let n = finals.len() as f64;
    let mean = finals.iter().sum::<f64>() / n;
    let wiped = finals.iter().filter(|&&m| m <= 0.1).count() as f64 / n;
    let doubled = finals.iter().filter(|&&m| m >= 2.0).count() as f64 / n;
    println!("mean multiple   {mean:.3}  (an average loss of {:.0}% per trade)", (1.0 - mean) * 100.0);
    println!("median multiple {:.3}", finals[finals.len() / 2]);
    println!("lost 90% or more: {:.1}% of tokens", wiped * 100.0);
    println!("at least doubled: {:.1}% of tokens", doubled * 100.0);

    let best: f64 = finals[finals.len() - 100..].iter().sum();
    println!("the best 1% of tokens hold {:.0}% of all the money returned", best / finals.iter().sum::<f64>() * 100.0);
}
```

Buying everything loses about 70% on average, and the typical token loses over 95%. Yet a small share of tokens doubles or better, and the best 1% hold a large share of everything that comes back. This is a **heavy-tailed** distribution, and it has nasty consequences:

- **Small samples lie.** If you test a strategy on 50 tokens, whether you happen to include one big survivor decides the result.
- **The mean and the median tell different stories.** Always report both, plus the share of trades that lost almost everything.
- **Fees are paid on every trade, not just the winners.** Lesson 3 adds them.

## Survivorship bias

Now suppose you build your dataset the way many people do: from a screener or an API that lists tokens that are *still trading*. Dead tokens drop off those lists. What does "buy at launch, sell after four hours" look like if you only test it on tokens that are still worth at least half their launch price?

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
fn main() {
    let mut rng = Rng(2024);
    let launches: Vec<Launch> = (0..10_000).map(|_| simulate_launch(&mut rng, 240)).collect();
    let last = |l: &Launch| l.prices[l.prices.len() - 1];
    let mean = |ls: &[&Launch]| ls.iter().map(|l| last(l)).sum::<f64>() / ls.len() as f64;

    let all: Vec<&Launch> = launches.iter().collect();
    let still_listed: Vec<&Launch> = launches.iter().filter(|l| last(l) >= 0.5).collect();
    let survivors = still_listed.iter().filter(|l| l.fate == Fate::Survivor).count();
    println!("every launch:        {:>5} tokens, mean multiple {:.2}", all.len(), mean(&all));
    println!("tokens still listed: {:>5} tokens, mean multiple {:.2}", still_listed.len(), mean(&still_listed));
    println!("{survivors} of the {} tokens still listed are true survivors", still_listed.len());
}
```

Same strategy, same market. On the full universe it loses about 70%; on the survivors it makes over 600%. The filter didn't select tokens you could have identified at launch: it selected tokens by their *future*, which is a form of the data leakage you met in Phase 6. **Any backtest of meme coins has to include every token that launched, dead ones included.** That's one reason lesson 7's backtester replays the simulator's full output rather than a list of interesting tokens.

:::tip How realistic is this?
The proportions here are illustrative, not measured. Real launchpads see tens of thousands of tokens a day, and analyses of them consistently find that only a tiny fraction ever reach a decentralised exchange, and that most of those lose nearly all their value. The *shape* is what matters for this elective: mostly zeros, a few huge winners, and lots of tokens that look like winners for a while.
:::

## Practice

:::exercise meme-summary Summarising heavy-tailed returns
Write `summarise(multiples: &[f64]) -> Summary`, filling in this struct:

```text
struct Summary { mean: f64, median: f64, wiped: f64, doubled: f64 }
```

- `mean`: the average multiple
- `median`: the middle value after sorting; for an even count, the average of the two middle values
- `wiped`: the fraction of multiples at or below `0.1`
- `doubled`: the fraction at or above `2.0`

Don't change the caller's slice: sort a copy. `f64` doesn't implement `Ord`, so sort with `sort_by(f64::total_cmp)`.

@@starter
#[derive(Debug, PartialEq)]
struct Summary {
    mean: f64,
    median: f64,
    wiped: f64,
    doubled: f64,
}

fn summarise(multiples: &[f64]) -> Summary {
    todo!()
}

@@solution
#[derive(Debug, PartialEq)]
struct Summary {
    mean: f64,
    median: f64,
    wiped: f64,
    doubled: f64,
}

fn summarise(multiples: &[f64]) -> Summary {
    let n = multiples.len() as f64;
    let mut sorted = multiples.to_vec();
    sorted.sort_by(f64::total_cmp);
    let mid = sorted.len() / 2;
    let median = if sorted.len() % 2 == 0 { (sorted[mid - 1] + sorted[mid]) / 2.0 } else { sorted[mid] };
    Summary {
        mean: multiples.iter().sum::<f64>() / n,
        median,
        wiped: multiples.iter().filter(|&&m| m <= 0.1).count() as f64 / n,
        doubled: multiples.iter().filter(|&&m| m >= 2.0).count() as f64 / n,
    }
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-12
}

/// Odd count: the median is the middle value
#[test]
fn odd() {
    let s = summarise(&[0.05, 3.0, 0.5, 0.1, 10.0]);
    assert!(close(s.mean, 2.73), "mean {}", s.mean);
    assert!(close(s.median, 0.5), "median {}", s.median);
    assert!(close(s.wiped, 0.4) && close(s.doubled, 0.4), "{s:?}");
}

/// Even count: the median averages the two middle values
#[test]
fn even() {
    let s = summarise(&[4.0, 0.0, 1.0, 2.0]);
    assert!(close(s.median, 1.5), "median {}", s.median);
    assert!(close(s.wiped, 0.25) && close(s.doubled, 0.5), "{s:?}");
}

/// The input isn't reordered
#[test]
fn input_unchanged() {
    let data = vec![3.0, 1.0, 2.0];
    summarise(&data);
    assert_eq!(data, vec![3.0, 1.0, 2.0]);
}

@@hint
`let mut sorted = multiples.to_vec();` makes a copy you can sort.

@@hint
For an even length `n`, the middle values are at `n / 2 - 1` and `n / 2`.
:::

:::exercise meme-first-crash Spotting a crash
A bot watching a position needs to notice when the price has crashed from its high. Write `first_crash(prices: &[f64], drop: f64) -> Option<usize>`: the index of the first price that is at least `drop` (a fraction, e.g. `0.5` for 50%) below the **highest price so far**, including earlier prices but not itself. Return `None` if that never happens.

For example, with `[1.0, 2.0, 1.5, 0.9]` and `drop = 0.5`, the running high reaches 2.0, and 0.9 is 55% below it, so the answer is `Some(3)`.

@@starter
fn first_crash(prices: &[f64], drop: f64) -> Option<usize> {
    todo!()
}

@@solution
fn first_crash(prices: &[f64], drop: f64) -> Option<usize> {
    let mut high = f64::NEG_INFINITY;
    for (i, &p) in prices.iter().enumerate() {
        if high > 0.0 && p <= high * (1.0 - drop) {
            return Some(i);
        }
        high = high.max(p);
    }
    None
}

@@tests
/// The example from the prompt
#[test]
fn example() {
    assert_eq!(first_crash(&[1.0, 2.0, 1.5, 0.9], 0.5), Some(3));
}

/// A drop of exactly the threshold counts
#[test]
fn exact() {
    assert_eq!(first_crash(&[4.0, 2.0], 0.5), Some(1));
}

/// A steady climb never crashes
#[test]
fn climb() {
    assert_eq!(first_crash(&[1.0, 1.1, 1.2, 1.3], 0.1), None);
}

/// The high is measured before the current price
#[test]
fn uses_running_high() {
    // 0.7 is 30% below 1.0 but not 50%; 0.45 is 55% below the later high of 1.0
    assert_eq!(first_crash(&[1.0, 0.7, 0.8, 0.45], 0.5), Some(3));
    assert_eq!(first_crash(&[], 0.5), None);
}

@@hint
Keep the running high in a variable. Check the current price against it *before* updating it.
:::

:::quiz meme-sim-check Quick check
? In a heavy-tailed distribution of returns like this one, which statement is true?
- [ ] The mean and the median are about the same
- [x] A few extreme winners pull the mean far above the median
- [ ] Most trades are close to the average
> That's why you should report the median and the share of wipe-outs, not just the mean.

? A backtest uses tokens from a screener that only lists tokens still trading. What goes wrong?
- [ ] Nothing, as long as the strategy only uses information from the launch
- [x] Dead tokens are missing, so results are far better than the strategy could really achieve
- [ ] The backtest is too pessimistic
> Choosing tokens by whether they survived uses the future, even if each trade's signal doesn't.

? Why seed the random generator in a simulator?
- [x] So every run is identical, and a changed result means changed code, not luck
- [ ] So the simulation is more realistic
- [ ] Because unseeded generators are slower
> Reproducibility is what lets you debug and compare strategies fairly.
:::

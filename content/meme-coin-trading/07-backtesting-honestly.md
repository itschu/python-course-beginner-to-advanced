---
title: Backtesting honestly
summary: Replay every simulated launch through the scam filter and exit rules, with latency, price impact and fees, and report results that survive scrutiny. Then compare with the costless, survivorship-biased backtest most people run.
minutes: 65
kind: lesson
language: rust
---

A backtest answers one question: *if I had run this bot in the past, what would have happened?* Every shortcut in the answer makes the strategy look better than it is, so an honest backtest is mostly a list of things you refuse to skip:

1. **Every launch**, not a list of tokens that are still around (lesson 2).
2. **Only information available at decision time**, so no features measured afterwards (lesson 5), and no model trained on the period you're testing.
3. **Latency.** By the time your transaction lands, the price has moved. For a new token, faster bots have usually bought before you.
4. **Every cost**: price impact, pool fees both ways and per-transaction fees (lesson 3).
5. **The whole distribution of results**: not just total profit, but the worst drawdown, the share of winners, and how much depends on a handful of trades.

## A full backtest

The strategy combines the pieces built so far: buy 0.1 SOL of every launch whose rug risk, from lesson 5's model, is below 0.3; sell on a 50% trailing stop, a 3× target, or after two hours. It runs on the 2,000 launches **after** the model's training period, once with no costs and instant fills, and once with a one-minute delay, a 30 SOL pool, a 0.25% fee and 0.002 SOL per transaction.

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
/// Lesson 5's model, trained on the first 4,000 launches, with its weights pasted in.
fn rug_risk(x: &[f64; 5]) -> f64 {
    const W: [f64; 5] = [2.23, 2.44, 12.16, 2.25, -0.44];
    let z = -5.53 + W.iter().zip(x).map(|(w, v)| w * v).sum::<f64>();
    1.0 / (1.0 + (-z).exp())
}

/// How fills are modelled.
struct Costs {
    delay: usize,  // minutes between deciding and the transaction landing
    pool_sol: f64, // the pool's SOL reserve, for price impact
    fee: f64,      // pool fee each way
    per_tx: f64,   // network and priority fees per transaction, in SOL
}

const FREE: Costs = Costs { delay: 0, pool_sol: f64::INFINITY, fee: 0.0, per_tx: 0.0 };
const REAL: Costs = Costs { delay: 1, pool_sol: 30.0, fee: 0.0025, per_tx: 0.002 };

/// Buy at launch if the model's risk is low; sell on a stop or a target. Returns the trade's profit in SOL.
fn trade(launch: &Launch, stake: f64, costs: &Costs) -> f64 {
    let prices = &launch.prices;
    let entry_minute = costs.delay;
    // Constant-product price impact: a buy of s SOL into a pool of x SOL pays about (1 + s/x) times spot.
    let impact = 1.0 + stake / costs.pool_sol;
    let entry = prices[entry_minute] * impact;
    let tokens = (stake - costs.per_tx) * (1.0 - costs.fee) / entry;
    let mut high = prices[entry_minute];
    let mut exit_minute = prices.len() - 1;
    for t in entry_minute + 1..prices.len() {
        high = high.max(prices[t]);
        let p = prices[t];
        if p <= high * 0.5 || p >= prices[entry_minute] * 3.0 || t - entry_minute >= 120 {
            exit_minute = (t + costs.delay).min(prices.len() - 1);
            break;
        }
    }
    let proceeds = tokens * prices[exit_minute] / impact * (1.0 - costs.fee) - costs.per_tx;
    proceeds - stake
}

fn report(label: &str, pnls: &[f64], stake: f64) {
    let total: f64 = pnls.iter().sum();
    let wins = pnls.iter().filter(|&&p| p > 0.0).count();
    let mut sorted = pnls.to_vec();
    sorted.sort_by(f64::total_cmp);
    let without_best: f64 = sorted[..sorted.len() - 10].iter().sum();
    // Equity curve and its worst peak-to-trough fall.
    let (mut equity, mut peak, mut max_dd) = (0.0_f64, 0.0_f64, 0.0_f64);
    for p in pnls {
        equity += p;
        peak = peak.max(equity);
        max_dd = max_dd.max(peak - equity);
    }
    println!(
        "{label}: {} trades, total {:+.2} SOL ({:+.1}% per trade), {:.0}% winners",
        pnls.len(),
        total,
        total / (pnls.len() as f64 * stake) * 100.0,
        wins as f64 / pnls.len() as f64 * 100.0,
    );
    println!("    worst drawdown {max_dd:.2} SOL; without the best 10 trades {without_best:+.2} SOL");
}

fn main() {
    let tokens = dataset(7, 6000);
    // Test only on launches after the model's training period.
    let test = &tokens[4000..];
    let picks: Vec<&Token> = test.iter().filter(|t| rug_risk(&t.features) < 0.3).collect();
    println!("{} of {} launches pass the rug filter (features: {})", picks.len(), test.len(), FEATURES.join(", "));
    let stake = 0.1;

    let naive: Vec<f64> = picks.iter().map(|t| trade(&t.launch, stake, &FREE)).collect();
    let real: Vec<f64> = picks.iter().map(|t| trade(&t.launch, stake, &REAL)).collect();
    report("no costs, instant fills", &naive, stake);
    report("costs and a 1-minute delay", &real, stake);

    // The same strategy on a survivorship-biased dataset: tokens still above half their launch price.
    let listed: Vec<f64> = picks.iter().filter(|t| t.launch.prices[239] >= 0.5).map(|t| trade(&t.launch, stake, &REAL)).collect();
    report("only tokens still listed", &listed, stake);
    let rugs = picks.iter().filter(|t| t.launch.fate == Fate::Rug).count();
    println!("{rugs} rugs got past the filter");
}
```

Three backtests of the same strategy on the same market:

- **No costs, instant fills**: it already loses a few percent per trade. The scam filter removes most rugs, but as lesson 5 showed, what's left is mostly tokens that fade.
- **With costs and latency**: losses more than double. On a 0.1 SOL stake, the two 0.002 SOL transaction fees alone are a 4% round trip, before price impact and the pool fee. The delay buys after the first minute's move and sells after the price has already turned.
- **Only tokens still listed**: a large profit, with almost two-thirds of trades winning and almost no drawdown. It's the same strategy, with the dataset chosen using the future. If you remember one result from this elective, make it this one.

Look at the "without the best 10 trades" figures too. Even in the biased backtest, ten trades out of 51 account for about half of the profit. In a heavy-tailed market, a strategy's record can rest on a few lucky trades, which is why the next step is a **luck test**.

## Profit or luck?

In Phase 6 you asked whether a betting record could be luck. The same tool works here: the **bootstrap**. Resample the trades with replacement many times, recompute the average each time, and see how often it's positive. If the strategy's real average is positive but resampling often makes it negative, the record isn't evidence of an edge.

The exercise below builds it. Run it on any backtest before believing it, and remember it can only tell you about *luck*. A biased dataset passes the luck test easily; only the checklist at the top of the lesson protects you from that.

:::warning Overfitting to the backtest
Every time you change a parameter (the risk cut-off, the stop, the target) and rerun the backtest, you use up some of its honesty. Try enough combinations and one will look good by chance, the parameter-search trap from Phase 6. Keep a final block of launches that you **never** test on until you've frozen the strategy, and run it once.
:::

## Practice

:::exercise meme-backtest-metrics Drawdown and profit factor
Write two metrics over a list of per-trade profits, in time order:

- `max_drawdown(pnls: &[f64]) -> f64`: the largest fall of the cumulative profit (starting at 0) from its highest point so far. Return 0.0 if it never falls.
- `profit_factor(pnls: &[f64]) -> Option<f64>`: total profit of winning trades divided by the total loss of losing trades (as a positive number). Return `None` if there are no losing trades. Trades of exactly 0 count as neither.

@@starter
fn max_drawdown(pnls: &[f64]) -> f64 {
    todo!()
}

fn profit_factor(pnls: &[f64]) -> Option<f64> {
    todo!()
}

@@solution
fn max_drawdown(pnls: &[f64]) -> f64 {
    let (mut equity, mut peak, mut worst) = (0.0_f64, 0.0_f64, 0.0_f64);
    for p in pnls {
        equity += p;
        peak = peak.max(equity);
        worst = worst.max(peak - equity);
    }
    worst
}

fn profit_factor(pnls: &[f64]) -> Option<f64> {
    let gains: f64 = pnls.iter().filter(|&&p| p > 0.0).sum();
    let losses: f64 = -pnls.iter().filter(|&&p| p < 0.0).sum::<f64>();
    if losses == 0.0 { None } else { Some(gains / losses) }
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// The fall from the highest point
#[test]
fn drawdown() {
    // equity: 1, 3, 2, 0, 1, 4 -> worst fall is 3 (from 3 to 0)
    assert!(close(max_drawdown(&[1.0, 2.0, -1.0, -2.0, 1.0, 3.0]), 3.0));
}

/// A loss from the very start counts from 0
#[test]
fn drawdown_from_start() {
    assert!(close(max_drawdown(&[-1.0, -0.5, 2.0]), 1.5));
    assert_eq!(max_drawdown(&[0.5, 0.5]), 0.0);
    assert_eq!(max_drawdown(&[]), 0.0);
}

/// Gross wins over gross losses
#[test]
fn factor() {
    let pf = profit_factor(&[2.0, -1.0, 0.0, 1.0, -0.5]).unwrap();
    assert!(close(pf, 2.0), "got {pf}");
    assert_eq!(profit_factor(&[1.0, 0.0]), None);
}

@@hint
For the drawdown, track the running total, the highest total so far, and the biggest gap between them.
:::

:::exercise meme-bootstrap Profit or luck?
The starter includes the course's `Rng`. Write `bootstrap_positive(pnls: &[f64], resamples: usize, rng: &mut Rng) -> f64`: repeat `resamples` times: draw `pnls.len()` trades **with replacement** (an index from `rng.below(pnls.len())` each time), and compute their mean. Return the fraction of resamples whose mean is greater than 0.

@@starter
struct Rng(u64);

impl Rng {
    fn uniform(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }

    /// A random index in 0..n.
    fn below(&mut self, n: usize) -> usize {
        ((self.uniform() * n as f64) as usize).min(n - 1)
    }
}

fn bootstrap_positive(pnls: &[f64], resamples: usize, rng: &mut Rng) -> f64 {
    todo!()
}

@@solution
struct Rng(u64);

impl Rng {
    fn uniform(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }

    /// A random index in 0..n.
    fn below(&mut self, n: usize) -> usize {
        ((self.uniform() * n as f64) as usize).min(n - 1)
    }
}

fn bootstrap_positive(pnls: &[f64], resamples: usize, rng: &mut Rng) -> f64 {
    let n = pnls.len();
    let mut positive = 0;
    for _ in 0..resamples {
        let total: f64 = (0..n).map(|_| pnls[rng.below(n)]).sum();
        if total / n as f64 > 0.0 {
            positive += 1;
        }
    }
    positive as f64 / resamples as f64
}

@@tests
/// All winners: every resample is positive
#[test]
fn all_winners() {
    assert_eq!(bootstrap_positive(&[0.1, 0.2, 0.3], 200, &mut Rng(1)), 1.0);
}

/// All losers: none is
#[test]
fn all_losers() {
    assert_eq!(bootstrap_positive(&[-0.1, -0.2], 200, &mut Rng(2)), 0.0);
}

/// A symmetric record is a coin flip
#[test]
fn coin_flip() {
    let pnls: Vec<f64> = (0..200).map(|i| if i % 2 == 0 { 1.0 } else { -1.0 }).collect();
    let share = bootstrap_positive(&pnls, 2000, &mut Rng(3));
    assert!((0.4..0.6).contains(&share), "got {share}");
}

/// One huge winner among many small losses isn't reliable evidence
#[test]
fn one_lucky_trade() {
    let mut pnls = vec![-0.1; 59];
    pnls.push(8.0);
    let share = bootstrap_positive(&pnls, 2000, &mut Rng(4));
    assert!(share > 0.4 && share < 0.8, "got {share}");
}

@@hint
Two loops: the outer one counts resamples, the inner one adds up `n` randomly chosen trades.
:::

:::quiz meme-backtest-check Quick check
? A backtest uses only tokens that are still trading today. Which way is it biased?
- [x] Too optimistic: the tokens that died, which you'd also have bought, are missing
- [ ] Too pessimistic
- [ ] It isn't biased if the strategy only uses launch-time data
> Choosing the dataset by survival uses the future, even when each trade's signal doesn't.

? Why model a delay between deciding and the trade landing?
- [ ] Rust is slower than the market
- [x] Prices on new tokens move within seconds, and faster bots usually trade first
- [ ] To account for fees
> Assuming you trade at the price you saw is one of the most common ways backtests flatter a strategy.

? A strategy's total profit comes almost entirely from its best three trades. What should you conclude?
- [ ] It has found a strong edge
- [x] The record may be luck: check with a bootstrap and on new data
- [ ] Remove the three trades as outliers
> Removing them would bias the test the other way. Testing how often resampling gives a profit is the honest check.
:::

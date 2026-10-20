---
title: "Project: a paper-trading bot"
summary: Assemble the scam filter, an entry rule, exits, realistic fills and a report into one backtested bot, tune it on one block of launches and test it once on another, then write up what the result does and doesn't show.
minutes: 150
kind: project
language: rust
---

Time to put the pieces together into one bot and evaluate it the way you would before risking money: tune on one period, test **once** on a later one, and write down every assumption. You'll build three parts as exercises, then run the assembled bot on 2,000 simulated launches it has never seen.

## The plan

| Step | Part | From |
| --- | --- | --- |
| 1 | An **entry rule**: skip high-risk tokens, and wait a few minutes to see whether the price is rising before buying | lessons 5 and 6 |
| 2 | A **trade simulator**: fill after a delay with price impact and fees, exit on a trailing stop, a target or a time limit | lessons 3, 6 and 7 |
| 3 | A **report** with the numbers that matter for heavy-tailed results | lessons 2 and 7 |
| 4 | **Tune and test**: pick the entry rule's settings on launches 4000–4999, then run the chosen settings once on 5000–5999 | lesson 5 |
| 5 | **Write it up**: assumptions, results, and what would make you stop | lesson 8 |

The rug model is lesson 5's, trained only on the first 4,000 launches, with its weights pasted in so the project's code stays short. Everything is tested on launches after that.

## Step 1: the entry rule

:::exercise meme-project-entry The entry rule
Implement `Entry::minute(&self, risk: f64, prices: &[f64]) -> Option<usize>`: return `Some(self.wait)` (the minute the bot decides to buy) when **both** `risk < self.max_risk` and the price at minute `self.wait` is at least `self.min_rise` (prices are relative to the launch price). Otherwise return `None`. If `prices` is too short to have an entry at `self.wait`, return `None` rather than panicking.

@@starter
struct Entry {
    max_risk: f64,
    wait: usize,
    min_rise: f64,
}

impl Entry {
    fn minute(&self, risk: f64, prices: &[f64]) -> Option<usize> {
        todo!()
    }
}

@@solution
struct Entry {
    max_risk: f64,
    wait: usize,
    min_rise: f64,
}

impl Entry {
    fn minute(&self, risk: f64, prices: &[f64]) -> Option<usize> {
        let price = *prices.get(self.wait)?;
        (risk < self.max_risk && price >= self.min_rise).then_some(self.wait)
    }
}

@@tests
fn entry() -> Entry {
    Entry { max_risk: 0.3, wait: 2, min_rise: 1.5 }
}

/// Low risk and a big enough rise: buy at the end of the wait
#[test]
fn buys() {
    assert_eq!(entry().minute(0.1, &[1.0, 1.2, 1.6, 1.4]), Some(2));
    assert_eq!(entry().minute(0.1, &[1.0, 1.2, 1.5]), Some(2));
}

/// Too risky, or not rising enough
#[test]
fn skips() {
    assert_eq!(entry().minute(0.3, &[1.0, 1.2, 1.6]), None);
    assert_eq!(entry().minute(0.1, &[1.0, 2.0, 1.4]), None);
}

/// Without a wait, any low-risk token is bought at launch
#[test]
fn no_wait() {
    let e = Entry { max_risk: 0.3, wait: 0, min_rise: 0.0 };
    assert_eq!(e.minute(0.2, &[1.0]), Some(0));
}

/// Too few prices: no entry, no panic
#[test]
fn short() {
    assert_eq!(entry().minute(0.1, &[1.0, 1.2]), None);
}

@@hint
`prices.get(self.wait)` returns an `Option<&f64>`, so `?` handles the too-short case. `bool::then_some` turns the condition into an `Option`.
:::

Waiting is a trade-off. Rugs and fades show themselves in the first minutes, so waiting filters out more of them, but a rising price also means you buy later and higher, after faster bots, and the strongest pumps may be over before you're in.

## Step 2: the trade simulator

:::exercise meme-project-trade Simulating one trade
Write `trade(prices: &[f64], decided: usize, stake: f64, rules: &Rules, costs: &Costs) -> f64`, returning the trade's profit in SOL. Let `last = prices.len() - 1`.

1. The buy **fills** at minute `filled = min(decided + costs.delay, last)`.
2. Price impact makes you pay `impact = 1 + stake / costs.pool_sol` times the price, on the way in, and receive the price divided by `impact` on the way out.
3. Tokens bought: `(stake - costs.per_tx) * (1 - costs.fee) / (prices[filled] * impact)`.
4. Track the highest price since the fill (starting with `prices[filled]`). For each minute `t` after `filled`, update the high, then exit if any is true: the price is at or below `high * (1 - rules.trailing)`; the price is at or above `prices[filled] * rules.take_profit`; or `t - filled >= rules.max_minutes`. The sale fills at `min(t + costs.delay, last)`. If nothing triggers, sell at `last`.
5. Proceeds: `tokens * prices[exit] / impact * (1 - costs.fee) - costs.per_tx`. Return proceeds minus `stake`.

@@starter
struct Rules {
    trailing: f64,
    take_profit: f64,
    max_minutes: usize,
}

struct Costs {
    delay: usize,
    pool_sol: f64,
    fee: f64,
    per_tx: f64,
}

fn trade(prices: &[f64], decided: usize, stake: f64, rules: &Rules, costs: &Costs) -> f64 {
    todo!()
}

@@solution
struct Rules {
    trailing: f64,
    take_profit: f64,
    max_minutes: usize,
}

struct Costs {
    delay: usize,
    pool_sol: f64,
    fee: f64,
    per_tx: f64,
}

fn trade(prices: &[f64], decided: usize, stake: f64, rules: &Rules, costs: &Costs) -> f64 {
    let last = prices.len() - 1;
    let filled = (decided + costs.delay).min(last);
    let impact = 1.0 + stake / costs.pool_sol;
    let tokens = (stake - costs.per_tx) * (1.0 - costs.fee) / (prices[filled] * impact);
    let mut high = prices[filled];
    let mut exit = last;
    for t in filled + 1..=last {
        high = high.max(prices[t]);
        let stop = prices[t] <= high * (1.0 - rules.trailing);
        let target = prices[t] >= prices[filled] * rules.take_profit;
        if stop || target || t - filled >= rules.max_minutes {
            exit = (t + costs.delay).min(last);
            break;
        }
    }
    tokens * prices[exit] / impact * (1.0 - costs.fee) - costs.per_tx - stake
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

const FREE: Costs = Costs { delay: 0, pool_sol: f64::INFINITY, fee: 0.0, per_tx: 0.0 };

fn rules() -> Rules {
    Rules { trailing: 0.5, take_profit: 2.0, max_minutes: 100 }
}

/// Without costs, a doubling hits the target for a 100% profit
#[test]
fn target() {
    let pnl = trade(&[1.0, 1.5, 2.0, 3.0], 0, 1.0, &rules(), &FREE);
    assert!(close(pnl, 1.0), "got {pnl}");
}

/// The trailing stop sells after a 50% fall from the high
#[test]
fn trailing_stop() {
    let pnl = trade(&[1.0, 1.8, 0.9, 5.0], 0, 1.0, &rules(), &FREE);
    assert!(close(pnl, -0.1), "got {pnl}");
}

/// The delay fills both legs a minute late
#[test]
fn delay() {
    let costs = Costs { delay: 1, ..FREE };
    // Buys at 1.2 (minute 1); the target 2.4 is hit at minute 3; sells at minute 4.
    let pnl = trade(&[1.0, 1.2, 1.5, 2.5, 2.0, 1.0], 0, 1.0, &rules(), &costs);
    assert!(close(pnl, 2.0 / 1.2 - 1.0), "got {pnl}");
}

/// Fees, impact and the time stop
#[test]
fn costs_and_time_stop() {
    let costs = Costs { delay: 0, pool_sol: 10.0, fee: 0.01, per_tx: 0.01 };
    let r = Rules { trailing: 0.9, take_profit: 10.0, max_minutes: 2 };
    let pnl = trade(&[1.0, 1.1, 1.2, 5.0], 0, 1.0, &r, &costs);
    let impact = 1.1;
    let expected = 0.99 * 0.99 / impact * 1.2 / impact * 0.99 - 0.01 - 1.0;
    assert!(close(pnl, expected), "got {pnl}, expected {expected}");
}

/// Holding to the end when nothing triggers
#[test]
fn to_the_end() {
    let pnl = trade(&[1.0, 1.1, 1.2], 0, 1.0, &rules(), &FREE);
    assert!(close(pnl, 0.2), "got {pnl}");
}

@@hint
Work out `filled`, `impact` and `tokens` first. Then loop `for t in filled + 1..=last`, updating `high` before checking the three exit conditions.

@@hint
Remember the delay applies to the sale too: `exit = (t + costs.delay).min(last)`.
:::

## Step 3: the report

:::exercise meme-project-report The report
Write `Report::new(pnls: &[f64]) -> Report` with:

- `trades`: the number of trades
- `total`: the sum of profits (0.0 for no trades)
- `median`: the median profit (0.0 for no trades; average the middle two for an even count)
- `win_rate`: the fraction of trades with profit above 0 (0.0 for no trades)
- `best_share`: the fraction of `total` that came from the single best trade, or 0.0 if `total` isn't positive

`best_share` is a quick warning sign: if one trade is most of your profit, you're looking at luck until proven otherwise.

@@starter
#[derive(Debug)]
struct Report {
    trades: usize,
    total: f64,
    median: f64,
    win_rate: f64,
    best_share: f64,
}

impl Report {
    fn new(pnls: &[f64]) -> Report {
        todo!()
    }
}

@@solution
#[derive(Debug)]
struct Report {
    trades: usize,
    total: f64,
    median: f64,
    win_rate: f64,
    best_share: f64,
}

impl Report {
    fn new(pnls: &[f64]) -> Report {
        let n = pnls.len();
        if n == 0 {
            return Report { trades: 0, total: 0.0, median: 0.0, win_rate: 0.0, best_share: 0.0 };
        }
        let mut sorted = pnls.to_vec();
        sorted.sort_by(f64::total_cmp);
        let median = if n % 2 == 0 { (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0 } else { sorted[n / 2] };
        let total: f64 = pnls.iter().sum();
        let best = sorted[n - 1];
        Report {
            trades: n,
            total,
            median,
            win_rate: pnls.iter().filter(|&&p| p > 0.0).count() as f64 / n as f64,
            best_share: if total > 0.0 { best / total } else { 0.0 },
        }
    }
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// A typical report
#[test]
fn typical() {
    let r = Report::new(&[0.5, -0.1, 2.0, -0.2, 0.3]);
    assert_eq!(r.trades, 5);
    assert!(close(r.total, 2.5) && close(r.median, 0.3), "{r:?}");
    assert!(close(r.win_rate, 0.6) && close(r.best_share, 0.8), "{r:?}");
}

/// Even count and a losing total
#[test]
fn losing() {
    let r = Report::new(&[-1.0, 0.5, -0.5, 0.0]);
    assert!(close(r.median, -0.25) && close(r.win_rate, 0.25), "{r:?}");
    assert_eq!(r.best_share, 0.0);
}

/// No trades
#[test]
fn empty() {
    let r = Report::new(&[]);
    assert_eq!((r.trades, r.total, r.median, r.win_rate, r.best_share), (0, 0.0, 0.0, 0.0, 0.0));
}

@@hint
Handle the empty case first and return early. Sort a copy for the median and the best trade.
:::

## Step 4: tune once, test once

Here are the solutions assembled (with a one-line report). The bot tries nine entry settings on launches 4000–4999, keeps the most profitable, and then runs it **once** on launches 5000–5999, alongside the simplest alternative: buying every low-risk launch at once.

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
/// Lesson 5's rug model, with its weights pasted in.
fn rug_risk(x: &[f64; 5]) -> f64 {
    const W: [f64; 5] = [2.23, 2.44, 12.16, 2.25, -0.44];
    let z = -5.53 + W.iter().zip(x).map(|(w, v)| w * v).sum::<f64>();
    1.0 / (1.0 + (-z).exp())
}

/// Step 1: buy if the rug risk is low and the price has risen enough after `wait` minutes.
struct Entry {
    max_risk: f64,
    wait: usize,
    min_rise: f64,
}

impl Entry {
    fn minute(&self, risk: f64, prices: &[f64]) -> Option<usize> {
        (risk < self.max_risk && prices[self.wait] >= self.min_rise).then_some(self.wait)
    }
}

/// Step 2: exits and fill costs.
struct Rules {
    trailing: f64,
    take_profit: f64,
    max_minutes: usize,
}

struct Costs {
    delay: usize,
    pool_sol: f64,
    fee: f64,
    per_tx: f64,
}

fn trade(prices: &[f64], decided: usize, stake: f64, rules: &Rules, costs: &Costs) -> f64 {
    let last = prices.len() - 1;
    let filled = (decided + costs.delay).min(last);
    let impact = 1.0 + stake / costs.pool_sol;
    let tokens = (stake - costs.per_tx) * (1.0 - costs.fee) / (prices[filled] * impact);
    let mut high = prices[filled];
    let mut exit = last;
    for t in filled + 1..=last {
        high = high.max(prices[t]);
        let stop = prices[t] <= high * (1.0 - rules.trailing);
        let target = prices[t] >= prices[filled] * rules.take_profit;
        if stop || target || t - filled >= rules.max_minutes {
            exit = (t + costs.delay).min(last);
            break;
        }
    }
    tokens * prices[exit] / impact * (1.0 - costs.fee) - costs.per_tx - stake
}

/// Step 3: one line per backtest.
fn report(label: &str, pnls: &[f64]) -> f64 {
    let total: f64 = pnls.iter().sum::<f64>() + 0.0; // + 0.0 turns an empty sum's -0.0 into 0.0
    let wins = pnls.iter().filter(|&&p| p > 0.0).count();
    println!("{label:<28} {:>4} trades {:>+7.2} SOL {:>4.0}% winners", pnls.len(), total, wins as f64 / pnls.len().max(1) as f64 * 100.0);
    total
}

fn main() {
    let tokens = dataset(7, 6000);
    let (tuning, final_test) = (&tokens[4000..5000], &tokens[5000..]);
    let rules = Rules { trailing: 0.4, take_profit: 3.0, max_minutes: 120 };
    let costs = Costs { delay: 1, pool_sol: 30.0, fee: 0.0025, per_tx: 0.002 };
    let backtest = |entry: &Entry, ts: &[Token]| -> Vec<f64> {
        ts.iter()
            .filter_map(|t| {
                let m = entry.minute(rug_risk(&t.features), &t.launch.prices)?;
                Some(trade(&t.launch.prices, m, 0.1, &rules, &costs))
            })
            .collect()
    };

    println!("tuning on launches 4000-4999 ({} features in the rug model)", FEATURES.len());
    let mut best = (f64::NEG_INFINITY, 0, 0.0);
    for wait in [5, 10, 15] {
        for min_rise in [1.2, 1.5, 2.0] {
            let total = report(&format!("  wait {wait:>2} min, rise {min_rise}x"), &backtest(&Entry { max_risk: 0.3, wait, min_rise }, tuning));
            if total > best.0 {
                best = (total, wait, min_rise);
            }
        }
    }

    let (_, wait, min_rise) = best;
    println!("final test on launches 5000-5999, run once:");
    report(&format!("  chosen: wait {wait}, rise {min_rise}x"), &backtest(&Entry { max_risk: 0.3, wait, min_rise }, final_test));
    report("  buy every low-risk launch", &backtest(&Entry { max_risk: 0.3, wait: 0, min_rise: 0.0 }, final_test));
    let pumps = final_test.iter().filter(|t| t.launch.fate == Fate::PumpAndDump).count();
    println!("({pumps} pump-and-dumps in the final block)");
}
```

The tuned strategy makes money on the final block too, though less than on the tuning block: the best of nine settings is always partly luck, so expect it to shrink on new data, exactly as in Phase 6. Buying every low-risk launch immediately does far worse.

So does waiting for momentum work? **In this simulator, yes, and you should know exactly why.** Pump-and-dumps rise steadily for 10–60 minutes before they collapse, and survivors trend up, because that's how the simulator was written. Waiting a few minutes and buying what's rising catches the trend that's built in, and the trailing stop gets out before most of the dump. The bot has found the simulator's assumptions, not a property of real markets.

In a real market, the same rule meets problems the simulator doesn't have:

- **You aren't alone.** Momentum is the most obvious signal there is. Many bots buy rising tokens; the rise you see is partly them, and they're faster than you.
- **Pump-and-dumps are adversarial.** Organisers sell into exactly the buyers this rule produces, and they choose when, so the dump comes as soon as momentum buyers arrive.
- **The costs are guesses.** The 1-minute delay, the 30 SOL pool and the per-transaction fee are assumptions. Paper trading measures the real ones.

**A simulator can only tell you what you put into it.** It's the right tool for testing that your code is correct and your evaluation is honest, which is what this project does. Whether a strategy works in the real market is a question only the real market can answer, through weeks of live paper trading (lesson 8).

## Step 5: write it up

Write a short `README.md` for your bot, as you did for your models in earlier phases. Include:

- **What it does**, in two sentences.
- **Assumptions**, as a table: delay, pool size, fees, the rug model's training period, exit rules. Mark each as *measured* or *guessed*.
- **Results** on the final block only, with the number of trades, the median and the share of profit from the best trade, not just the total.
- **Known limitations**, including the ones in the list above.
- **Stop conditions**: what result in paper trading would make you abandon it (for example, real fills 3% worse than assumed, or a month of paper results below the backtest's worst month).

## Going further

- **Paper trade it live.** Connect a real feed (lesson 8), keep the paper executor, and log real quotes next to your simulated fills.
- **Make the simulator less friendly.** Add competing momentum bots that buy before you, or pump-and-dumps that end as soon as buying accelerates, and see whether the edge survives.
- **Size positions from the pool.** Replace the fixed 0.1 SOL with lesson 1's `max_buy_for_impact`.
- **Async.** Rewrite the event loop from lesson 6 on `tokio` with one task per feed and a channel into the engine.

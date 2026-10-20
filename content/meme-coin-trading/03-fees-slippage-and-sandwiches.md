---
title: Fees, slippage and sandwich attacks
summary: Price in every cost of a trade, from pool fees to per-transaction network fees, set a minimum output that protects you, and simulate the sandwich bots that profit from loose slippage settings.
minutes: 55
kind: lesson
language: rust
---

A strategy that looks profitable before costs is not a strategy. In Phase 6 you saw transaction costs turn forex backtests negative. Meme coins are worse: pools are small, trades are many, and some of the other traders are bots designed to profit from you specifically.

## Every cost of a trade

A buy-then-sell round trip pays:

1. **The pool fee**, both ways: typically 0.25–1% of each trade, depending on the pool.
2. **Network fees**, per transaction. On Solana the base fee is tiny, but during a busy launch you add a **priority fee** (and often a tip to block builders) to land in the next block. These are a fixed amount of SOL per transaction, whatever its size, and you pay them on failed transactions too.
3. **Price impact**, from lesson 1, which grows with your size relative to the pool.
4. **Slippage**: the price moving between the moment you saw it and the moment your transaction executes. On a new token, other buyers can move the price several percent within a second.

Fixed per-transaction costs hit small trades hardest. Here the pool takes 0.25% each way and each transaction costs 0.002 SOL in fees:

```rust
/// SOL you end up with after buying with `stake`, the price moving by `multiple`, and selling.
/// Each transaction pays `per_tx` SOL in network and priority fees; the pool takes `fee` each way.
fn round_trip(stake: f64, multiple: f64, fee: f64, per_tx: f64) -> f64 {
    let invested = stake - per_tx;
    invested * (1.0 - fee) * multiple * (1.0 - fee) - per_tx
}

fn main() {
    let (fee, per_tx) = (0.0025, 0.002);
    println!("{:>8} {:>22} {:>18}", "stake", "cost if price is flat", "break-even rise");
    for stake in [0.05, 0.1, 0.5, 1.0, 5.0] {
        let flat = round_trip(stake, 1.0, fee, per_tx);
        // The multiple at which you get your stake back.
        let break_even = (stake + per_tx) / ((stake - per_tx) * (1.0 - fee) * (1.0 - fee));
        println!("{stake:>4} SOL {:>21.2}% {:>17.2}%", (1.0 - flat / stake) * 100.0, (break_even - 1.0) * 100.0);
    }
}
```

A 0.05 SOL trade needs the price to rise almost 9% just to get your money back, and this ignores price impact, slippage and failed transactions. Bigger trades dilute the fixed fees but pay more price impact. Somewhere in between is a size where costs are lowest, and it depends on the pool: one of the parameters your bot needs to compute, not guess.

## Slippage tolerance

When you submit a swap, you don't get to choose the price. You choose a **minimum output**: "buy with 1 SOL, and fail unless I get at least *N* tokens". It's usually set from a quote and a **slippage tolerance**:

$$
\text{min\_out} = \text{quote} \times (1 - \text{slippage})
$$

If the price moves against you by more than that before your transaction lands, the program rejects it. You keep your SOL but still pay the network fee. Set the tolerance:

- **too tight**, and on a busy token most of your transactions fail, each one costing fees;
- **too loose**, and you've told everyone exactly how much worse a price you're willing to accept. Someone will take you up on it.

## Sandwich attacks

Transactions are visible before they execute: to the validator building the block, and often to bots watching for them. A **sandwich bot** that spots your buy does three things in the same block:

1. **Front-run**: buy the same token just before you, pushing the price up.
2. Let **your** buy execute at the higher price. It still passes, as long as you receive at least your minimum output.
3. **Back-run**: sell straight after you, at the price your buy pushed up even further.

The attacker's profit comes out of your tokens. The bigger the front-run, the more they make, so they choose the largest front-run that keeps your trade just above your minimum output. Your slippage tolerance sets their budget:

```rust
#[derive(Clone, Copy)]
struct Pool {
    sol: f64,
    tokens: f64,
    fee: f64,
}

impl Pool {
    fn buy(&mut self, sol_in: f64) -> f64 {
        let effective = sol_in * (1.0 - self.fee);
        let out = self.tokens * effective / (self.sol + effective);
        self.sol += sol_in;
        self.tokens -= out;
        out
    }

    fn sell(&mut self, tokens_in: f64) -> f64 {
        let effective = tokens_in * (1.0 - self.fee);
        let out = self.sol * effective / (self.tokens + effective);
        self.tokens += tokens_in;
        self.sol -= out;
        out
    }

    /// What `sol_in` would buy right now, without trading.
    fn quote_buy(&self, sol_in: f64) -> f64 {
        let mut copy = *self;
        copy.buy(sol_in)
    }
}

/// Front-run a victim's buy, let it fill, then sell. Returns (victim's tokens, attacker's SOL profit),
/// or None if the victim's transaction would fail its minimum-output check.
fn sandwich(pool: Pool, frontrun: f64, victim_in: f64, min_out: f64) -> Option<(f64, f64)> {
    let mut pool = pool;
    let attacker_tokens = pool.buy(frontrun);
    let victim_tokens = pool.buy(victim_in);
    if victim_tokens < min_out {
        return None;
    }
    let attacker_back = pool.sell(attacker_tokens);
    Some((victim_tokens, attacker_back - frontrun))
}

fn main() {
    let pool = Pool { sol: 50.0, tokens: 500_000_000.0, fee: 0.0025 };
    let victim_in = 2.0;
    let quote = pool.quote_buy(victim_in);
    println!("victim buys with {victim_in} SOL; quoted {:.0} tokens", quote);
    println!("{:>9} {:>14} {:>16} {:>15}", "slippage", "best front-run", "victim loses", "attacker earns");
    for slippage in [0.005, 0.01, 0.05, 0.15, 0.30] {
        let min_out = quote * (1.0 - slippage);
        // The attacker wants the largest front-run that still lets the victim's trade fill.
        let (mut lo, mut hi) = (0.0, 500.0);
        for _ in 0..100 {
            let mid = (lo + hi) / 2.0;
            if sandwich(pool, mid, victim_in, min_out).is_some() { lo = mid } else { hi = mid }
        }
        let (got, profit) = sandwich(pool, lo, victim_in, min_out).unwrap();
        println!("{:>8.1}% {:>11.2} SOL {:>15.1}% {:>11.3} SOL", slippage * 100.0, lo, (1.0 - got / quote) * 100.0, profit);
    }
}
```

The victim loses exactly their slippage tolerance every time: the attacker takes all of it. With a 30% tolerance (common advice on launch-day forums, "so the trade goes through"), a 2 SOL buy hands over 0.57 SOL. With 0.5%, the attacker's take is 0.01 SOL, which may not even cover their own transaction costs, so they leave you alone.

Defences, in order of importance:

- **Set the tightest slippage that still fills**, and compute it from the pool's recent volatility rather than using a fixed large number.
- **Trade smaller than the pool can absorb.** Lesson 1's price-impact function tells you the size.
- **Send transactions privately** where you can. On Solana, some RPC providers and block-builder services offer submission routes that don't expose your transaction to the public before it lands. They reduce sandwich risk; they don't remove it.

## Practice

:::exercise meme-round-trip The cost of a round trip
Write the two cost functions from the lesson:

- `round_trip(stake: f64, multiple: f64, fee: f64, per_tx: f64) -> f64`: the SOL you hold after paying `per_tx` for the buy transaction, buying with the rest (pool fee `fee`), the price changing by `multiple`, selling (pool fee again) and paying `per_tx` for the sell transaction. Ignore price impact.
- `break_even_multiple(stake: f64, fee: f64, per_tx: f64) -> f64`: the price multiple at which `round_trip` returns exactly `stake`. Solve the formula rather than searching.

@@starter
fn round_trip(stake: f64, multiple: f64, fee: f64, per_tx: f64) -> f64 {
    todo!()
}

fn break_even_multiple(stake: f64, fee: f64, per_tx: f64) -> f64 {
    todo!()
}

@@solution
fn round_trip(stake: f64, multiple: f64, fee: f64, per_tx: f64) -> f64 {
    (stake - per_tx) * (1.0 - fee) * multiple * (1.0 - fee) - per_tx
}

fn break_even_multiple(stake: f64, fee: f64, per_tx: f64) -> f64 {
    (stake + per_tx) / ((stake - per_tx) * (1.0 - fee) * (1.0 - fee))
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// With no costs, a round trip just applies the price change
#[test]
fn no_costs() {
    assert!(close(round_trip(2.0, 1.5, 0.0, 0.0), 3.0));
}

/// A flat price loses the fees
#[test]
fn flat_price() {
    let back = round_trip(1.0, 1.0, 0.01, 0.01);
    assert!(close(back, 0.99 * 0.99 * 0.99 - 0.01), "got {back}");
}

/// At the break-even multiple you get your stake back
#[test]
fn break_even() {
    for (stake, fee, per_tx) in [(0.05, 0.0025, 0.002), (1.0, 0.01, 0.0005), (10.0, 0.003, 0.01)] {
        let m = break_even_multiple(stake, fee, per_tx);
        assert!(close(round_trip(stake, m, fee, per_tx), stake), "stake {stake}: multiple {m}");
        assert!(m > 1.0);
    }
}

@@hint
Spell out each step: subtract the first fee, multiply by `(1.0 - fee)`, by `multiple`, by `(1.0 - fee)` again, then subtract the second fee.

@@hint
Set `(stake - per_tx) * (1 - fee)² * m - per_tx = stake` and solve for `m`.
:::

:::exercise meme-sandwich The attacker's arithmetic
The starter includes the lesson's `Pool`. Write:

- `sandwich(pool: Pool, frontrun: f64, victim_in: f64, min_out: f64) -> Option<(f64, f64)>`: on a copy of the pool, the attacker buys with `frontrun` SOL, then the victim buys with `victim_in` SOL. If the victim receives fewer than `min_out` tokens, return `None` (their transaction fails). Otherwise the attacker sells all their tokens, and you return `Some((victim_tokens, attacker_profit_in_sol))`.
- `max_frontrun(pool: Pool, victim_in: f64, min_out: f64) -> f64`: the largest front-run (to within 1e-6 SOL) that still lets the victim's trade succeed. Binary search between 0 and `pool.sol * 100.0`.

@@starter
#[derive(Clone, Copy)]
struct Pool {
    sol: f64,
    tokens: f64,
    fee: f64,
}

impl Pool {
    fn buy(&mut self, sol_in: f64) -> f64 {
        let effective = sol_in * (1.0 - self.fee);
        let out = self.tokens * effective / (self.sol + effective);
        self.sol += sol_in;
        self.tokens -= out;
        out
    }

    fn sell(&mut self, tokens_in: f64) -> f64 {
        let effective = tokens_in * (1.0 - self.fee);
        let out = self.sol * effective / (self.tokens + effective);
        self.tokens += tokens_in;
        self.sol -= out;
        out
    }
}

fn sandwich(pool: Pool, frontrun: f64, victim_in: f64, min_out: f64) -> Option<(f64, f64)> {
    todo!()
}

fn max_frontrun(pool: Pool, victim_in: f64, min_out: f64) -> f64 {
    todo!()
}

@@solution
#[derive(Clone, Copy)]
struct Pool {
    sol: f64,
    tokens: f64,
    fee: f64,
}

impl Pool {
    fn buy(&mut self, sol_in: f64) -> f64 {
        let effective = sol_in * (1.0 - self.fee);
        let out = self.tokens * effective / (self.sol + effective);
        self.sol += sol_in;
        self.tokens -= out;
        out
    }

    fn sell(&mut self, tokens_in: f64) -> f64 {
        let effective = tokens_in * (1.0 - self.fee);
        let out = self.sol * effective / (self.tokens + effective);
        self.tokens += tokens_in;
        self.sol -= out;
        out
    }
}

fn sandwich(pool: Pool, frontrun: f64, victim_in: f64, min_out: f64) -> Option<(f64, f64)> {
    let mut pool = pool;
    let attacker_tokens = pool.buy(frontrun);
    let victim_tokens = pool.buy(victim_in);
    if victim_tokens < min_out {
        return None;
    }
    let back = pool.sell(attacker_tokens);
    Some((victim_tokens, back - frontrun))
}

fn max_frontrun(pool: Pool, victim_in: f64, min_out: f64) -> f64 {
    let (mut lo, mut hi) = (0.0, pool.sol * 100.0);
    while hi - lo > 1e-7 {
        let mid = (lo + hi) / 2.0;
        if sandwich(pool, mid, victim_in, min_out).is_some() {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    lo
}

@@tests
fn pool() -> Pool {
    Pool { sol: 50.0, tokens: 500_000_000.0, fee: 0.0025 }
}

fn quote(sol_in: f64) -> f64 {
    let mut p = pool();
    p.buy(sol_in)
}

/// No front-run: the victim gets the quote and the attacker makes nothing
#[test]
fn no_frontrun() {
    let (got, profit) = sandwich(pool(), 0.0, 2.0, 0.0).unwrap();
    assert!((got - quote(2.0)).abs() < 1e-6 && profit.abs() < 1e-9, "got {got}, profit {profit}");
}

/// A front-run costs the victim tokens and pays the attacker
#[test]
fn frontrun_pays() {
    let (got, profit) = sandwich(pool(), 1.0, 2.0, 0.0).unwrap();
    assert!(got < quote(2.0) && profit > 0.0, "got {got}, profit {profit}");
}

/// The victim's minimum output makes the trade fail
#[test]
fn min_out_fails() {
    let min_out = quote(2.0) * 0.99;
    assert!(sandwich(pool(), 5.0, 2.0, min_out).is_none());
}

/// The biggest front-run leaves the victim right at their minimum
#[test]
fn biggest_frontrun() {
    let min_out = quote(2.0) * 0.95;
    let f = max_frontrun(pool(), 2.0, min_out);
    let (got, profit) = sandwich(pool(), f, 2.0, min_out).unwrap();
    assert!((got / min_out - 1.0).abs() < 1e-6, "victim got {got}, min {min_out}");
    assert!(sandwich(pool(), f + 0.001, 2.0, min_out).is_none());
    assert!(profit > 0.09 && profit < 0.1, "profit {profit}");
}

@@hint
`Pool` is `Copy`, so `let mut pool = pool;` gives you a private copy to trade against.

@@hint
In `max_frontrun`, a front-run that still leaves `sandwich(...)` returning `Some` is allowed, so move `lo` up to it; otherwise move `hi` down.
:::

:::quiz meme-costs-check Quick check
? Why do small trades suffer most from network and priority fees?
- [x] Those fees are a fixed amount of SOL per transaction, so they're a bigger percentage of a small trade
- [ ] Pools charge small trades a higher percentage
- [ ] Small trades always fail
> A 0.002 SOL fee is 4% of a 0.05 SOL trade, and you pay it again to sell.

? A sandwich bot front-runs your buy. What limits how much it can take from you?
- [ ] The pool fee
- [x] Your minimum output, set by your slippage tolerance
- [ ] The size of your wallet
> The bot pushes the price up until your trade would barely still pass. A tighter tolerance leaves it less room.

? Your transaction fails its minimum-output check. What have you lost?
- [ ] Nothing
- [x] The transaction's network and priority fees
- [ ] Your whole stake
> Failed transactions still pay fees, which is why a too-tight tolerance on a busy token is expensive too.
:::

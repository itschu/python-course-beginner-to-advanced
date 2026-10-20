---
title: "Checkpoint: Meme Coin Trading Bots"
summary: Pool maths, costs, scam signals, honest evaluation and safe operation, tested together.
minutes: 60
kind: checkpoint
language: rust
---

:::quiz meme-cp-quiz Concepts
? A pool holds 40 SOL and 2,000,000 tokens with no fee. You buy with 10 SOL. How many tokens do you get?
- [ ] 500,000
- [x] 400,000
- [ ] 250,000
> Δy = y·Δx / (x + Δx) = 2,000,000 × 10 / 50.

? Your 0.05 SOL trades pay 0.002 SOL per transaction. Roughly what does a round trip cost in fees alone, before pool fees and impact?
- [ ] 0.4%
- [x] 8%
- [ ] 0.2%
> Two transactions at 0.002 SOL is 0.004 SOL, which is 8% of 0.05 SOL.

? A sandwich bot attacks your buy with a 20% slippage tolerance. About how much of your expected tokens can it take?
- [ ] Nothing, slippage only protects sellers
- [ ] All of them
- [x] Up to about 20%
> It front-runs until your trade would barely pass your minimum output.

? Which features could a bot use to decide whether to buy at launch? (choose all that apply)
- [x] Whether the mint authority is revoked
- [x] The top-10 holders' share of supply at launch
- [ ] The token's lowest price in its first day
- [x] How many earlier tokens from the same creator were rugged
> The lowest price in the first day is only known a day later.

? A rug-pull model scores much better on a random train/test split than on a walk-forward split. What's the most likely explanation?
- [x] Scam tactics drift over time, and the random split mixes future launches into training
- [ ] The walk-forward split has a bug
- [ ] Random splits are always more accurate
> In an adversarial market, evaluate on data from after the training period.

? A backtest of buying every launch, using a dataset of tokens that are still trading, shows a big profit. What should you conclude?
- [ ] The strategy works
- [x] Nothing yet: the dataset excludes the tokens that died, which the strategy would also have bought
- [ ] The strategy works, but only on survivors
> Survivorship bias selects tokens by their future.

? Your bot finds an edge in your simulator. What does that prove about the real market?
- [ ] That the edge is real
- [x] Nothing on its own: it may be an assumption built into the simulator
- [ ] That the edge will be larger live
> A simulator tests your code and your evaluation. Only live paper trading tests the market.

? Which practices keep a bot's private key safe? (choose all that apply)
- [x] A dedicated hot wallet holding only what the bot may lose
- [x] Loading the keypair from a file path in an environment variable, with the file kept out of the repository
- [ ] Sending the key to the swap aggregator so it can sign quickly
- [x] Never running someone else's trading bot with a funded wallet's key
> Sign locally, keep keys out of code and out of other people's software.
:::

:::exercise meme-cp-pool A pool that can't be drained
Write a constant-product `Pool` in integers with a fee in basis points:

- `Pool::new(sol: u64, tokens: u64, fee_bps: u64) -> Pool`
- `buy(&mut self, sol_in: u64) -> u64`: swaps SOL for tokens, rounding the output down, and updates both reserves (the whole `sol_in`, fee included, stays in the pool)
- `sell(&mut self, tokens_in: u64) -> u64`: the reverse
- `k(&self) -> u128`: the product of the reserves

Do all multiplication in `u128`. Because outputs round down and fees stay in the pool, `k` must never decrease after a trade, which the tests check across many random trades.

@@starter
struct Pool {
    sol: u64,
    tokens: u64,
    fee_bps: u64,
}

impl Pool {
    fn new(sol: u64, tokens: u64, fee_bps: u64) -> Pool {
        todo!()
    }

    fn buy(&mut self, sol_in: u64) -> u64 {
        todo!()
    }

    fn sell(&mut self, tokens_in: u64) -> u64 {
        todo!()
    }

    fn k(&self) -> u128 {
        todo!()
    }
}

@@solution
struct Pool {
    sol: u64,
    tokens: u64,
    fee_bps: u64,
}

fn swap_out(reserve_in: u64, reserve_out: u64, amount_in: u64, fee_bps: u64) -> u64 {
    let effective = amount_in as u128 * (10_000 - fee_bps as u128);
    let out = effective * reserve_out as u128 / (reserve_in as u128 * 10_000 + effective);
    out as u64
}

impl Pool {
    fn new(sol: u64, tokens: u64, fee_bps: u64) -> Pool {
        Pool { sol, tokens, fee_bps }
    }

    fn buy(&mut self, sol_in: u64) -> u64 {
        let out = swap_out(self.sol, self.tokens, sol_in, self.fee_bps);
        self.sol += sol_in;
        self.tokens -= out;
        out
    }

    fn sell(&mut self, tokens_in: u64) -> u64 {
        let out = swap_out(self.tokens, self.sol, tokens_in, self.fee_bps);
        self.tokens += tokens_in;
        self.sol -= out;
        out
    }

    fn k(&self) -> u128 {
        self.sol as u128 * self.tokens as u128
    }
}

@@tests
/// A known buy
#[test]
fn known_buy() {
    let mut p = Pool::new(1_000, 1_000, 0);
    assert_eq!(p.buy(100), 90);
    assert_eq!((p.sol, p.tokens), (1_100, 910));
}

/// Buying then selling everything back returns less than you paid
#[test]
fn round_trip_loses() {
    let mut p = Pool::new(100_000_000_000, 1_000_000_000_000_000, 25);
    let tokens = p.buy(1_000_000_000);
    let back = p.sell(tokens);
    assert!(back < 1_000_000_000 && back > 990_000_000, "got {back}");
}

/// k never decreases, over many random trades
#[test]
fn k_never_decreases() {
    let mut p = Pool::new(50_000_000_000, 800_000_000_000_000, 30);
    let mut seed = 12345u64;
    let mut held = 0u64;
    for _ in 0..2000 {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        let before = p.k();
        if seed % 2 == 0 || held == 0 {
            held += p.buy(seed % 5_000_000_000 + 1);
        } else {
            let amount = seed % held + 1;
            p.sell(amount);
            held -= amount;
        }
        assert!(p.k() >= before, "k fell from {before} to {}", p.k());
    }
}

@@hint
Write one `swap_out` helper (from lesson 1) and use it for both directions, swapping which reserve is "in" and which is "out".
:::

:::exercise meme-cp-filter Scoring a launch
Combine lesson 4's checks with a probability, as a bot's pre-trade filter. Write `decide(facts: &Facts, rug_risk: f64, max_risk: f64) -> Decision`:

- If the mint authority isn't revoked, return `Decision::Skip("mint authority")`; else if the freeze authority isn't revoked, `Decision::Skip("freeze authority")`. These are dealbreakers whatever the model says.
- Otherwise, if `rug_risk >= max_risk`, return `Decision::Skip("rug risk")`.
- Otherwise return `Decision::Watch`: the token goes to the entry rule.

@@starter
#[derive(Debug, PartialEq)]
enum Decision {
    Skip(&'static str),
    Watch,
}

struct Facts {
    mint_revoked: bool,
    freeze_revoked: bool,
}

fn decide(facts: &Facts, rug_risk: f64, max_risk: f64) -> Decision {
    todo!()
}

@@solution
#[derive(Debug, PartialEq)]
enum Decision {
    Skip(&'static str),
    Watch,
}

struct Facts {
    mint_revoked: bool,
    freeze_revoked: bool,
}

fn decide(facts: &Facts, rug_risk: f64, max_risk: f64) -> Decision {
    if !facts.mint_revoked {
        Decision::Skip("mint authority")
    } else if !facts.freeze_revoked {
        Decision::Skip("freeze authority")
    } else if rug_risk >= max_risk {
        Decision::Skip("rug risk")
    } else {
        Decision::Watch
    }
}

@@tests
const SAFE: Facts = Facts { mint_revoked: true, freeze_revoked: true };

/// A clean, low-risk token is watched
#[test]
fn watch() {
    assert_eq!(decide(&SAFE, 0.1, 0.3), Decision::Watch);
}

/// Dealbreakers win over a low model score
#[test]
fn dealbreakers() {
    assert_eq!(decide(&Facts { mint_revoked: false, freeze_revoked: false }, 0.0, 0.3), Decision::Skip("mint authority"));
    assert_eq!(decide(&Facts { mint_revoked: true, freeze_revoked: false }, 0.0, 0.3), Decision::Skip("freeze authority"));
}

/// The model's risk, at and above the limit
#[test]
fn risk() {
    assert_eq!(decide(&SAFE, 0.3, 0.3), Decision::Skip("rug risk"));
    assert_eq!(decide(&SAFE, 0.9, 0.3), Decision::Skip("rug risk"));
}

@@hint
An `if / else if` chain, checking the dealbreakers before the model's risk.
:::

---
title: How meme coins trade
summary: What a meme coin is, how launchpads sell them on a bonding curve, how a constant-product pool sets the price, and why a big order moves it. You'll implement swap maths the way on-chain programs do, in integers.
minutes: 50
kind: lesson
language: rust
---

This elective is about building a trading bot for meme coins, and about being honest with yourself while you do it. It's written entirely in Rust, and it builds on Phases 9–11: ownership, traits, iterators, error handling, and the logistic regression you wrote from scratch.

Every runnable example uses **simulated** markets. That isn't a shortcut: a simulator where you know the truth is the only way to check that your bot and your backtester tell the truth. Lesson 8 shows how to connect the same code to a real chain.

:::warning Read this first
Most meme coins lose almost all of their value, many through deliberate scams, and most people who trade them lose money. This elective teaches you how these markets work and how to test a strategy rigorously. It is not financial advice, and nothing in it is a promise of profit. Never trade with money you can't afford to lose completely.
:::

## What a meme coin is

A **token** is an entry in a ledger on a blockchain that says which wallet owns how many units. A meme coin is a token with no business, no cash flows and no claim on anything. Its price is set entirely by what the next buyer will pay, which mostly depends on attention: a joke, a celebrity, a trend.

Launching one costs almost nothing. On Solana, launchpads let anyone create a token in seconds for a few cents, and thousands appear every day. That's the first fact a bot has to deal with: **the supply of new tokens is effectively unlimited, and almost all of them are noise.**

## Stage 1: the bonding curve

Most new tokens start on a launchpad that sells them along a **bonding curve**: a formula that sets the price from how many tokens have been sold so far. The more that are sold, the higher the price. Early buyers pay little; later buyers pay more.

A common design uses the same constant-product formula as a pool (below) with **virtual reserves**, so the price starts low but not at zero. Once the curve has sold enough, the token "graduates": the launchpad moves the collected money and the remaining tokens into a pool on a decentralised exchange, where anyone can trade both ways.

## Stage 2: the liquidity pool

A **decentralised exchange (DEX)** has no order book and no market maker you can call. It has **liquidity pools**: a program that holds two reserves, say $x$ SOL and $y$ tokens, and trades with anyone at a price set by a formula. The classic formula is the **constant product**:

$$
x \times y = k
$$

A trade must leave the product of the reserves unchanged (before fees). If you pay in $\Delta x$ SOL, the pool pays out $\Delta y$ tokens such that

$$
(x + \Delta x)(y - \Delta y) = x y \quad\Rightarrow\quad \Delta y = \frac{y\,\Delta x}{x + \Delta x}
$$

The pool also takes a **fee**, usually a fraction of a percent of the input. With a fee $f$, only $\Delta x (1 - f)$ counts towards the swap:

$$
\Delta y = \frac{y\,\Delta x (1 - f)}{x + \Delta x (1 - f)}
$$

The **spot price** of one token is $x / y$ SOL. Here's a pool in Rust:

```rust
/// A constant-product pool: SOL on one side, a token on the other.
struct Pool {
    sol: f64,
    tokens: f64,
    fee: f64, // 0.0025 = 0.25%
}

impl Pool {
    /// Price of one token in SOL, for a tiny trade.
    fn spot_price(&self) -> f64 {
        self.sol / self.tokens
    }

    /// Pay `sol_in` SOL, receive tokens. Updates the reserves.
    fn buy(&mut self, sol_in: f64) -> f64 {
        let effective = sol_in * (1.0 - self.fee);
        let out = self.tokens * effective / (self.sol + effective);
        self.sol += sol_in; // the fee stays in the pool
        self.tokens -= out;
        out
    }
}

fn main() {
    for sol_in in [0.1, 1.0, 10.0, 50.0] {
        let mut pool = Pool { sol: 100.0, tokens: 1_000_000_000.0, fee: 0.0025 };
        let before = pool.spot_price();
        let tokens = pool.buy(sol_in);
        let paid_per_token = sol_in / tokens;
        println!(
            "buy with {sol_in:>5} SOL: average price {:.3e}, {:>5.1}% above spot, spot moves {:>6.1}%",
            paid_per_token,
            (paid_per_token / before - 1.0) * 100.0,
            (pool.spot_price() / before - 1.0) * 100.0,
        );
    }
}
```

A 0.1 SOL buy pays essentially the spot price plus the fee. A 50 SOL buy into a 100 SOL pool pays about 50% more than spot on average, and leaves the price more than doubled. That gap between the spot price and your average price is **price impact**, and it's the first cost a bot pays. Meme coin pools are small, so it matters on every trade.

## Why it's done in integers

On-chain programs don't use `f64`. Floating-point results can differ between machines, and a ledger must be exact. Token amounts are integers in the token's smallest unit (SOL has 9 decimal places, so 1 SOL is 1,000,000,000 **lamports**), fees are in **basis points** (1 bp = 0.01%), and every division rounds **down**, so the pool never pays out more than the formula allows.

The products overflow `u64` quickly (a billion tokens with 6 decimals is $10^{15}$ units; times a 100 SOL reserve in lamports that's $10^{26}$, far beyond `u64`'s $1.8 \times 10^{19}$), so the maths runs in `u128`:

```rust
const BPS: u128 = 10_000;

/// Output of a constant-product swap, rounding down like an on-chain program.
fn swap_out(reserve_in: u64, reserve_out: u64, amount_in: u64, fee_bps: u64) -> u64 {
    let effective = amount_in as u128 * (BPS - fee_bps as u128);
    let numerator = effective * reserve_out as u128;
    let denominator = reserve_in as u128 * BPS + effective;
    (numerator / denominator) as u64
}

fn main() {
    let sol = 100 * 1_000_000_000u64;                 // 100 SOL in lamports
    let tokens = 1_000_000_000 * 1_000_000u64;        // 1 billion tokens, 6 decimals
    let out = swap_out(sol, tokens, 1_000_000_000, 25); // buy with 1 SOL, 0.25% fee
    println!("1 SOL buys {} raw units = {:.2} tokens", out, out as f64 / 1e6);
    println!("u64::MAX is {:.2e}; tokens × lamports would be {:.2e}", u64::MAX as f64, tokens as f64 * sol as f64);
}
```

Multiplying by `BPS - fee_bps` and dividing by `BPS` once at the end, instead of turning the fee into a fraction, keeps every step exact until the single final division.

## Why most meme coins go to zero

The pool formula is fair, and that's exactly the problem: it will happily sell you a worthless token at whatever price the last trade set. The ways it goes wrong are the subject of this elective:

- **Rug pulls.** Whoever added the liquidity can often remove it, taking the SOL side and leaving holders with tokens nobody can buy. Liquidity that's been *burned* (sent to an address no one controls) or *locked* can't be pulled this way.
- **Insider supply.** The creator and friends buy first, often from many wallets, and sell into the buyers who arrive later.
- **Dangerous permissions.** A token whose *mint authority* hasn't been revoked can be inflated at will; a *freeze authority* can stop your wallet from selling.
- **Fading attention.** Even without a scam, most tokens simply stop getting new buyers. With no new money, the only direction is down.
- **Bots, everywhere.** Snipers buy in the same block as the launch, and sandwich bots trade around your orders (lesson 3). Your competition is software.

You'll quantify each of these in the next lessons, starting with a simulator.

## Practice

:::exercise meme-swap-math Integer swap maths
Write the two functions a pool program needs. Do all the maths in `u128` and round down.

- `swap_out(reserve_in: u64, reserve_out: u64, amount_in: u64, fee_bps: u64) -> u64`: the output of a constant-product swap with a fee in basis points, as in the lesson
- `swap_in_for(reserve_in: u64, reserve_out: u64, amount_out: u64, fee_bps: u64) -> Option<u64>`: the **smallest** input that buys at least `amount_out`, or `None` if `amount_out >= reserve_out` (the pool can never pay out its whole reserve)

For `swap_in_for`, solve the formula for the input: $\Delta x = \dfrac{x\,\Delta y \cdot 10000}{(y - \Delta y)(10000 - \text{fee})}$, then round **up** (add 1 after integer division, unless it divided exactly), because rounding down would buy slightly too little.

@@starter
fn swap_out(reserve_in: u64, reserve_out: u64, amount_in: u64, fee_bps: u64) -> u64 {
    todo!()
}

fn swap_in_for(reserve_in: u64, reserve_out: u64, amount_out: u64, fee_bps: u64) -> Option<u64> {
    todo!()
}

@@solution
const BPS: u128 = 10_000;

fn swap_out(reserve_in: u64, reserve_out: u64, amount_in: u64, fee_bps: u64) -> u64 {
    let effective = amount_in as u128 * (BPS - fee_bps as u128);
    let numerator = effective * reserve_out as u128;
    let denominator = reserve_in as u128 * BPS + effective;
    (numerator / denominator) as u64
}

fn swap_in_for(reserve_in: u64, reserve_out: u64, amount_out: u64, fee_bps: u64) -> Option<u64> {
    if amount_out >= reserve_out {
        return None;
    }
    let numerator = reserve_in as u128 * amount_out as u128 * BPS;
    let denominator = (reserve_out - amount_out) as u128 * (BPS - fee_bps as u128);
    let amount = numerator / denominator + if numerator % denominator == 0 { 0 } else { 1 };
    Some(amount as u64)
}

@@tests
/// No fee: 100 in against 1000/1000 reserves gives 90 (rounded down from 90.9)
#[test]
fn simple_swap() {
    assert_eq!(swap_out(1_000, 1_000, 100, 0), 90);
}

/// A 0.25% fee on a realistic pool
#[test]
fn with_fee() {
    let out = swap_out(100_000_000_000, 1_000_000_000_000_000, 1_000_000_000, 25);
    assert_eq!(out, 9_876_482_091_140);
}

/// A billion tokens with 9 decimals and a million-SOL trade don't overflow
#[test]
fn no_overflow() {
    let out = swap_out(100_000 * 1_000_000_000, 1_000_000_000 * 1_000_000_000, 1_000_000 * 1_000_000_000, 30);
    assert!(out > 900_000_000_000_000_000 && out < 1_000_000_000_000_000_000, "got {out}");
}

/// The input found is enough, and one less is not
#[test]
fn inverse_is_minimal() {
    let (x, y, fee) = (100_000_000_000u64, 1_000_000_000_000_000u64, 25);
    for want in [1u64, 1_000_000, 5_000_000_000_000, 400_000_000_000_000] {
        let input = swap_in_for(x, y, want, fee).expect("should be possible");
        assert!(swap_out(x, y, input, fee) >= want, "{input} buys too little for {want}");
        assert!(swap_out(x, y, input - 1, fee) < want, "{input} isn't the smallest input for {want}");
    }
}

/// You can't buy the whole reserve
#[test]
fn impossible() {
    assert_eq!(swap_in_for(1_000, 1_000, 1_000, 25), None);
    assert_eq!(swap_in_for(1_000, 1_000, 5_000, 25), None);
}

@@hint
Cast every value to `u128` before multiplying: `amount_in as u128 * (10_000 - fee_bps as u128)`.

@@hint
For rounding up, compute `numerator / denominator` and add 1 when `numerator % denominator != 0`.
:::

:::exercise meme-price-impact Price impact
Price impact is how much worse your average price is than the spot price before the trade. Write `price_impact(reserve_in: f64, reserve_out: f64, amount_in: f64, fee: f64) -> f64`, returning it as a fraction: `average_price / spot_price - 1`, where the spot price is `reserve_in / reserve_out` and the average price is `amount_in / amount_out`. Include the fee (a fraction such as `0.0025`) in the swap, so a tiny trade's impact is about the fee.

Then write `max_buy_for_impact(reserve_in: f64, reserve_out: f64, fee: f64, max_impact: f64) -> f64`: the largest input whose price impact is at most `max_impact`. Price impact grows with size, so a **binary search** between 0 and `reserve_in * 100.0` works; 100 iterations are plenty.

@@starter
fn price_impact(reserve_in: f64, reserve_out: f64, amount_in: f64, fee: f64) -> f64 {
    todo!()
}

fn max_buy_for_impact(reserve_in: f64, reserve_out: f64, fee: f64, max_impact: f64) -> f64 {
    todo!()
}

@@solution
fn price_impact(reserve_in: f64, reserve_out: f64, amount_in: f64, fee: f64) -> f64 {
    let effective = amount_in * (1.0 - fee);
    let amount_out = reserve_out * effective / (reserve_in + effective);
    let spot = reserve_in / reserve_out;
    (amount_in / amount_out) / spot - 1.0
}

fn max_buy_for_impact(reserve_in: f64, reserve_out: f64, fee: f64, max_impact: f64) -> f64 {
    let (mut lo, mut hi) = (0.0, reserve_in * 100.0);
    for _ in 0..100 {
        let mid = (lo + hi) / 2.0;
        if mid > 0.0 && price_impact(reserve_in, reserve_out, mid, fee) > max_impact {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    lo
}

@@tests
fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() < tol
}

/// A tiny trade's impact is just the fee
#[test]
fn tiny_trade() {
    let impact = price_impact(100.0, 1e9, 1e-6, 0.0025);
    assert!(close(impact, 1.0 / 0.9975 - 1.0, 1e-6), "got {impact}");
}

/// With no fee, buying with half the reserve costs 50% more than spot
#[test]
fn half_the_pool() {
    assert!(close(price_impact(100.0, 1e9, 50.0, 0.0), 0.5, 1e-9));
}

/// Impact grows with size
#[test]
fn grows() {
    let a = price_impact(100.0, 1e9, 1.0, 0.003);
    let b = price_impact(100.0, 1e9, 10.0, 0.003);
    assert!(b > a && a > 0.0);
}

/// The largest buy within 5% impact
#[test]
fn max_buy() {
    let size = max_buy_for_impact(100.0, 1e9, 0.0025, 0.05);
    assert!(close(price_impact(100.0, 1e9, size, 0.0025), 0.05, 1e-6), "size {size}");
    assert!(size > 4.0 && size < 5.0, "size {size}");
}

@@hint
Without a fee, the impact simplifies to `amount_in / reserve_in`. Your function should agree with that when `fee` is 0.

@@hint
In the binary search, if the impact at `mid` is too big, the answer is below `mid` (`hi = mid`); otherwise it's at or above (`lo = mid`). Return `lo`.
:::

:::quiz meme-trade-check Quick check
? A pool holds 100 SOL and 1,000,000 tokens. Ignoring fees, roughly how many tokens does a 100 SOL buy get?
- [ ] 1,000,000
- [x] 500,000
- [ ] 100,000
> Δy = y·Δx / (x + Δx) = 1,000,000 × 100 / 200. Doubling the SOL side halves the token side.

? Why do on-chain swap programs round outputs down?
- [x] So the pool never pays out more than the formula allows
- [ ] Because integers can't be rounded up
- [ ] To make trades cheaper for users
> Rounding in the pool's favour keeps x · y from ever shrinking through rounding errors.

? What does it mean when a token's liquidity has been burned?
- [ ] The token has been deleted
- [x] The pool's liquidity can't be withdrawn by anyone, so that kind of rug pull isn't possible
- [ ] The price is guaranteed not to fall
> Burned liquidity blocks one scam, not the others: insiders can still sell, and the price can still fall to almost nothing.

? Which of these are real risks with a newly launched meme coin? (choose all that apply)
- [x] The creator removes the liquidity
- [x] An unrevoked mint authority inflates the supply
- [x] Buyers simply stop arriving
- [ ] The constant-product formula pays the wrong amount
> The pool maths works exactly as designed. The risks come from the people around it.
:::

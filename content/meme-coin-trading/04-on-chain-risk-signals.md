---
title: Reading on-chain risk signals
summary: Turn what's public on the chain into numbers a bot can use, parse a holder snapshot safely, measure concentration with top-holder share and the Herfindahl index, and encode a red-flag checklist with Rust types.
minutes: 50
kind: lesson
language: rust
---

A blockchain is public. Before you buy a token, anyone can see who holds it, what the creator's wallet did before, whether the liquidity can be withdrawn, and whether the token program still lets someone mint more or freeze accounts. None of this predicts the price, but much of it predicts **scams**, and avoiding scams is the one part of this market where a careful bot has a real advantage over a hurried human.

## What you can check

| Signal | Where it comes from | Why it matters |
| --- | --- | --- |
| Mint authority | The token's mint account | If it isn't revoked, someone can create unlimited new tokens and sell them |
| Freeze authority | The token's mint account | If it isn't revoked, someone can freeze your token account so you can't sell |
| Liquidity burned or locked | The pool's LP tokens | If the creator still holds them, they can withdraw the pool's SOL (a rug pull) |
| Top-holder share | All token accounts | A few large wallets can dump on everyone else |
| Creator's share and history | The creator's wallet and its past launches | Serial launchers often rug again |
| Early trading | Transactions in the first minutes | Many buys from freshly funded wallets suggests insiders splitting their position |

Mint and freeze authorities are a yes/no field each, which is the easy part. Concentration takes some arithmetic.

## Parsing a holder snapshot

Data from an RPC node or an indexer arrives as text or JSON, and a bot must treat it as untrusted: a malformed line must not crash a program that's holding positions. Here's a snapshot in a simple CSV format. `POOL` is the liquidity pool's own account, which holds the tokens available to buy. It isn't an investor, so concentration measures leave it out:

```rust
const SNAPSHOT: &str = "\
wallet,amount
POOL,520000000
CREATOR,90000000
7xKp,48000000
9aQe,47000000
3mRt,45000000
Ff2w,44000000
Hq8z,43000000
Bv5n,30000000
Lc1d,21000000
Wz7s,12000000
Pd4u,9000000
Ek9y,6000000
Tg3h,5000000
Ns6j,4000000
Ro2k,3000000";

fn parse(text: &str) -> Vec<(&str, u64)> {
    text.lines()
        .skip(1) // the header
        .filter_map(|line| {
            let (wallet, amount) = line.split_once(',')?;
            Some((wallet, amount.trim().parse().ok()?))
        })
        .collect()
}

fn main() {
    let holders = parse(SNAPSHOT);
    let supply: u64 = holders.iter().map(|&(_, a)| a).sum();
    // The pool's tokens are the market's inventory, not a holder's position.
    let mut balances: Vec<u64> = holders.iter().filter(|&&(w, _)| w != "POOL").map(|&(_, a)| a).collect();
    balances.sort_unstable_by(|a, b| b.cmp(a));
    let held: u64 = balances.iter().sum();

    let top10: u64 = balances.iter().take(10).sum();
    let creator = holders.iter().find(|&&(w, _)| w == "CREATOR").map_or(0, |&(_, a)| a);
    let hhi: f64 = balances.iter().map(|&a| (a as f64 / held as f64).powi(2)).sum();

    println!("{} holders outside the pool hold {:.1}% of the supply", balances.len(), held as f64 / supply as f64 * 100.0);
    println!("top 10 hold {:.1}% of the supply", top10 as f64 / supply as f64 * 100.0);
    println!("the creator holds {:.1}%", creator as f64 / supply as f64 * 100.0);
    println!("HHI {:.3}: as concentrated as {:.1} equal holders", hhi, 1.0 / hhi);
}
```

`filter_map` with `?` inside the closure quietly skips lines that don't parse. That's convenient for a demo, but a bot should *know* when its data is bad. In the exercise you'll return a proper error instead.

## Measuring concentration

**Top-holder share** is the simplest measure: what fraction of the supply do the 10 largest wallets hold? It's easy to explain, but it ignores everything below the tenth wallet.

The **Herfindahl–Hirschman index (HHI)**, which competition regulators use to measure how concentrated a market is, uses every holder. With each holder's share $s_i$ of the tokens held outside the pool:

$$
\text{HHI} = \sum_i s_i^2
$$

It's 1 when a single wallet holds everything, and $1/n$ for $n$ equal holders, so $1 / \text{HHI}$ reads as an **effective number of holders**. The snapshot above has 14 wallets, but they're as concentrated as about 8 equal ones.

Look at the five wallets after the creator: about 5% of the supply each, nearly identical. Real analysis tools look for exactly this pattern, often confirmed by tracing where the wallets got their SOL. Several wallets funded from the same source in the minutes before launch are usually one person. On-chain, splitting a position across wallets is free, so **counting wallets undercounts concentration**; treat every concentration number as a lower bound.

## A red-flag checklist with types

Rust's types make a checklist hard to get wrong. Each flag is an enum variant, so a `match` must handle every one, and adding a flag later makes the compiler point at every place that needs updating:

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum RedFlag {
    MintNotRevoked,
    FreezeNotRevoked,
    LiquidityUnlocked,
    ConcentratedHolders,
    SerialCreator,
}

struct TokenFacts {
    mint_revoked: bool,
    freeze_revoked: bool,
    liquidity_locked: bool,
    top10_share: f64,
    creator_prior_rugs: u32,
}

impl TokenFacts {
    fn red_flags(&self) -> Vec<RedFlag> {
        let mut flags = Vec::new();
        if !self.mint_revoked {
            flags.push(RedFlag::MintNotRevoked);
        }
        if !self.freeze_revoked {
            flags.push(RedFlag::FreezeNotRevoked);
        }
        if !self.liquidity_locked {
            flags.push(RedFlag::LiquidityUnlocked);
        }
        if self.top10_share > 0.30 {
            flags.push(RedFlag::ConcentratedHolders);
        }
        if self.creator_prior_rugs > 0 {
            flags.push(RedFlag::SerialCreator);
        }
        flags
    }
}

/// Some flags rule a token out on their own; others only add up.
fn is_dealbreaker(flag: RedFlag) -> bool {
    match flag {
        RedFlag::MintNotRevoked | RedFlag::FreezeNotRevoked | RedFlag::LiquidityUnlocked => true,
        RedFlag::ConcentratedHolders | RedFlag::SerialCreator => false,
    }
}

fn main() {
    let token = TokenFacts {
        mint_revoked: true,
        freeze_revoked: true,
        liquidity_locked: true,
        top10_share: 0.42,
        creator_prior_rugs: 2,
    };
    let flags = token.red_flags();
    println!("flags: {flags:?}");
    let blocked = flags.iter().any(|&f| is_dealbreaker(f));
    println!("dealbreaker: {blocked}; total flags: {}", flags.len());
}
```

This token passes the hard checks but is concentrated and comes from a creator with two previous rugs. Is that enough to skip it? A hand-written threshold is a guess. The next lesson replaces the guess with a model trained on labelled launches, and measures how good the guess was.

:::tip Getting these facts for real
On Solana, a token's mint and freeze authorities are fields of its mint account, and holder balances come from its token accounts (RPC methods such as `getTokenLargestAccounts`). Indexing services and token-checking sites compute much of this for you. Treat third-party risk scores as one more signal, not a verdict: they're wrong sometimes too, and scammers test against them.
:::

## Practice

:::exercise meme-parse-holders Parsing without panicking
Write `parse_holders(text: &str) -> Result<Vec<(String, u64)>, ParseError>` for the snapshot format above:

- The first line must be exactly `wallet,amount`, otherwise return `Err(ParseError::MissingHeader)`. Empty input is also `MissingHeader`.
- Every following non-empty line must be `wallet,amount` with a non-empty wallet and an amount that parses as `u64` (after trimming spaces). Otherwise return `Err(ParseError::BadLine(n))`, where `n` is the 1-based line number in the text (the header is line 1).
- Skip blank lines.

@@starter
#[derive(Debug, PartialEq)]
enum ParseError {
    MissingHeader,
    BadLine(usize),
}

fn parse_holders(text: &str) -> Result<Vec<(String, u64)>, ParseError> {
    todo!()
}

@@solution
#[derive(Debug, PartialEq)]
enum ParseError {
    MissingHeader,
    BadLine(usize),
}

fn parse_holders(text: &str) -> Result<Vec<(String, u64)>, ParseError> {
    let mut lines = text.lines().enumerate();
    match lines.next() {
        Some((_, header)) if header.trim() == "wallet,amount" => {}
        _ => return Err(ParseError::MissingHeader),
    }
    let mut holders = Vec::new();
    for (i, line) in lines {
        if line.trim().is_empty() {
            continue;
        }
        let (wallet, amount) = line.split_once(',').ok_or(ParseError::BadLine(i + 1))?;
        let wallet = wallet.trim();
        if wallet.is_empty() {
            return Err(ParseError::BadLine(i + 1));
        }
        let amount: u64 = amount.trim().parse().map_err(|_| ParseError::BadLine(i + 1))?;
        holders.push((wallet.to_string(), amount));
    }
    Ok(holders)
}

@@tests
/// A valid snapshot parses
#[test]
fn valid() {
    let parsed = parse_holders("wallet,amount\nPOOL,500\nabc, 20\n\nxyz,3\n").unwrap();
    assert_eq!(parsed, vec![("POOL".to_string(), 500), ("abc".to_string(), 20), ("xyz".to_string(), 3)]);
}

/// The header is required
#[test]
fn header() {
    assert_eq!(parse_holders(""), Err(ParseError::MissingHeader));
    assert_eq!(parse_holders("POOL,500\n"), Err(ParseError::MissingHeader));
}

/// Bad lines report their line number
#[test]
fn bad_lines() {
    assert_eq!(parse_holders("wallet,amount\nPOOL,500\nabc;20\n"), Err(ParseError::BadLine(3)));
    assert_eq!(parse_holders("wallet,amount\nabc,-5\n"), Err(ParseError::BadLine(2)));
    assert_eq!(parse_holders("wallet,amount\n,5\n"), Err(ParseError::BadLine(2)));
    assert_eq!(parse_holders("wallet,amount\n\nabc,lots\n"), Err(ParseError::BadLine(3)));
}

@@hint
`text.lines().enumerate()` gives 0-based indexes, so line numbers are `i + 1`. Take the header with `.next()` before looping over the rest.

@@hint
`.ok_or(...)?` turns a missing comma into an error, and `.map_err(|_| ...)?` does the same for a failed `parse::<u64>()`.
:::

:::exercise meme-concentration Concentration measures
Write two functions over holder balances (the pool already removed, in any order):

- `top_n_share(balances: &[u64], n: usize) -> f64`: the fraction of the total held by the `n` largest balances (all of them if there are fewer than `n`). Return 0.0 for an empty slice or a zero total.
- `effective_holders(balances: &[u64]) -> f64`: `1 / HHI`, where HHI is the sum of squared shares of the total. Return 0.0 for an empty slice or a zero total.

@@starter
fn top_n_share(balances: &[u64], n: usize) -> f64 {
    todo!()
}

fn effective_holders(balances: &[u64]) -> f64 {
    todo!()
}

@@solution
fn top_n_share(balances: &[u64], n: usize) -> f64 {
    let total: u64 = balances.iter().sum();
    if total == 0 {
        return 0.0;
    }
    let mut sorted = balances.to_vec();
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    sorted.iter().take(n).sum::<u64>() as f64 / total as f64
}

fn effective_holders(balances: &[u64]) -> f64 {
    let total: u64 = balances.iter().sum();
    if total == 0 {
        return 0.0;
    }
    let hhi: f64 = balances.iter().map(|&b| (b as f64 / total as f64).powi(2)).sum();
    1.0 / hhi
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// Top-N share sorts by size first
#[test]
fn top_share() {
    let b = [10, 50, 20, 20];
    assert!(close(top_n_share(&b, 1), 0.5));
    assert!(close(top_n_share(&b, 2), 0.7));
    assert!(close(top_n_share(&b, 10), 1.0));
}

/// Equal holders count as themselves
#[test]
fn equal_holders() {
    assert!(close(effective_holders(&[5, 5, 5, 5]), 4.0));
}

/// One whale dominates
#[test]
fn whale() {
    let e = effective_holders(&[900, 25, 25, 25, 25]);
    assert!(e > 1.0 && e < 1.3, "got {e}");
}

/// Empty and zero inputs return 0
#[test]
fn empty() {
    assert_eq!(top_n_share(&[], 10), 0.0);
    assert_eq!(effective_holders(&[0, 0]), 0.0);
}

@@hint
Sort a copy in descending order with `sort_unstable_by(|a, b| b.cmp(a))`, then `.iter().take(n).sum::<u64>()`.
:::

:::quiz meme-signals-check Quick check
? Why leave the pool's own account out of holder concentration?
- [x] It holds the tokens available to trade, not an investor's position that could be dumped
- [ ] It's always empty
- [ ] It belongs to the creator
> Counting the pool would make every token look extremely concentrated.

? What does an effective number of holders of 8 mean for a token with 500 wallets?
- [ ] 492 wallets are bots
- [x] Ownership is as concentrated as if 8 wallets held equal shares
- [ ] Only 8 wallets have traded it
> 1/HHI summarises concentration across every wallet in one intuitive number.

? Why is any concentration measure only a lower bound on the real concentration?
- [ ] Because balances are rounded
- [x] One person can split their tokens across many wallets for free
- [ ] Because the pool is excluded
> Linking wallets, for example by where their SOL came from, is how analysts find the real holders.
:::

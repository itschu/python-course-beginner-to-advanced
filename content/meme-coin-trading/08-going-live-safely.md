---
title: Going live safely
summary: How the simulated bot connects to Solana for real, how to keep private keys out of harm's way, why a bot should refuse to trade live unless every limit is set, and how to paper trade against the live market before risking anything.
minutes: 55
kind: lesson
language: rust
---

Everything so far has run on simulated data. This lesson covers what changes when the bot meets a real chain. Most of the code here needs crates from crates.io (`tokio`, `reqwest`, `serde` and Solana's SDK), so it's shown for reference and runs on your own computer, not in the browser. The runnable parts are the ones that matter most: the checks that stop a bot from doing damage.

:::warning Before you connect anything
Run the bot in **paper mode against the live market** for weeks before trading real money, and then trade amounts you can afford to lose entirely. Check the rules where you live: many countries treat every crypto trade as a taxable event, and some restrict trading bots or particular platforms. This lesson is about engineering, not advice on whether to trade.
:::

## The live architecture

The structure from lesson 6 doesn't change. Only the edges do:

| Part | Simulated | Live |
| --- | --- | --- |
| Feed | A thread replaying the simulator | WebSocket subscriptions to an RPC provider (new pools, trades, account changes), on a `tokio` runtime |
| Signals | Generated with the launch | RPC calls: the mint account (authorities), largest token accounts (holders), the pool's LP tokens |
| Executor | `paper_fill` | Get a quote and a swap transaction from an aggregator, sign it locally, send it, wait for confirmation |
| Book | In memory | In memory, **reconciled against on-chain balances** at start-up and after every fill |

A quote from Jupiter's swap API, for example, is one HTTP request. The endpoint and fields below follow its documentation at the time of writing; APIs like this change, so check the current docs before relying on them:

```rust static
// Cargo.toml: tokio = { version = "1", features = ["full"] }, reqwest = { version = "0.12", features = ["json"] },
//             serde = { version = "1", features = ["derive"] }
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Quote {
    out_amount: String,       // integers arrive as strings so nothing loses precision
    price_impact_pct: String,
}

const SOL_MINT: &str = "So11111111111111111111111111111111111111112";

async fn quote_buy(client: &reqwest::Client, token_mint: &str, lamports: u64, slippage_bps: u16) -> reqwest::Result<Quote> {
    client
        .get("https://lite-api.jup.ag/swap/v1/quote")
        .query(&[
            ("inputMint", SOL_MINT.to_string()),
            ("outputMint", token_mint.to_string()),
            ("amount", lamports.to_string()),
            ("slippageBps", slippage_bps.to_string()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await
}
```

The swap itself is a second request that returns an unsigned transaction. Your bot signs it with its own key, locally, and sends it through an RPC node. **No service should ever receive your private key.**

## Keeping keys safe

A trading bot holds a private key that can spend everything in its wallet, so treat the key like cash in an envelope:

- **Use a dedicated hot wallet** for the bot, funded with only what it's allowed to lose. Keep everything else in a separate wallet the bot can't access, ideally a hardware wallet.
- **Load the key from a file whose path is in an environment variable**, readable only by your user (`chmod 600`). Never put a key or seed phrase in code, in a config file in your repository, or in a chat message.
- **Add key files to `.gitignore` before you create them.** Bots scan public repositories for leaked keys and drain them within minutes.
- **Never run someone else's "sniper bot" with your key.** Fake trading bots, shared on social media, chat groups and code-hosting sites, are one of the most common ways people lose their crypto: the bot's real job is to send your key or your funds to its author. The same goes for websites that ask you to "connect your wallet" to claim something.
- **Check every crate name before adding it.** Typo-squatted packages that steal keys have appeared in several package registries. Prefer well-known crates, pin versions in `Cargo.lock`, and run `cargo audit`.

```rust static
use solana_sdk::signature::{read_keypair_file, Signer};

fn load_wallet() -> Result<solana_sdk::signature::Keypair, Box<dyn std::error::Error>> {
    let path = std::env::var("BOT_KEYPAIR").map_err(|_| "set BOT_KEYPAIR to the path of the bot's keypair file")?;
    let keypair = read_keypair_file(&path)?;
    println!("trading from {}", keypair.pubkey()); // the public key is safe to print; the keypair never is
    Ok(keypair)
}
```

## Refusing to start

The safest bot is one that won't trade live by accident. Make **paper mode the default**, require live mode to be switched on explicitly, and refuse to start live unless every risk limit has been set. A missing limit should be an error, never a default:

```rust
use std::collections::HashMap;

enum Mode {
    Paper,
    Live { max_stake_sol: f64, max_daily_loss_sol: f64 },
}

fn mode_from(vars: &HashMap<&str, &str>) -> Result<Mode, String> {
    if vars.get("BOT_MODE") != Some(&"live") {
        return Ok(Mode::Paper);
    }
    let limit = |name: &str| -> Result<f64, String> {
        let raw = vars.get(name).ok_or(format!("live mode needs {name}"))?;
        let value: f64 = raw.parse().map_err(|_| format!("{name} must be a number, got {raw:?}"))?;
        if value > 0.0 { Ok(value) } else { Err(format!("{name} must be positive")) }
    };
    Ok(Mode::Live { max_stake_sol: limit("MAX_STAKE_SOL")?, max_daily_loss_sol: limit("MAX_DAILY_LOSS_SOL")? })
}

fn main() {
    let cases: [&[(&str, &str)]; 4] = [
        &[],
        &[("BOT_MODE", "live")],
        &[("BOT_MODE", "live"), ("MAX_STAKE_SOL", "0.1"), ("MAX_DAILY_LOSS_SOL", "lots")],
        &[("BOT_MODE", "live"), ("MAX_STAKE_SOL", "0.1"), ("MAX_DAILY_LOSS_SOL", "0.5")],
    ];
    for vars in cases {
        let vars: HashMap<&str, &str> = vars.iter().copied().collect();
        match mode_from(&vars) {
            Ok(Mode::Paper) => println!("paper mode: no real orders"),
            Ok(Mode::Live { max_stake_sol, max_daily_loss_sol }) => {
                println!("LIVE: at most {max_stake_sol} SOL per trade, halt after losing {max_daily_loss_sol} SOL today")
            }
            Err(why) => println!("refusing to start: {why}"),
        }
    }
}
```

In the real bot, the map comes from `std::env::vars()`, and `main` exits with the error message instead of continuing.

## Paper trading against the live market

A backtest is a model of the market. Paper trading checks the model: run the live feed and live signals, but send every approved order to the paper executor, which records the price the bot *would* have got. Then compare:

- **Fill prices.** Fetch a real quote at the moment of each paper order. If real quotes are consistently worse than your backtest's fill model, the backtest is too optimistic, and so is everything it told you.
- **Signal timing.** How long after launch does your bot see a token? If it's 30 seconds rather than the 1 minute you assumed, re-run the backtest with the measured delay.
- **Results.** Paper results should look like the backtest's distribution. If they're much worse, believe the paper results.

Only move to live trading if paper trading matches what the backtest promised, and start at the smallest size the fees allow.

## Running it

A bot that runs unattended needs the operational habits of any production service, from Phase 8 and the capstone:

- **Log every decision with its reason**, every order, and every fill, in a structured format (JSON lines), so you can rebuild what happened.
- **Reconcile on start-up and after each fill**: the book must match the wallet's on-chain balances. If it doesn't, halt and alert rather than guess.
- **Alert on anything unusual**: repeated failed transactions, the loss limit, a stale feed, a reconciliation mismatch.
- **Make the kill switch reachable without a deploy**, for example a file the bot checks, or a flag in its configuration that it re-reads every minute.

## Practice

:::exercise meme-reconcile Reconciling the book
After a fill, a live bot compares its book with the wallet's real balances. Write `reconcile(book: &HashMap<String, u64>, chain: &HashMap<String, u64>) -> Vec<Mismatch>`: one `Mismatch` for every token (by mint address) where the two disagree, treating a token missing from one side as a balance of 0. Return them **sorted by mint** so the output is deterministic, and skip tokens where both sides are 0.

@@starter
use std::collections::HashMap;

#[derive(Debug, PartialEq)]
struct Mismatch {
    mint: String,
    book: u64,
    chain: u64,
}

fn reconcile(book: &HashMap<String, u64>, chain: &HashMap<String, u64>) -> Vec<Mismatch> {
    todo!()
}

@@solution
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, PartialEq)]
struct Mismatch {
    mint: String,
    book: u64,
    chain: u64,
}

fn reconcile(book: &HashMap<String, u64>, chain: &HashMap<String, u64>) -> Vec<Mismatch> {
    let mints: BTreeSet<&String> = book.keys().chain(chain.keys()).collect();
    mints
        .into_iter()
        .filter_map(|mint| {
            let b = book.get(mint).copied().unwrap_or(0);
            let c = chain.get(mint).copied().unwrap_or(0);
            (b != c).then(|| Mismatch { mint: mint.clone(), book: b, chain: c })
        })
        .collect()
}

@@tests
fn map(pairs: &[(&str, u64)]) -> HashMap<String, u64> {
    pairs.iter().map(|&(k, v)| (k.to_string(), v)).collect()
}

/// Matching books have no mismatches
#[test]
fn matching() {
    let b = map(&[("AAA", 5), ("BBB", 7)]);
    assert!(reconcile(&b, &b.clone()).is_empty());
}

/// Differences and missing tokens, sorted by mint
#[test]
fn differences() {
    let book = map(&[("CCC", 10), ("AAA", 5)]);
    let chain = map(&[("AAA", 4), ("BBB", 9)]);
    assert_eq!(
        reconcile(&book, &chain),
        vec![
            Mismatch { mint: "AAA".into(), book: 5, chain: 4 },
            Mismatch { mint: "BBB".into(), book: 0, chain: 9 },
            Mismatch { mint: "CCC".into(), book: 10, chain: 0 },
        ]
    );
}

/// Zero on one side and missing on the other is a match
#[test]
fn zeros() {
    assert!(reconcile(&map(&[("AAA", 0)]), &map(&[])).is_empty());
}

@@hint
Collect every mint from both maps into a `BTreeSet`, which keeps them sorted and unique.

@@hint
`book.get(mint).copied().unwrap_or(0)` reads a balance, treating a missing token as 0.
:::

:::exercise meme-kill-switch A kill switch that stays pulled
Write a `KillSwitch` with:

- `KillSwitch::new(max_failures: u32) -> KillSwitch`
- `record_failure(&mut self, reason: &str)`: counts a failed transaction; once there have been `max_failures` failures **in a row**, the switch trips, keeping that failure's reason
- `record_success(&mut self)`: resets the consecutive-failure count (but never un-trips the switch)
- `trip(&mut self, reason: &str)`: trips it immediately (keep the first reason if it's already tripped)
- `halted(&self) -> Option<&str>`: the reason it tripped, or `None`

Once tripped, only a person should reset it, so there's no method to un-trip it.

@@starter
struct KillSwitch {
    // your fields here
}

impl KillSwitch {
    fn new(max_failures: u32) -> KillSwitch {
        todo!()
    }

    fn record_failure(&mut self, reason: &str) {
        todo!()
    }

    fn record_success(&mut self) {
        todo!()
    }

    fn trip(&mut self, reason: &str) {
        todo!()
    }

    fn halted(&self) -> Option<&str> {
        todo!()
    }
}

@@solution
struct KillSwitch {
    max_failures: u32,
    failures_in_a_row: u32,
    reason: Option<String>,
}

impl KillSwitch {
    fn new(max_failures: u32) -> KillSwitch {
        KillSwitch { max_failures, failures_in_a_row: 0, reason: None }
    }

    fn record_failure(&mut self, reason: &str) {
        self.failures_in_a_row += 1;
        if self.failures_in_a_row >= self.max_failures {
            self.trip(reason);
        }
    }

    fn record_success(&mut self) {
        self.failures_in_a_row = 0;
    }

    fn trip(&mut self, reason: &str) {
        if self.reason.is_none() {
            self.reason = Some(reason.to_string());
        }
    }

    fn halted(&self) -> Option<&str> {
        self.reason.as_deref()
    }
}

@@tests
/// Trips after enough failures in a row
#[test]
fn trips() {
    let mut k = KillSwitch::new(3);
    k.record_failure("timeout");
    k.record_failure("timeout");
    assert_eq!(k.halted(), None);
    k.record_failure("blockhash expired");
    assert_eq!(k.halted(), Some("blockhash expired"));
}

/// A success resets the count
#[test]
fn success_resets() {
    let mut k = KillSwitch::new(2);
    k.record_failure("a");
    k.record_success();
    k.record_failure("b");
    assert_eq!(k.halted(), None);
}

/// Once tripped it stays tripped, with the first reason
#[test]
fn stays_tripped() {
    let mut k = KillSwitch::new(5);
    k.trip("loss limit");
    k.record_success();
    k.trip("manual");
    assert_eq!(k.halted(), Some("loss limit"));
}

@@hint
Store the consecutive failures as a number and the reason as an `Option<String>`. `as_deref()` turns `&Option<String>` into `Option<&str>`.
:::

:::quiz meme-live-check Quick check
? Where should a bot's private key be used?
- [x] Only on your own machine, to sign transactions locally
- [ ] Sent to the swap API so it can sign for you
- [ ] Stored in the repository so the bot can find it
> Aggregators return unsigned transactions. Nothing outside your machine needs the key.

? Someone shares a free, open-source sniper bot that needs your wallet's private key. What's the safest assumption?
- [ ] It's fine if it has many stars
- [x] It may exist to steal keys; never give it a key to a wallet with real funds
- [ ] It's fine if you run it on your own computer
> Fake bots are a common scam. Even code you run yourself can send your key away.

? Paper trading shows real quotes are consistently worse than your backtest's fills. What does that mean?
- [ ] The market is having a bad week
- [x] The backtest's fill model is too optimistic, so its results are too
- [ ] Nothing, paper trading isn't realistic
> Measure the gap and put it back into the backtest before believing it again.

? Why should a missing risk limit stop the bot instead of using a default?
- [x] A silent default can be far larger than you intended, and you'd only find out from your losses
- [ ] Rust can't have default values
- [ ] Defaults are slower
> Failing loudly at start-up is cheap. Discovering a wrong limit live is not.
:::

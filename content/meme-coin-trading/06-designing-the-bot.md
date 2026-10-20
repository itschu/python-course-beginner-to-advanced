---
title: Designing the bot
summary: Structure a trading bot as an event loop, with a strategy that only decides, a risk manager that can always say no, and a paper executor you can swap for a live one. Feed it from another thread with a channel.
minutes: 60
kind: lesson
language: rust
---

Most trading bots that lose money in surprising ways do it through **plumbing**, not prediction: a retry loop that buys twice, a sell that fails silently, a position nobody's tracking, a bug that keeps buying after the money should have stopped. Good structure prevents most of these, and Rust's types and ownership help enforce it.

## The shape of a bot

```text
 market data ──► events ──► strategy ──► orders ──► risk manager ──► executor ──► fills
   (feed)                   (decides)               (can say no)      (paper or live)
                    ▲                                                        │
                    └──────────────────── book: cash, positions ◄───────────┘
```

- **Events** are everything that happens: a token launched, a price changed, an order filled. The whole bot is a loop over them, which makes it easy to test: replay recorded events and you get exactly the same decisions.
- The **strategy** sees events and the current book, and returns orders. It never moves money, so you can test it in isolation.
- The **risk manager** checks every order against hard limits. It doesn't care why the strategy wants a trade; it only cares whether the bot can afford to be wrong about it.
- The **executor** turns approved orders into fills. A *paper* executor simulates fills; a *live* one signs and sends transactions. Both implement the same interface, so the rest of the bot can't tell them apart, which is exactly what makes paper trading a meaningful test.

## A complete paper-trading loop

This one runs on five scripted tokens. A separate thread plays the market feed and sends events through a **channel** (`std::sync::mpsc`), the same pattern you used in Phase 10. In a live bot, that thread would be reading from a WebSocket.

```rust
use std::collections::HashMap;
use std::sync::mpsc;
use std::thread;

/// Everything the bot reacts to arrives as an event.
#[derive(Debug, Clone)]
enum Event {
    /// A new token, with the rug-pull model's probability.
    Launch { token: u32, rug_risk: f64 },
    Price { token: u32, minute: u32, price: f64 },
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Order {
    Buy { token: u32, sol: f64 },
    Sell { token: u32, reason: &'static str },
}

struct Position {
    tokens: f64,
    cost: f64,
    high: f64,
    opened: u32,
}

/// The bot's view of its money: cash, open positions and the latest price of each token.
#[derive(Default)]
struct Book {
    cash: f64,
    positions: HashMap<u32, Position>,
    prices: HashMap<u32, f64>,
}

/// A strategy only decides. It never touches money directly.
trait Strategy {
    fn on_event(&mut self, event: &Event, book: &Book) -> Vec<Order>;
}

struct LowRiskMomentum;

impl Strategy for LowRiskMomentum {
    fn on_event(&mut self, event: &Event, book: &Book) -> Vec<Order> {
        match *event {
            Event::Launch { token, rug_risk } if rug_risk < 0.3 => vec![Order::Buy { token, sol: 0.5 }],
            Event::Launch { .. } => vec![],
            Event::Price { token, minute, price } => {
                let Some(pos) = book.positions.get(&token) else { return vec![] };
                let entry = pos.cost / pos.tokens;
                let reason = if price >= entry * 2.0 {
                    Some("take profit")
                } else if price <= pos.high * 0.6 {
                    Some("trailing stop")
                } else if minute - pos.opened >= 60 {
                    Some("time stop")
                } else {
                    None
                };
                reason.map(|reason| vec![Order::Sell { token, reason }]).unwrap_or_default()
            }
        }
    }
}

/// Every order passes the risk manager, whatever the strategy wants.
struct RiskManager {
    max_stake: f64,
    max_open: usize,
    max_loss: f64,
    start_cash: f64,
}

impl RiskManager {
    fn approve(&self, order: &Order, book: &Book) -> Result<(), &'static str> {
        let Order::Buy { sol, .. } = *order else { return Ok(()) }; // selling always reduces risk
        let marked: f64 = book.positions.iter().map(|(t, p)| p.tokens * book.prices[t]).sum();
        if self.start_cash - (book.cash + marked) >= self.max_loss {
            return Err("loss limit reached: no new positions");
        }
        if sol > self.max_stake {
            return Err("stake too large");
        }
        if book.positions.len() >= self.max_open {
            return Err("too many open positions");
        }
        if sol > book.cash {
            return Err("not enough cash");
        }
        Ok(())
    }
}

/// Paper trading: fill at the latest price minus a fee, without sending anything anywhere.
fn paper_fill(order: &Order, book: &mut Book, minute: u32) -> String {
    const FEE: f64 = 0.01; // pool fee, slippage and network fees, roughly
    match *order {
        Order::Buy { token, sol } => {
            let price = book.prices[&token];
            let tokens = sol * (1.0 - FEE) / price;
            book.cash -= sol;
            book.positions.insert(token, Position { tokens, cost: sol, high: price, opened: minute });
            format!("bought token {token} with {sol} SOL")
        }
        Order::Sell { token, reason } => {
            let pos = book.positions.remove(&token).expect("selling a position we hold");
            let sol = pos.tokens * book.prices[&token] * (1.0 - FEE);
            book.cash += sol;
            format!("sold token {token} ({reason}): {:+.3} SOL", sol - pos.cost)
        }
    }
}

fn feed(tx: mpsc::Sender<Event>) {
    // (rug risk, price path): a winner, a rug, one the model flags, a slow fader, and one too many.
    let paths: [(f64, fn(u32) -> f64); 5] = [
        (0.10, |m| 1.0 + 0.03 * m as f64),
        (0.20, |m| if m < 20 { 1.0 + 0.02 * m as f64 } else { 0.01 }),
        (0.85, |m| 1.0 + 0.05 * m as f64),
        (0.15, |m| 1.0 - 0.004 * m as f64),
        (0.05, |_| 1.0),
    ];
    for (token, (risk, _)) in paths.iter().enumerate() {
        tx.send(Event::Launch { token: token as u32, rug_risk: *risk }).unwrap();
    }
    for minute in 1..=90 {
        for (token, (_, path)) in paths.iter().enumerate() {
            tx.send(Event::Price { token: token as u32, minute, price: path(minute) }).unwrap();
        }
    }
}

fn main() {
    let (tx, rx) = mpsc::channel();
    let producer = thread::spawn(move || feed(tx));

    let mut book = Book { cash: 2.0, ..Default::default() };
    let risk = RiskManager { max_stake: 0.5, max_open: 3, max_loss: 1.0, start_cash: book.cash };
    let mut strategy = LowRiskMomentum;

    for event in rx {
        let minute = match event {
            Event::Launch { token, .. } => {
                book.prices.insert(token, 1.0);
                0
            }
            Event::Price { token, minute, price } => {
                book.prices.insert(token, price);
                if let Some(pos) = book.positions.get_mut(&token) {
                    pos.high = pos.high.max(price);
                }
                minute
            }
        };
        for order in strategy.on_event(&event, &book) {
            match risk.approve(&order, &book) {
                Ok(()) => println!("minute {minute:>2}: {}", paper_fill(&order, &mut book, minute)),
                Err(why) => println!("minute {minute:>2}: rejected {order:?}: {why}"),
            }
        }
    }
    producer.join().unwrap();
    println!("cash at the end: {:.3} SOL, open positions: {}", book.cash, book.positions.len());
}
```

Each line of output is a decision you can explain:

- Token 2 is never bought: the rug model gave it 0.85, above the strategy's cut-off.
- Token 4 is rejected by the **risk manager**, not the strategy. The strategy wanted it; the limit of three open positions said no.
- Token 1 rugs at minute 20. The trailing stop fires, but only *after* the price has already collapsed: a stop can't sell at a price that no longer exists. On a rug pull you lose almost everything, stop or no stop. That's why the scam filter runs before the trade, not during it.
- Token 0 hits the 2× take-profit; token 3 drifts down until the 60-minute **time stop** closes it.

Notice what the types do. `Order` is an enum, so the executor's `match` must handle every kind of order. The book's positions live in one `HashMap` that only the executor writes to, so there's exactly one place where money moves. The risk manager takes `&Book`, a shared reference, so it *can't* modify anything even by accident.

## Rules that never bend

A risk manager is only useful if nothing can get around it. The essentials:

- **Maximum stake per trade**, sized from the pool (lesson 1's price impact) and from your total budget. Many traders risk no more than 1–2% of their trading money per position.
- **Maximum open positions**, so one bad hour can't use everything.
- **A loss limit** that stops all new buying once losses for the day (or in total) reach a set amount. Selling stays allowed: it only ever reduces risk.
- **A kill switch**: one flag, checked first, that halts all buying immediately. Set it from the loss limit, from an error the bot doesn't understand, or by hand.

Put the limits in configuration, never in the strategy's code, and make the bot refuse to start without them.

## Practice

:::exercise meme-risk-check The risk manager
Write `check(limits: &Limits, account: &Account, stake: f64) -> Result<(), Reject>` for a proposed **buy** of `stake` SOL. Check, in this order, and return the first failure:

1. `account.halted` is true: `Reject::Halted`
2. today's loss (`-account.pnl_today`, when `pnl_today` is negative) is at least `limits.max_daily_loss`: `Reject::LossLimit`
3. `stake > limits.max_stake`: `Reject::StakeTooLarge`
4. `account.open_positions >= limits.max_open`: `Reject::TooManyPositions`
5. `stake > account.cash`: `Reject::NotEnoughCash`

@@starter
#[derive(Debug, PartialEq)]
enum Reject {
    Halted,
    LossLimit,
    StakeTooLarge,
    TooManyPositions,
    NotEnoughCash,
}

struct Limits {
    max_stake: f64,
    max_open: usize,
    max_daily_loss: f64,
}

struct Account {
    cash: f64,
    open_positions: usize,
    pnl_today: f64,
    halted: bool,
}

fn check(limits: &Limits, account: &Account, stake: f64) -> Result<(), Reject> {
    todo!()
}

@@solution
#[derive(Debug, PartialEq)]
enum Reject {
    Halted,
    LossLimit,
    StakeTooLarge,
    TooManyPositions,
    NotEnoughCash,
}

struct Limits {
    max_stake: f64,
    max_open: usize,
    max_daily_loss: f64,
}

struct Account {
    cash: f64,
    open_positions: usize,
    pnl_today: f64,
    halted: bool,
}

fn check(limits: &Limits, account: &Account, stake: f64) -> Result<(), Reject> {
    if account.halted {
        return Err(Reject::Halted);
    }
    if -account.pnl_today >= limits.max_daily_loss {
        return Err(Reject::LossLimit);
    }
    if stake > limits.max_stake {
        return Err(Reject::StakeTooLarge);
    }
    if account.open_positions >= limits.max_open {
        return Err(Reject::TooManyPositions);
    }
    if stake > account.cash {
        return Err(Reject::NotEnoughCash);
    }
    Ok(())
}

@@tests
fn limits() -> Limits {
    Limits { max_stake: 0.5, max_open: 3, max_daily_loss: 1.0 }
}

fn account() -> Account {
    Account { cash: 2.0, open_positions: 1, pnl_today: -0.2, halted: false }
}

/// A normal trade is approved
#[test]
fn approved() {
    assert_eq!(check(&limits(), &account(), 0.5), Ok(()));
}

/// Each limit rejects on its own
#[test]
fn each_limit() {
    assert_eq!(check(&limits(), &Account { halted: true, ..account() }, 0.1), Err(Reject::Halted));
    assert_eq!(check(&limits(), &Account { pnl_today: -1.0, ..account() }, 0.1), Err(Reject::LossLimit));
    assert_eq!(check(&limits(), &account(), 0.6), Err(Reject::StakeTooLarge));
    assert_eq!(check(&limits(), &Account { open_positions: 3, ..account() }, 0.1), Err(Reject::TooManyPositions));
    assert_eq!(check(&limits(), &Account { cash: 0.05, ..account() }, 0.1), Err(Reject::NotEnoughCash));
}

/// A profitable day never triggers the loss limit
#[test]
fn profit_is_fine() {
    assert_eq!(check(&limits(), &Account { pnl_today: 5.0, ..account() }, 0.5), Ok(()));
}

/// The order of checks: halted beats everything
#[test]
fn order() {
    let bad = Account { cash: 0.0, open_positions: 9, pnl_today: -9.0, halted: true };
    assert_eq!(check(&limits(), &bad, 9.0), Err(Reject::Halted));
    let no_halt = Account { halted: false, ..bad };
    assert_eq!(check(&limits(), &no_halt, 9.0), Err(Reject::LossLimit));
}

@@hint
A chain of `if ... { return Err(...); }` in the given order, then `Ok(())`.
:::

:::exercise meme-exit-rules Exit rules
Write `exit_reason(rules: &ExitRules, entry: f64, high: f64, price: f64, minutes_held: u32) -> Option<Exit>` for an open position. `high` is the highest price since buying (at least `entry`). Check in this order and return the first that applies:

1. `Exit::StopLoss` if `price <= entry * (1.0 - rules.stop_loss)`
2. `Exit::TrailingStop` if `price <= high * (1.0 - rules.trailing)`
3. `Exit::TakeProfit` if `price >= entry * rules.take_profit`
4. `Exit::TimeStop` if `minutes_held >= rules.max_minutes`

Otherwise return `None`.

@@starter
#[derive(Debug, PartialEq)]
enum Exit {
    StopLoss,
    TrailingStop,
    TakeProfit,
    TimeStop,
}

struct ExitRules {
    stop_loss: f64,
    trailing: f64,
    take_profit: f64,
    max_minutes: u32,
}

fn exit_reason(rules: &ExitRules, entry: f64, high: f64, price: f64, minutes_held: u32) -> Option<Exit> {
    todo!()
}

@@solution
#[derive(Debug, PartialEq)]
enum Exit {
    StopLoss,
    TrailingStop,
    TakeProfit,
    TimeStop,
}

struct ExitRules {
    stop_loss: f64,
    trailing: f64,
    take_profit: f64,
    max_minutes: u32,
}

fn exit_reason(rules: &ExitRules, entry: f64, high: f64, price: f64, minutes_held: u32) -> Option<Exit> {
    if price <= entry * (1.0 - rules.stop_loss) {
        Some(Exit::StopLoss)
    } else if price <= high * (1.0 - rules.trailing) {
        Some(Exit::TrailingStop)
    } else if price >= entry * rules.take_profit {
        Some(Exit::TakeProfit)
    } else if minutes_held >= rules.max_minutes {
        Some(Exit::TimeStop)
    } else {
        None
    }
}

@@tests
fn rules() -> ExitRules {
    ExitRules { stop_loss: 0.3, trailing: 0.4, take_profit: 2.0, max_minutes: 60 }
}

/// Holding when nothing applies
#[test]
fn hold() {
    assert_eq!(exit_reason(&rules(), 1.0, 1.2, 1.1, 10), None);
}

/// Each rule fires
#[test]
fn each_rule() {
    assert_eq!(exit_reason(&rules(), 1.0, 1.0, 0.7, 5), Some(Exit::StopLoss));
    assert_eq!(exit_reason(&rules(), 1.0, 1.9, 1.1, 5), Some(Exit::TrailingStop));
    assert_eq!(exit_reason(&rules(), 1.0, 2.1, 2.1, 5), Some(Exit::TakeProfit));
    assert_eq!(exit_reason(&rules(), 1.0, 1.1, 1.05, 60), Some(Exit::TimeStop));
}

/// The stop-loss wins when several apply
#[test]
fn priority() {
    // Below the stop-loss and far below the high, after the time limit.
    assert_eq!(exit_reason(&rules(), 1.0, 3.0, 0.5, 90), Some(Exit::StopLoss));
    // Above take-profit but 40% below the high: protect the gain.
    assert_eq!(exit_reason(&rules(), 1.0, 4.0, 2.4, 10), Some(Exit::TrailingStop));
}

@@hint
An `if / else if` chain in the given order, each branch returning `Some(Exit::...)`, and `None` at the end.
:::

:::quiz meme-design-check Quick check
? Why should a strategy return orders instead of executing trades itself?
- [x] So every trade passes the risk manager, and the strategy can be tested without moving money
- [ ] Because strategies run on a different thread
- [ ] To make the bot faster
> Separating decisions from execution gives you one place where money moves and one place where limits are enforced.

? A loss limit has been reached. Which orders should the risk manager still allow?
- [ ] None
- [x] Sells, because they only reduce risk
- [ ] Buys smaller than the maximum stake
> Blocking sells would trap you in positions that might keep falling.

? A token is rug-pulled while you hold it with a 30% stop-loss. What happens?
- [ ] You lose 30%
- [x] You lose almost everything: the price gaps straight past the stop
- [ ] The stop-loss cancels the rug pull
> A stop sells at the next available price. After a rug, that price is close to zero.

? Why do paper and live executors share one interface?
- [x] So the rest of the bot behaves identically in both, which makes paper trading a real test
- [ ] Rust requires it
- [ ] To make live trading cheaper
> If paper mode ran different code, a paper-trading result would tell you nothing about live behaviour.
:::

---
title: "Project: the betting toolkit in Rust"
summary: Rebuild your Phase 1 Python toolkit in Rust, with types that make invalid odds impossible to use by accident.
minutes: 120
kind: project
language: rust
---

In Phase 1 you wrote a betting toolkit in Python: converting odds, measuring the bookmaker's margin, finding value and staking with Kelly. Now you'll build it again in Rust.

Rewriting something you already understand is the best way to learn a new language. You don't have to think about *what* to compute, only about *how Rust wants it expressed*. Watch for the places where Rust's types catch mistakes that the Python version only caught at run time, or not at all.

## The design

```text
Odds (a newtype: always > 1.0)      ─┐
  ├─ Odds::new(f64) -> Result<Odds, BetError>        validated once, at the edge
  ├─ implied_probability()                           can't fail any more
Market { home, draw, away: Odds }   ─┤
  ├─ margin(), fair_probabilities()
Selection enum { Home, Draw, Away } ─┤
value_bets(market, model probabilities) -> Vec<(Selection, edge)>
kelly_stake(probability, odds, bankroll, fraction) -> f64
Bet { selection, odds, stake } + settle(bets, result) -> profit, ROI
```

The key idea is **parse, don't validate**: check that odds are valid in one place, `Odds::new`, and wrap them in a type that can only hold valid values. Every function that takes an `Odds` then knows it's valid without checking again. In the Python version, every function had to remember to check.

Work through the steps in order. Each exercise includes everything it needs from the previous steps, so you can also do them separately.

## Step 1: A validated Odds type

:::exercise proj-rs-odds Odds that are always valid
Complete `Odds::new` so that it returns `Err(BetError::InvalidOdds(value))` for odds that are not finite or not above 1.0 (use `value.is_finite()`), and `Ok(Odds(value))` otherwise.

Then implement `implied_probability(&self) -> f64` and `fractional(&self) -> f64` (the fractional odds, as a number: decimal odds minus 1, so 2.5 is 1.5, i.e. "6/4").

The field of `Odds` is private to this module, so the only way to make one from outside is `Odds::new`. That's what makes the guarantee hold.

@@starter
#[derive(Debug, Clone, PartialEq)]
enum BetError {
    InvalidOdds(f64),
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Odds(f64);

impl Odds {
    fn new(value: f64) -> Result<Odds, BetError> {
        todo!()
    }

    fn value(&self) -> f64 {
        self.0
    }

    fn implied_probability(&self) -> f64 {
        todo!()
    }

    fn fractional(&self) -> f64 {
        todo!()
    }
}

@@solution
#[derive(Debug, Clone, PartialEq)]
enum BetError {
    InvalidOdds(f64),
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Odds(f64);

impl Odds {
    fn new(value: f64) -> Result<Odds, BetError> {
        if !value.is_finite() || value <= 1.0 {
            return Err(BetError::InvalidOdds(value));
        }
        Ok(Odds(value))
    }

    fn value(&self) -> f64 {
        self.0
    }

    fn implied_probability(&self) -> f64 {
        1.0 / self.0
    }

    fn fractional(&self) -> f64 {
        self.0 - 1.0
    }
}

@@tests
/// Valid odds are accepted
#[test]
fn valid() {
    assert_eq!(Odds::new(2.5).map(|o| o.value()), Ok(2.5));
}

/// Odds of 1.0 or less are rejected
#[test]
fn too_low() {
    assert_eq!(Odds::new(1.0), Err(BetError::InvalidOdds(1.0)));
    assert_eq!(Odds::new(-3.0), Err(BetError::InvalidOdds(-3.0)));
}

/// NaN and infinity are rejected
#[test]
fn not_finite() {
    assert!(Odds::new(f64::NAN).is_err());
    assert!(Odds::new(f64::INFINITY).is_err());
}

/// Implied probability and fractional odds
#[test]
fn conversions() {
    let o = Odds::new(4.0).unwrap();
    assert_eq!(o.implied_probability(), 0.25);
    assert_eq!(o.fractional(), 3.0);
}

@@hint
`if !value.is_finite() || value <= 1.0 { return Err(BetError::InvalidOdds(value)); }` then `Ok(Odds(value))`.
:::

## Step 2: A three-way market

:::exercise proj-rs-market Margin and fair probabilities
A `Market` holds the odds for home, draw and away. Implement:

- `Market::parse(text: &str) -> Result<Market, BetError>` for text like `"2.10 3.40 3.60"` (whitespace separated). Text that isn't a number becomes `BetError::NotANumber(the text)`. Anything other than exactly three prices is `BetError::WrongCount(n)`. Invalid odds give `InvalidOdds`, via `Odds::new` and `?`.
- `margin(&self) -> f64`: the sum of the implied probabilities, minus 1.
- `fair_probabilities(&self) -> [f64; 3]`: each implied probability divided by their sum, so they add up to 1.

@@starter
#[derive(Debug, Clone, PartialEq)]
enum BetError {
    InvalidOdds(f64),
    NotANumber(String),
    WrongCount(usize),
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Odds(f64);

impl Odds {
    fn new(value: f64) -> Result<Odds, BetError> {
        if !value.is_finite() || value <= 1.0 {
            return Err(BetError::InvalidOdds(value));
        }
        Ok(Odds(value))
    }

    fn implied_probability(&self) -> f64 {
        1.0 / self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Market {
    home: Odds,
    draw: Odds,
    away: Odds,
}

impl Market {
    fn parse(text: &str) -> Result<Market, BetError> {
        todo!()
    }

    fn margin(&self) -> f64 {
        todo!()
    }

    fn fair_probabilities(&self) -> [f64; 3] {
        todo!()
    }
}

@@solution
#[derive(Debug, Clone, PartialEq)]
enum BetError {
    InvalidOdds(f64),
    NotANumber(String),
    WrongCount(usize),
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Odds(f64);

impl Odds {
    fn new(value: f64) -> Result<Odds, BetError> {
        if !value.is_finite() || value <= 1.0 {
            return Err(BetError::InvalidOdds(value));
        }
        Ok(Odds(value))
    }

    fn implied_probability(&self) -> f64 {
        1.0 / self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Market {
    home: Odds,
    draw: Odds,
    away: Odds,
}

impl Market {
    fn parse(text: &str) -> Result<Market, BetError> {
        let mut prices = Vec::new();
        for part in text.split_whitespace() {
            let value: f64 = part.parse().map_err(|_| BetError::NotANumber(part.to_string()))?;
            prices.push(Odds::new(value)?);
        }
        if prices.len() != 3 {
            return Err(BetError::WrongCount(prices.len()));
        }
        Ok(Market { home: prices[0], draw: prices[1], away: prices[2] })
    }

    fn overround(&self) -> f64 {
        self.home.implied_probability() + self.draw.implied_probability() + self.away.implied_probability()
    }

    fn margin(&self) -> f64 {
        self.overround() - 1.0
    }

    fn fair_probabilities(&self) -> [f64; 3] {
        let total = self.overround();
        [
            self.home.implied_probability() / total,
            self.draw.implied_probability() / total,
            self.away.implied_probability() / total,
        ]
    }
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// Parses three prices
#[test]
fn parses() {
    let m = Market::parse("2.10 3.40 3.60").unwrap();
    assert_eq!(m.home, Odds(2.1));
    assert_eq!(m.away, Odds(3.6));
}

/// Reports bad input precisely
#[test]
fn errors() {
    assert_eq!(Market::parse("2.10 evens 3.60"), Err(BetError::NotANumber("evens".to_string())));
    assert_eq!(Market::parse("2.10 3.40"), Err(BetError::WrongCount(2)));
    assert_eq!(Market::parse("2.10 0.90 3.60"), Err(BetError::InvalidOdds(0.9)));
}

/// The margin of a 2.10 / 3.40 / 3.60 market is about 4.8%
#[test]
fn margin() {
    let m = Market::parse("2.10 3.40 3.60").unwrap();
    assert!(close(m.margin(), 1.0 / 2.1 + 1.0 / 3.4 + 1.0 / 3.6 - 1.0), "got {}", m.margin());
}

/// Fair probabilities add up to 1
#[test]
fn fair() {
    let m = Market::parse("2.0 4.0 4.0").unwrap();
    let p = m.fair_probabilities();
    assert!(close(p.iter().sum::<f64>(), 1.0));
    assert!(close(p[0], 0.5) && close(p[1], 0.25) && close(p[2], 0.25), "got {p:?}");
}

@@hint
In `parse`, loop over `text.split_whitespace()`. For each part: parse with `map_err(|_| BetError::NotANumber(part.to_string()))?`, then `prices.push(Odds::new(value)?)`. Check the count after the loop.

@@hint
A private helper `fn overround(&self) -> f64` (the sum of the three implied probabilities) makes both `margin` and `fair_probabilities` one-liners.
:::

## Step 3: Value bets and Kelly staking

A bet has **value** when your model's probability times the odds is above 1: the expected profit per unit staked, the **edge**, is `p × odds − 1`. The Kelly criterion stakes the fraction `edge / (odds − 1)` of your bankroll. Professionals bet a fraction of Kelly (often a quarter) because their probabilities are estimates.

:::exercise proj-rs-value Find value and size the stakes
Implement:

- `value_bets(market: &Market, model: [f64; 3], min_edge: f64) -> Vec<(Selection, f64)>`: every selection whose edge is at least `min_edge`, as `(selection, edge)`, in the order Home, Draw, Away.
- `kelly_stake(p: f64, odds: Odds, bankroll: f64, fraction: f64) -> f64`: `bankroll × fraction × edge / (odds − 1)`, or `0.0` when the edge isn't positive. Round down to whole cents (`(x * 100.0).floor() / 100.0`).

@@starter
#[derive(Debug, Clone, Copy, PartialEq)]
struct Odds(f64);

#[derive(Debug, Clone, Copy, PartialEq)]
struct Market {
    home: Odds,
    draw: Odds,
    away: Odds,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Selection {
    Home,
    Draw,
    Away,
}

fn edge(p: f64, odds: Odds) -> f64 {
    p * odds.0 - 1.0
}

fn value_bets(market: &Market, model: [f64; 3], min_edge: f64) -> Vec<(Selection, f64)> {
    todo!()
}

fn kelly_stake(p: f64, odds: Odds, bankroll: f64, fraction: f64) -> f64 {
    todo!()
}

@@solution
#[derive(Debug, Clone, Copy, PartialEq)]
struct Odds(f64);

#[derive(Debug, Clone, Copy, PartialEq)]
struct Market {
    home: Odds,
    draw: Odds,
    away: Odds,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Selection {
    Home,
    Draw,
    Away,
}

fn edge(p: f64, odds: Odds) -> f64 {
    p * odds.0 - 1.0
}

fn value_bets(market: &Market, model: [f64; 3], min_edge: f64) -> Vec<(Selection, f64)> {
    let options = [
        (Selection::Home, market.home, model[0]),
        (Selection::Draw, market.draw, model[1]),
        (Selection::Away, market.away, model[2]),
    ];
    let mut found = Vec::new();
    for (selection, odds, p) in options {
        let e = edge(p, odds);
        if e >= min_edge {
            found.push((selection, e));
        }
    }
    found
}

fn kelly_stake(p: f64, odds: Odds, bankroll: f64, fraction: f64) -> f64 {
    let e = edge(p, odds);
    if e <= 0.0 {
        return 0.0;
    }
    let stake = bankroll * fraction * e / (odds.0 - 1.0);
    (stake * 100.0).floor() / 100.0
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

/// Finds the selections with enough edge
#[test]
fn finds_value() {
    let m = Market { home: Odds(2.1), draw: Odds(3.4), away: Odds(3.6) };
    let found = value_bets(&m, [0.52, 0.27, 0.21], 0.02);
    assert_eq!(found.len(), 1, "got {found:?}");
    assert_eq!(found[0].0, Selection::Home);
    assert!(close(found[0].1, 0.52 * 2.1 - 1.0));
}

/// Keeps the Home, Draw, Away order
#[test]
fn order() {
    let m = Market { home: Odds(3.0), draw: Odds(4.0), away: Odds(5.0) };
    let found: Vec<Selection> = value_bets(&m, [0.4, 0.3, 0.3], 0.0).into_iter().map(|(s, _)| s).collect();
    assert_eq!(found, vec![Selection::Home, Selection::Draw, Selection::Away]);
}

/// Quarter Kelly on a 52% chance at 2.10 with 1000 bankroll
#[test]
fn kelly() {
    // edge 0.092, full Kelly 0.08364 -> quarter Kelly 20.909 -> 20.90
    assert_eq!(kelly_stake(0.52, Odds(2.1), 1000.0, 0.25), 20.90);
}

/// No edge, no bet
#[test]
fn kelly_no_edge() {
    assert_eq!(kelly_stake(0.4, Odds(2.0), 1000.0, 1.0), 0.0);
}

@@hint
Put the three options in an array of tuples `(Selection, Odds, f64)` and loop over it, pushing `(selection, edge)` when the edge is big enough.
:::

## Step 4: Settle bets and measure ROI

:::exercise proj-rs-settle Settle a list of bets
Implement `settle(bets: &[Bet], result: Selection) -> f64` returning the total profit: a winning bet makes `stake × (odds − 1)`, a losing one loses its stake.

Then implement `roi(bets: &[Bet], results: &[Selection]) -> Option<f64>`: bet `i` is settled against `results[i]`, and ROI is total profit divided by total staked. Return `None` if nothing was staked or if the two slices have different lengths.

@@starter
#[derive(Debug, Clone, Copy, PartialEq)]
enum Selection {
    Home,
    Draw,
    Away,
}

#[derive(Debug, Clone, Copy)]
struct Bet {
    selection: Selection,
    odds: f64,
    stake: f64,
}

fn settle(bets: &[Bet], result: Selection) -> f64 {
    todo!()
}

fn roi(bets: &[Bet], results: &[Selection]) -> Option<f64> {
    todo!()
}

@@solution
#[derive(Debug, Clone, Copy, PartialEq)]
enum Selection {
    Home,
    Draw,
    Away,
}

#[derive(Debug, Clone, Copy)]
struct Bet {
    selection: Selection,
    odds: f64,
    stake: f64,
}

fn profit(bet: &Bet, result: Selection) -> f64 {
    if bet.selection == result {
        bet.stake * (bet.odds - 1.0)
    } else {
        -bet.stake
    }
}

fn settle(bets: &[Bet], result: Selection) -> f64 {
    let mut total = 0.0;
    for bet in bets {
        total += profit(bet, result);
    }
    total
}

fn roi(bets: &[Bet], results: &[Selection]) -> Option<f64> {
    if bets.len() != results.len() {
        return None;
    }
    let mut staked = 0.0;
    let mut total = 0.0;
    for (bet, &result) in bets.iter().zip(results) {
        staked += bet.stake;
        total += profit(bet, result);
    }
    if staked == 0.0 { None } else { Some(total / staked) }
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

fn bet(selection: Selection, odds: f64, stake: f64) -> Bet {
    Bet { selection, odds, stake }
}

/// Winners pay stake × (odds − 1), losers lose the stake
#[test]
fn settles() {
    let bets = [bet(Selection::Home, 2.5, 10.0), bet(Selection::Away, 4.0, 5.0)];
    assert!(close(settle(&bets, Selection::Home), 15.0 - 5.0));
    assert!(close(settle(&bets, Selection::Draw), -15.0));
}

/// ROI over several matches
#[test]
fn roi_works() {
    let bets = [bet(Selection::Home, 2.0, 10.0), bet(Selection::Draw, 3.0, 10.0)];
    let r = roi(&bets, &[Selection::Home, Selection::Away]).unwrap();
    assert!(close(r, 0.0), "won 10, lost 10 -> ROI 0, got {r}");
    let r = roi(&bets, &[Selection::Home, Selection::Draw]).unwrap();
    assert!(close(r, 30.0 / 20.0), "got {r}");
}

/// None when nothing was staked or the lengths differ
#[test]
fn roi_none() {
    assert_eq!(roi(&[], &[]), None);
    assert_eq!(roi(&[bet(Selection::Home, 2.0, 1.0)], &[]), None);
}

@@hint
A helper `fn profit(bet: &Bet, result: Selection) -> f64` is useful in both functions.

@@hint
`bets.iter().zip(results)` walks both slices together, like Python's `zip`.
:::

## Compare the two versions

Put your Phase 1 Python toolkit next to this one and notice:

- **Where validation happens.** Python checked odds in several functions. Rust checks once in `Odds::new`, and the type carries the guarantee.
- **Errors are values.** `Market::parse` tells callers exactly what went wrong (`NotANumber("evens")`, `WrongCount(2)`), and the compiler makes them handle it.
- **Enums instead of strings.** A typo like `"hmoe"` was a silent bug in Python; `Selection::Hmoe` doesn't compile.
- **Speed.** For a few bets, both are instant. Run a million simulated seasons (Phase 6) and the Rust version will be roughly 50 to 100 times faster in a release build.

:::tip Take it further on your own machine
Once you install Rust in Phase 10, make this a real Cargo project with `cargo new betting_tools`, move each part into its own module, and add a `main` that reads markets from a file. It's a good first Rust repository for your GitHub profile.
:::

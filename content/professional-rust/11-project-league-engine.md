---
title: "Project: a league table engine"
summary: Parse match data with proper errors, build a sorted league table with traits and iterators, and add pluggable rating systems.
minutes: 120
kind: project
language: rust
---

In this project you'll build the core of a football statistics engine in idiomatic Rust: parsing with good error messages, a league table sorted by football's tie-break rules, a `Display`ed table, and pluggable rating systems behind a trait. On your own machine, it would be a library crate with a thin `main` that reads a CSV file.

```text
parse_results(text) -> Result<Vec<MatchResult>, ParseError>     (step 1)
Table::from_results(&[MatchResult]) -> Table                     (step 2)
  └─ standings() sorted by points, goal difference, goals for, name
impl Display for Table                                            (step 3)
trait RatingSystem { fn update(...); fn rating(...) }             (step 4)
  ├─ Elo
  └─ PointsPerGame
```

## Step 1: Parsing with good errors

:::exercise proj-league-parse Parse the results file
Each line looks like `2024-08-17,Arsenal,Wolves,2,0` (date, home, away, home goals, away goals). Write `parse_results(text: &str) -> Result<Vec<MatchResult>, ParseError>`:

- skip blank lines and a header line starting with `date`
- a line without exactly 5 fields is `ParseError::WrongFieldCount { line, found }`
- a goal count that isn't a `u8` is `ParseError::BadGoals { line, value }`
- a team playing itself is `ParseError::SameTeam { line }`

`line` is the 1-based line number in the text. Trim spaces around each field.

@@starter
#[derive(Debug, Clone, PartialEq)]
struct MatchResult {
    date: String,
    home: String,
    away: String,
    home_goals: u8,
    away_goals: u8,
}

#[derive(Debug, PartialEq)]
enum ParseError {
    WrongFieldCount { line: usize, found: usize },
    BadGoals { line: usize, value: String },
    SameTeam { line: usize },
}

fn parse_results(text: &str) -> Result<Vec<MatchResult>, ParseError> {
    todo!()
}

@@solution
#[derive(Debug, Clone, PartialEq)]
struct MatchResult {
    date: String,
    home: String,
    away: String,
    home_goals: u8,
    away_goals: u8,
}

#[derive(Debug, PartialEq)]
enum ParseError {
    WrongFieldCount { line: usize, found: usize },
    BadGoals { line: usize, value: String },
    SameTeam { line: usize },
}

fn parse_goals(value: &str, line: usize) -> Result<u8, ParseError> {
    value.parse().map_err(|_| ParseError::BadGoals { line, value: value.to_string() })
}

fn parse_results(text: &str) -> Result<Vec<MatchResult>, ParseError> {
    let mut results = Vec::new();
    for (i, raw) in text.lines().enumerate() {
        let line = i + 1;
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with("date") {
            continue;
        }
        let fields: Vec<&str> = trimmed.split(',').map(str::trim).collect();
        let [date, home, away, hg, ag] = fields[..] else {
            return Err(ParseError::WrongFieldCount { line, found: fields.len() });
        };
        if home == away {
            return Err(ParseError::SameTeam { line });
        }
        results.push(MatchResult {
            date: date.to_string(),
            home: home.to_string(),
            away: away.to_string(),
            home_goals: parse_goals(hg, line)?,
            away_goals: parse_goals(ag, line)?,
        });
    }
    Ok(results)
}

@@tests
const DATA: &str = "date,home,away,hg,ag
2024-08-17,Arsenal,Wolves,2,0

2024-08-24, Villa , Arsenal , 0 , 2
";

/// Parses valid lines, skipping the header and blanks
#[test]
fn parses() {
    let r = parse_results(DATA).unwrap();
    assert_eq!(r.len(), 2);
    assert_eq!(r[1].home, "Villa");
    assert_eq!((r[1].home_goals, r[1].away_goals), (0, 2));
}

/// Reports the wrong number of fields with the line number
#[test]
fn field_count() {
    assert_eq!(
        parse_results("2024-08-17,Arsenal,Wolves,2"),
        Err(ParseError::WrongFieldCount { line: 1, found: 4 })
    );
}

/// Reports bad goal counts
#[test]
fn bad_goals() {
    assert_eq!(
        parse_results("date\n2024-08-17,Arsenal,Wolves,two,0"),
        Err(ParseError::BadGoals { line: 2, value: "two".to_string() })
    );
    assert!(matches!(parse_results("d,A,B,300,0"), Err(ParseError::BadGoals { .. })));
}

/// A team can't play itself
#[test]
fn same_team() {
    assert_eq!(parse_results("d,Spurs,Spurs,1,1"), Err(ParseError::SameTeam { line: 1 }));
}

@@hint
Use `text.lines().enumerate()` for line numbers (add 1). Split each line with `.split(',').map(str::trim).collect::<Vec<&str>>()`.

@@hint
A slice pattern checks the count and names the fields in one go: `let [date, home, away, hg, ag] = fields[..] else { return Err(...); };`
:::

## Step 2: The table

Football league tables are sorted by points, then goal difference, then goals scored. We'll break any remaining tie alphabetically so the order is always deterministic.

:::exercise proj-league-table Build and sort the table
Implement `Table::from_results(results: &[MatchResult]) -> Table` and `standings(&self) -> Vec<&Row>`, which returns the rows sorted best first.

Each `Row` tracks played, won, drawn, lost, goals for and against. Add the methods `points()` (3 per win, 1 per draw) and `goal_difference()` (as an `i32`).

@@starter
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
struct MatchResult {
    home: String,
    away: String,
    home_goals: u8,
    away_goals: u8,
}

#[derive(Debug, Default, Clone, PartialEq)]
struct Row {
    team: String,
    played: u32,
    won: u32,
    drawn: u32,
    lost: u32,
    goals_for: u32,
    goals_against: u32,
}

impl Row {
    fn points(&self) -> u32 {
        todo!()
    }

    fn goal_difference(&self) -> i32 {
        todo!()
    }
}

struct Table {
    rows: HashMap<String, Row>,
}

impl Table {
    fn from_results(results: &[MatchResult]) -> Table {
        todo!()
    }

    fn standings(&self) -> Vec<&Row> {
        todo!()
    }
}

@@solution
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
struct MatchResult {
    home: String,
    away: String,
    home_goals: u8,
    away_goals: u8,
}

#[derive(Debug, Default, Clone, PartialEq)]
struct Row {
    team: String,
    played: u32,
    won: u32,
    drawn: u32,
    lost: u32,
    goals_for: u32,
    goals_against: u32,
}

impl Row {
    fn points(&self) -> u32 {
        3 * self.won + self.drawn
    }

    fn goal_difference(&self) -> i32 {
        self.goals_for as i32 - self.goals_against as i32
    }

    fn record(&mut self, scored: u8, conceded: u8) {
        self.played += 1;
        self.goals_for += scored as u32;
        self.goals_against += conceded as u32;
        if scored > conceded {
            self.won += 1;
        } else if scored == conceded {
            self.drawn += 1;
        } else {
            self.lost += 1;
        }
    }
}

struct Table {
    rows: HashMap<String, Row>,
}

impl Table {
    fn from_results(results: &[MatchResult]) -> Table {
        let mut rows: HashMap<String, Row> = HashMap::new();
        for m in results {
            rows.entry(m.home.clone())
                .or_insert_with(|| Row { team: m.home.clone(), ..Default::default() })
                .record(m.home_goals, m.away_goals);
            rows.entry(m.away.clone())
                .or_insert_with(|| Row { team: m.away.clone(), ..Default::default() })
                .record(m.away_goals, m.home_goals);
        }
        Table { rows }
    }

    fn standings(&self) -> Vec<&Row> {
        let mut rows: Vec<&Row> = self.rows.values().collect();
        rows.sort_by(|a, b| {
            b.points()
                .cmp(&a.points())
                .then(b.goal_difference().cmp(&a.goal_difference()))
                .then(b.goals_for.cmp(&a.goals_for))
                .then(a.team.cmp(&b.team))
        });
        rows
    }
}

@@tests
fn m(home: &str, away: &str, hg: u8, ag: u8) -> MatchResult {
    MatchResult { home: home.into(), away: away.into(), home_goals: hg, away_goals: ag }
}

fn order(t: &Table) -> Vec<&str> {
    t.standings().iter().map(|r| r.team.as_str()).collect()
}

/// Counts results and goals for each team
#[test]
fn rows() {
    let t = Table::from_results(&[m("A", "B", 2, 0), m("B", "A", 1, 1)]);
    let a = &t.rows["A"];
    assert_eq!((a.played, a.won, a.drawn, a.lost, a.goals_for, a.goals_against), (2, 1, 1, 0, 3, 1));
    assert_eq!(a.points(), 4);
    assert_eq!(t.rows["B"].goal_difference(), -2);
}

/// Sorted by points first
#[test]
fn by_points() {
    let t = Table::from_results(&[m("A", "B", 0, 1), m("C", "A", 0, 0)]);
    assert_eq!(order(&t), vec!["B", "C", "A"]); // A and C both have 1 point; C has the better goal difference
}

/// Then goal difference, then goals scored, then name
#[test]
fn tie_breaks() {
    let t = Table::from_results(&[
        m("A", "X", 3, 0), // A: 3 pts, GD +3, GF 3
        m("B", "Y", 4, 1), // B: 3 pts, GD +3, GF 4
        m("C", "Z", 1, 0), // C: 3 pts, GD +1
        m("D", "W", 1, 0), // D: same as C, so alphabetical
    ]);
    assert_eq!(&order(&t)[..4], &["B", "A", "C", "D"]);
}

@@hint
A helper `fn record(&mut self, scored: u8, conceded: u8)` on `Row` keeps `from_results` short. Use `rows.entry(name.clone()).or_insert_with(|| Row { team: name.clone(), ..Default::default() })` to find or create a row.

@@hint
`Ordering` values chain with `.then(...)`: `b.points().cmp(&a.points()).then(b.goal_difference().cmp(&a.goal_difference()))...`. Comparing `b` to `a` sorts descending; the final name comparison is `a.team.cmp(&b.team)`, ascending.
:::

## Step 3: Display the table

:::exercise proj-league-display Print the table
Implement `Display` for `Standings` (a wrapper around the sorted rows) so it prints one line per team:

```text
 1 Arsenal         P 2  GD  +4  Pts  6
 2 Wolves          P 2  GD  -1  Pts  3
```

The format for each line is `{position:>2} {team:<15} P {played}  GD {gd:>+3}  Pts {points:>2}`, and lines are separated by newlines (no newline after the last line).

@@starter
use std::fmt;

struct Row {
    team: String,
    played: u32,
    goal_difference: i32,
    points: u32,
}

struct Standings(Vec<Row>);

impl fmt::Display for Standings {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        todo!()
    }
}

@@solution
use std::fmt;

struct Row {
    team: String,
    played: u32,
    goal_difference: i32,
    points: u32,
}

struct Standings(Vec<Row>);

impl fmt::Display for Standings {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        for (i, row) in self.0.iter().enumerate() {
            if i > 0 {
                writeln!(f)?;
            }
            write!(
                f,
                "{:>2} {:<15} P {}  GD {:>+3}  Pts {:>2}",
                i + 1,
                row.team,
                row.played,
                row.goal_difference,
                row.points
            )?;
        }
        Ok(())
    }
}

@@tests
fn row(team: &str, played: u32, goal_difference: i32, points: u32) -> Row {
    Row { team: team.to_string(), played, goal_difference, points }
}

/// Formats each line
#[test]
fn formats() {
    let s = Standings(vec![row("Arsenal", 2, 4, 6), row("Wolves", 2, -1, 3)]);
    assert_eq!(
        s.to_string(),
        " 1 Arsenal         P 2  GD  +4  Pts  6\n 2 Wolves          P 2  GD  -1  Pts  3"
    );
}

/// An empty table prints nothing
#[test]
fn empty() {
    assert_eq!(Standings(vec![]).to_string(), "");
}

@@hint
Loop with `.enumerate()`. Use `write!(f, ...)?` for each line and `writeln!(f)?` *before* every line except the first. `{:>+3}` right-aligns a number in 3 characters and always shows its sign.
:::

## Step 4: Pluggable ratings

Different rating systems suit different jobs: Elo updates after every match, points-per-game is simple and transparent. A trait lets the rest of the engine work with any of them.

:::exercise proj-league-ratings A RatingSystem trait
Define a trait `RatingSystem` with:

- `fn update(&mut self, home: &str, away: &str, home_goals: u8, away_goals: u8);`
- `fn rating(&self, team: &str) -> f64;`
- a default method `fn favourite(&self, home: &str, away: &str) -> String` that returns the team with the higher rating (home on a tie)

Implement it for:

- `Elo { ratings: HashMap<String, f64>, k: f64 }`: every team starts at 1500. The expected home score is `1 / (1 + 10^((away − home) / 400))`, the actual score is 1, 0.5 or 0, and both ratings move by `k × (actual − expected)` (in opposite directions).
- `PointsPerGame { points: HashMap<String, (u32, u32)> }` storing (points, games): the rating is points ÷ games, or 0.0 for a team with no games.

Finally, `rate_all(system: &mut dyn RatingSystem, results: &[(&str, &str, u8, u8)])` feeds every result to the system.

@@starter
use std::collections::HashMap;

trait RatingSystem {
    // your methods here
}

struct Elo {
    ratings: HashMap<String, f64>,
    k: f64,
}

struct PointsPerGame {
    points: HashMap<String, (u32, u32)>,
}

fn rate_all(system: &mut dyn RatingSystem, results: &[(&str, &str, u8, u8)]) {
    todo!()
}

@@solution
use std::collections::HashMap;

trait RatingSystem {
    fn update(&mut self, home: &str, away: &str, home_goals: u8, away_goals: u8);
    fn rating(&self, team: &str) -> f64;

    fn favourite(&self, home: &str, away: &str) -> String {
        if self.rating(away) > self.rating(home) { away.to_string() } else { home.to_string() }
    }
}

struct Elo {
    ratings: HashMap<String, f64>,
    k: f64,
}

impl RatingSystem for Elo {
    fn update(&mut self, home: &str, away: &str, home_goals: u8, away_goals: u8) {
        let rh = self.rating(home);
        let ra = self.rating(away);
        let expected = 1.0 / (1.0 + 10f64.powf((ra - rh) / 400.0));
        let actual = if home_goals > away_goals {
            1.0
        } else if home_goals == away_goals {
            0.5
        } else {
            0.0
        };
        let change = self.k * (actual - expected);
        self.ratings.insert(home.to_string(), rh + change);
        self.ratings.insert(away.to_string(), ra - change);
    }

    fn rating(&self, team: &str) -> f64 {
        self.ratings.get(team).copied().unwrap_or(1500.0)
    }
}

struct PointsPerGame {
    points: HashMap<String, (u32, u32)>,
}

impl RatingSystem for PointsPerGame {
    fn update(&mut self, home: &str, away: &str, home_goals: u8, away_goals: u8) {
        let (hp, ap) = if home_goals > away_goals {
            (3, 0)
        } else if home_goals == away_goals {
            (1, 1)
        } else {
            (0, 3)
        };
        for (team, pts) in [(home, hp), (away, ap)] {
            let entry = self.points.entry(team.to_string()).or_insert((0, 0));
            entry.0 += pts;
            entry.1 += 1;
        }
    }

    fn rating(&self, team: &str) -> f64 {
        match self.points.get(team) {
            Some(&(points, games)) if games > 0 => points as f64 / games as f64,
            _ => 0.0,
        }
    }
}

fn rate_all(system: &mut dyn RatingSystem, results: &[(&str, &str, u8, u8)]) {
    for &(home, away, hg, ag) in results {
        system.update(home, away, hg, ag);
    }
}

@@tests
fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-9
}

const RESULTS: [(&str, &str, u8, u8); 3] = [("A", "B", 2, 0), ("B", "C", 1, 1), ("C", "A", 0, 1)];

/// Elo: a win between equal teams moves 10 points each way with k = 20
#[test]
fn elo_first_match() {
    let mut elo = Elo { ratings: HashMap::new(), k: 20.0 };
    elo.update("A", "B", 2, 0);
    assert!(close(elo.rating("A"), 1510.0) && close(elo.rating("B"), 1490.0));
    assert_eq!(elo.rating("Unknown"), 1500.0);
}

/// Elo is zero-sum over a season
#[test]
fn elo_zero_sum() {
    let mut elo = Elo { ratings: HashMap::new(), k: 20.0 };
    rate_all(&mut elo, &RESULTS);
    let total: f64 = ["A", "B", "C"].iter().map(|t| elo.rating(t)).sum();
    assert!(close(total, 4500.0), "got {total}");
    assert_eq!(elo.favourite("B", "A"), "A");
}

/// Points per game
#[test]
fn ppg() {
    let mut ppg = PointsPerGame { points: HashMap::new() };
    rate_all(&mut ppg, &RESULTS);
    assert!(close(ppg.rating("A"), 3.0));
    assert!(close(ppg.rating("B"), 0.5));
    assert_eq!(ppg.rating("Z"), 0.0);
}

/// favourite prefers home on a tie
#[test]
fn favourite_tie() {
    let ppg = PointsPerGame { points: HashMap::new() };
    assert_eq!(ppg.favourite("Home", "Away"), "Home");
}

@@hint
Declare the two required methods with a `;` and no body, and give `favourite` a body using `self.rating(...)`.

@@hint
For Elo, read both ratings first (`self.ratings.get(team).copied().unwrap_or(1500.0)`), compute the change, then insert both new values.
:::

## Where to go from here

On your machine, turn this into a real crate:

1. `cargo new --lib league` and put each step in its own module (`parse.rs`, `table.rs`, `ratings.rs`).
2. Add a `src/main.rs` that reads `data/matches.csv` (download it from this course's repository) with `std::fs::read_to_string`, prints the table, and prints the top 5 by Elo.
3. Add `#[derive(serde::Deserialize)]` and the `csv` crate to replace the hand-written parser, and compare.
4. Time it on 100,000 matches with `--release`, then write the same in pandas and compare.

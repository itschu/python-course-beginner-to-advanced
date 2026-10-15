---
title: Vec, HashMap and HashSet
summary: Rust's equivalents of list, dict and set, how to loop over them without moving them, and the entry API.
minutes: 50
kind: lesson
language: rust
---

| Python | Rust | Notes |
| --- | --- | --- |
| `list` | `Vec<T>` | Every element has the same type `T` |
| `dict` | `HashMap<K, V>` | `use std::collections::HashMap;` |
| `set` | `HashSet<T>` | `use std::collections::HashSet;` |
| `tuple` | `(A, B, C)` | Fixed size, mixed types |
| fixed-size list | `[T; N]` (array) | Size known at compile time, lives on the stack |
| `collections.deque` | `VecDeque<T>` | Fast push and pop at both ends |
| `collections.OrderedDict` / sorted dict | `BTreeMap<K, V>` | Keys kept in sorted order |

## Vec

```rust
fn main() {
    let mut goals: Vec<u32> = Vec::new();
    goals.push(2);
    goals.push(0);
    goals.extend([3, 1]);                 // like list.extend

    let odds = vec![2.1, 3.4, 3.6];       // vec! builds one from values
    println!("{goals:?} has {} items", goals.len());
    println!("first {}, last {:?}", goals[0], goals.last());
    println!("contains 3? {}", goals.contains(&3));

    goals.sort();
    println!("sorted {goals:?}");
    goals.reverse();
    println!("popped {:?}, left {goals:?}", goals.pop());
    goals.insert(0, 9);
    goals.remove(1);
    println!("{goals:?}");
    println!("odds {odds:?}");
}
```

Every element must have the same type. If you need a list of different things, use a `Vec` of an enum or of a struct.

## Looping without giving the Vec away

This is where ownership shows up in everyday code. `for x in v` **consumes** the vector: each element moves into `x`, and `v` can't be used afterwards. Usually you want to borrow instead:

```rust
fn main() {
    let mut teams = vec![String::from("Arsenal"), String::from("Chelsea")];

    for team in &teams {                 // borrow: team is a &String
        println!("{team}");
    }

    for team in &mut teams {             // mutable borrow: team is a &mut String
        team.push_str(" FC");
    }

    for (i, team) in teams.iter().enumerate() {
        println!("{i}: {team}");
    }

    for team in teams {                  // consumes teams: each String moves into team
        println!("taking {team}");
    }
    // teams can't be used here any more
}
```

| Loop | Element type | Vec afterwards |
| --- | --- | --- |
| `for x in &v` (or `v.iter()`) | `&T` | still usable |
| `for x in &mut v` (or `v.iter_mut()`) | `&mut T` | still usable, possibly changed |
| `for x in v` (or `v.into_iter()`) | `T` | gone |

## Sorting floats

`f64` can be `NaN` ("not a number"), which isn't less than, equal to or greater than anything, so `vec_of_f64.sort()` doesn't compile. Use `sort_by` with `total_cmp`:

```rust
fn main() {
    let mut odds: Vec<f64> = vec![3.4, 2.1, 3.6, 1.9];
    odds.sort_by(|a, b| a.total_cmp(b));
    println!("{odds:?}");
    odds.sort_by(|a, b| b.total_cmp(a));     // descending
    println!("{odds:?}");

    let mut teams = vec![("Arsenal", 70), ("Chelsea", 74), ("Spurs", 66)];
    teams.sort_by_key(|&(_, points)| std::cmp::Reverse(points));
    println!("{teams:?}");
}
```

## HashMap

```rust
use std::collections::HashMap;

fn main() {
    let mut elo: HashMap<String, f64> = HashMap::new();
    elo.insert("Arsenal".to_string(), 1850.0);
    elo.insert("Chelsea".to_string(), 1790.0);

    // get returns an Option: the key might not exist
    match elo.get("Arsenal") {
        Some(rating) => println!("Arsenal: {rating}"),
        None => println!("unknown team"),
    }
    println!("Spurs: {}", elo.get("Spurs").copied().unwrap_or(1500.0));

    // change a value in place
    if let Some(rating) = elo.get_mut("Chelsea") {
        *rating += 12.5;
    }

    println!("has Arsenal? {}", elo.contains_key("Arsenal"));
    for (team, rating) in &elo {
        println!("{team}: {rating}");
    }
}
```

A `HashMap`'s iteration order is **random** (unlike a Python dict, which keeps insertion order). If you need sorted keys, collect them and sort, or use a `BTreeMap`.

## The entry API

Counting things, the job of Python's `Counter` or `dict.get(k, 0) + 1`, uses `entry`:

```rust
use std::collections::HashMap;

fn main() {
    let results = ["H", "D", "H", "A", "H", "D"];
    let mut counts: HashMap<&str, u32> = HashMap::new();
    for r in results {
        *counts.entry(r).or_insert(0) += 1;
    }
    let mut keys: Vec<_> = counts.keys().collect();
    keys.sort();
    for k in keys {
        println!("{k}: {}", counts[k]);
    }

    // grouping, like defaultdict(list)
    let matches = [("Arsenal", 2), ("Chelsea", 1), ("Arsenal", 3)];
    let mut goals: HashMap<&str, Vec<u32>> = HashMap::new();
    for (team, g) in matches {
        goals.entry(team).or_default().push(g);
    }
    println!("{:?}", goals["Arsenal"]);
}
```

`entry(key)` finds the slot for a key, `or_insert(default)` fills it if it's empty, and you get back a `&mut` to the value. `or_default()` uses the type's default (0, an empty `Vec`, ...).

## HashSet

```rust
use std::collections::HashSet;

fn main() {
    let league_a: HashSet<&str> = ["Arsenal", "Chelsea", "Spurs"].into_iter().collect();
    let league_b: HashSet<&str> = ["Chelsea", "Leeds"].into_iter().collect();

    let mut both: Vec<_> = league_a.intersection(&league_b).collect();
    both.sort();
    let mut all: Vec<_> = league_a.union(&league_b).collect();
    all.sort();
    println!("in both: {both:?}");
    println!("all: {all:?}");
    println!("Leeds in A? {}", league_a.contains("Leeds"));
}
```

## Practice

:::exercise rust-hashmap-points League points
Each match is a tuple `(home, away, home_goals, away_goals)`. Write `points_table(matches: &[(&str, &str, u32, u32)]) -> HashMap<String, u32>` that returns each team's points: 3 for a win, 1 for a draw, 0 for a loss. Every team that played must appear, even with 0 points.

`HashMap` is already imported for you.

@@starter
use std::collections::HashMap;

fn points_table(matches: &[(&str, &str, u32, u32)]) -> HashMap<String, u32> {
    todo!()
}

@@solution
use std::collections::HashMap;

fn points_table(matches: &[(&str, &str, u32, u32)]) -> HashMap<String, u32> {
    let mut table: HashMap<String, u32> = HashMap::new();
    for &(home, away, hg, ag) in matches {
        let (home_pts, away_pts) = if hg > ag {
            (3, 0)
        } else if hg == ag {
            (1, 1)
        } else {
            (0, 3)
        };
        *table.entry(home.to_string()).or_insert(0) += home_pts;
        *table.entry(away.to_string()).or_insert(0) += away_pts;
    }
    table
}

@@tests
/// Points for wins, draws and losses
#[test]
fn table() {
    let matches = [
        ("Arsenal", "Chelsea", 2, 0),
        ("Chelsea", "Spurs", 1, 1),
        ("Spurs", "Arsenal", 3, 1),
    ];
    let t = points_table(&matches);
    assert_eq!(t["Arsenal"], 3);
    assert_eq!(t["Chelsea"], 1);
    assert_eq!(t["Spurs"], 4);
}

/// Teams with no points still appear
#[test]
fn zero_points() {
    let t = points_table(&[("A", "B", 1, 0)]);
    assert_eq!(t.get("B"), Some(&0));
    assert_eq!(t.len(), 2);
}

/// No matches, empty table
#[test]
fn empty() {
    assert!(points_table(&[]).is_empty());
}

@@hint
Work out `(home_pts, away_pts)` with an `if` expression, then add each with `*table.entry(name.to_string()).or_insert(0) += pts;`.
:::

:::exercise rust-word-frequency Most common word
Write `most_common(text: &str) -> Option<(String, usize)>` that returns the most frequent word (case-insensitive, split on whitespace) and its count. If two words tie, return the one that comes first alphabetically. Return `None` for text with no words.

@@starter
use std::collections::HashMap;

fn most_common(text: &str) -> Option<(String, usize)> {
    todo!()
}

@@solution
use std::collections::HashMap;

fn most_common(text: &str) -> Option<(String, usize)> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word.to_lowercase()).or_insert(0) += 1;
    }
    let mut best: Option<(String, usize)> = None;
    for (word, count) in counts {
        let better = match &best {
            None => true,
            Some((best_word, best_count)) => {
                count > *best_count || (count == *best_count && word < *best_word)
            }
        };
        if better {
            best = Some((word, count));
        }
    }
    best
}

@@tests
/// Finds the most common word, ignoring case
#[test]
fn basic() {
    assert_eq!(most_common("Goal goal GOAL save"), Some(("goal".to_string(), 3)));
}

/// Ties go to the alphabetically first word
#[test]
fn tie() {
    assert_eq!(most_common("pass shot shot pass"), Some(("pass".to_string(), 2)));
}

/// No words gives None
#[test]
fn empty() {
    assert_eq!(most_common("   "), None);
}

@@hint
First count with `*counts.entry(word.to_lowercase()).or_insert(0) += 1;`.

@@hint
Then loop over the counts keeping the best `Option<(String, usize)>`. A word is better if its count is higher, or equal with a smaller word (`word < best_word` compares strings alphabetically).
:::

:::exercise rust-unique-teams Teams in both seasons
Write `in_both(season_a: &[&str], season_b: &[&str]) -> Vec<String>` returning the teams that appear in both lists, sorted alphabetically and without duplicates.

@@starter
use std::collections::HashSet;

fn in_both(season_a: &[&str], season_b: &[&str]) -> Vec<String> {
    todo!()
}

@@solution
use std::collections::HashSet;

fn in_both(season_a: &[&str], season_b: &[&str]) -> Vec<String> {
    let a: HashSet<&str> = season_a.iter().copied().collect();
    let b: HashSet<&str> = season_b.iter().copied().collect();
    let mut both: Vec<String> = a.intersection(&b).map(|t| t.to_string()).collect();
    both.sort();
    both
}

@@tests
/// Finds the common teams, sorted
#[test]
fn common() {
    let a = ["Spurs", "Arsenal", "Leeds"];
    let b = ["Arsenal", "Burnley", "Spurs"];
    assert_eq!(in_both(&a, &b), vec!["Arsenal".to_string(), "Spurs".to_string()]);
}

/// Duplicates appear once
#[test]
fn duplicates() {
    assert_eq!(in_both(&["A", "A"], &["A"]), vec!["A".to_string()]);
}

/// Nothing in common
#[test]
fn none() {
    assert!(in_both(&["A"], &["B"]).is_empty());
}

@@hint
Build two `HashSet<&str>` with `season_a.iter().copied().collect()`, then use `a.intersection(&b)`.

@@hint
`.map(|t| t.to_string()).collect()` turns the intersection into a `Vec<String>`; then `.sort()` it.
:::

:::quiz rust-collections-check Quick check
? After `for x in v { ... }`, can you still use `v`?
- [ ] Yes
- [x] No: the loop consumed it
> Loop over `&v` to borrow instead.

? Why doesn't `Vec<f64>::sort()` compile?
- [ ] Floats can't be stored in a Vec
- [x] NaN means floats have no total order, so you must choose one with sort_by
- [ ] sort only works on strings
> `v.sort_by(|a, b| a.total_cmp(b))` sorts floats.

? What is the Rust way to write Python's `counts[k] = counts.get(k, 0) + 1`?
- [x] `*counts.entry(k).or_insert(0) += 1;`
- [ ] `counts[k] += 1;`
- [ ] `counts.get(k) + 1`
> The entry API finds or creates the slot in one lookup.

? In what order does a HashMap iterate?
- [ ] Insertion order
- [ ] Sorted order
- [x] No guaranteed order
> Use a BTreeMap, or collect and sort, when order matters.
:::

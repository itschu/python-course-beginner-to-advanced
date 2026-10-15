---
title: Strings and text
summary: String versus &str, UTF-8, building and searching text, splitting lines and parsing numbers.
minutes: 45
kind: lesson
language: rust
---

Python has one string type. Rust has two main ones, and once ownership clicks, the reason is simple:

| Type | Owns its text? | Can grow? | Typical use |
| --- | --- | --- | --- |
| `String` | Yes, on the heap | Yes | Text you build or change, struct fields, return values |
| `&str` ("string slice") | No, it borrows | No | Function parameters, string literals, parts of other strings |

A string literal like `"Arsenal"` is a `&str`: it's baked into the program file, and you borrow it.

```rust
fn main() {
    let literal: &str = "Arsenal";              // borrowed, read-only
    let mut owned: String = String::from("Arsenal");
    owned.push_str(" FC");                       // owned, can grow
    owned.push('!');                             // push adds one char

    let also_owned = "Chelsea".to_string();     // &str -> String
    let borrowed: &str = &owned;                 // String -> &str (free, no copy)
    println!("{literal} | {owned} | {also_owned} | {borrowed}");
}
```

**Rule of thumb:** take `&str` as a parameter, and return `String`. A `&str` parameter accepts both literals and borrowed `String`s:

```rust
fn initials(name: &str) -> String {
    let mut out = String::new();
    for word in name.split_whitespace() {
        if let Some(first) = word.chars().next() {
            out.push(first);
        }
    }
    out
}

fn main() {
    let owned = String::from("Manchester United");
    println!("{}", initials("Tottenham Hotspur"));
    println!("{}", initials(&owned));
}
```

(`if let Some(first) = ...` handles "there might be no first character". Lesson 8 explains it properly.)

## Building strings

```rust
fn main() {
    let home = "Arsenal";
    let away = "Chelsea";
    let fixture = format!("{home} v {away}");          // the usual way
    let joined = [home, away].join(" / ");              // like " / ".join([...])
    let repeated = "=".repeat(20);
    let mut line = String::from(home);
    line += " 2-1 ";                                    // += appends a &str
    line += away;
    println!("{fixture}\n{joined}\n{repeated}\n{line}");
}
```

## Common methods

Most Python string methods have a Rust equivalent with a similar name:

```rust
fn main() {
    let raw = "  Arsenal,Chelsea,2,1  ";
    let s = raw.trim();                           // strip()
    println!("{}", s.to_uppercase());             // upper()
    println!("{}", s.starts_with("Ars"));         // startswith()
    println!("{}", s.contains("Chel"));           // "Chel" in s
    println!("{}", s.replace(",", " | "));        // replace()
    println!("{:?}", s.find("Chelsea"));          // find() -> Some(8) or None
    let parts: Vec<&str> = s.split(',').collect(); // split(",")
    println!("{parts:?}");
    for line in "H\nD\nA".lines() {               // splitlines()
        print!("{line} ");
    }
    println!();
}
```

Notice that `split(',')` gives `&str` pieces that **borrow** from `s`: no text is copied. That's part of why Rust text processing is so fast.

## Parsing numbers

`.parse()` converts text to a number. Because parsing can fail ("abc" isn't a number), it returns a `Result`, which lesson 10 covers. For now, `.unwrap()` means "give me the number, and crash with a message if parsing failed":

```rust
fn main() {
    let line = "Arsenal,Chelsea,2,1";
    let fields: Vec<&str> = line.split(',').collect();
    let home_goals: u32 = fields[2].parse().unwrap();
    let away_goals: u32 = fields[3].parse().unwrap();
    println!("{} goals", home_goals + away_goals);

    let odds: f64 = " 2.50 ".trim().parse().unwrap();
    println!("{odds}");
}
```

The type annotation (`: u32`) tells `parse` what to produce. You can also write `fields[2].parse::<u32>()`. The `::<>` syntax is affectionately called the "turbofish".

## UTF-8: why you can't write `s[0]`

Rust strings are always valid UTF-8, where one character can take 1 to 4 bytes. `s.len()` counts **bytes**, not characters, and you can't index a string by position:

```rust
fn main() {
    let team = "Malmö FF";
    println!("bytes: {}", team.len());                 // 9: ö takes 2 bytes
    println!("chars: {}", team.chars().count());       // 8
    let third: char = team.chars().nth(2).unwrap();    // the 3rd character
    println!("{third}");
    println!("{}", &team[0..3]);                       // a byte range: fine on ASCII
    for c in "Gö!".chars() {
        print!("[{c}]");
    }
    println!();
}
```

`team[0]` doesn't compile: Rust won't guess whether you mean a byte or a character. Use `.chars()` for characters and `.bytes()` for raw bytes. (Slicing like `&team[0..5]` would *panic* here, because byte 5 is in the middle of `ö`.)

## char

`char` is a single Unicode character, written with single quotes:

```rust
fn main() {
    let c = 'H';
    println!("{} {} {}", c.is_alphabetic(), c.is_ascii_digit(), c.to_ascii_lowercase());
    let digit = '7';
    println!("{:?}", digit.to_digit(10));          // Some(7)
    println!("{}", c as u32);                      // 72: its code point
}
```

## Practice

:::exercise rust-parse-score Parse a score
Write `parse_score(score: &str) -> (u32, u32)` that turns text like `"2-1"` into `(2, 1)`. The text may have spaces around the numbers, like `" 3 - 0 "`. You can assume the input is valid.

@@starter
fn parse_score(score: &str) -> (u32, u32) {
    todo!()
}

@@solution
fn parse_score(score: &str) -> (u32, u32) {
    let parts: Vec<&str> = score.split('-').collect();
    let home = parts[0].trim().parse().unwrap();
    let away = parts[1].trim().parse().unwrap();
    (home, away)
}

@@tests
/// "2-1" is (2, 1)
#[test]
fn simple() {
    assert_eq!(parse_score("2-1"), (2, 1));
}

/// Spaces are ignored
#[test]
fn spaces() {
    assert_eq!(parse_score(" 3 - 0 "), (3, 0));
}

/// Two-digit scores work
#[test]
fn big() {
    assert_eq!(parse_score("10-11"), (10, 11));
}

@@hint
`score.split('-').collect()` into a `Vec<&str>`, then `.trim().parse().unwrap()` each part.
:::

:::exercise rust-team-code Team code
Write `team_code(name: &str) -> String` that returns the first three letters of a team name in upper case, ignoring spaces: `"Aston Villa"` gives `"AST"` and `"Malmö"` gives `"MAL"`. If the name has fewer than three letters, return all of them.

@@starter
fn team_code(name: &str) -> String {
    todo!()
}

@@solution
fn team_code(name: &str) -> String {
    name.chars()
        .filter(|c| !c.is_whitespace())
        .take(3)
        .collect::<String>()
        .to_uppercase()
}

@@tests
/// Aston Villa is AST
#[test]
fn villa() {
    assert_eq!(team_code("Aston Villa"), "AST");
}

/// Works with accented letters
#[test]
fn accents() {
    assert_eq!(team_code("Malmö"), "MAL");
}

/// Skips spaces at the start
#[test]
fn spaces() {
    assert_eq!(team_code(" Le Havre"), "LEH");
}

/// Short names are kept whole
#[test]
fn short() {
    assert_eq!(team_code("AC"), "AC");
}

@@hint
Loop over `name.chars()`, skip whitespace with `c.is_whitespace()`, and `push` characters into a `String` until it has 3. Then `.to_uppercase()`.

@@hint
Or as a chain: `name.chars().filter(|c| !c.is_whitespace()).take(3).collect::<String>().to_uppercase()`. Closures (`|c| ...`) are covered properly in Phase 10.
:::

:::exercise rust-count-results Count results
`results` is a string of match results like `"HHDAHD"`. Write `count_results(results: &str) -> (u32, u32, u32)` returning the number of home wins, draws and away wins. Ignore any other characters.

@@starter
fn count_results(results: &str) -> (u32, u32, u32) {
    todo!()
}

@@solution
fn count_results(results: &str) -> (u32, u32, u32) {
    let (mut h, mut d, mut a) = (0, 0, 0);
    for c in results.chars() {
        if c == 'H' {
            h += 1;
        } else if c == 'D' {
            d += 1;
        } else if c == 'A' {
            a += 1;
        }
    }
    (h, d, a)
}

@@tests
/// Counts each result
#[test]
fn basic() {
    assert_eq!(count_results("HHDAHD"), (3, 2, 1));
}

/// Ignores other characters
#[test]
fn noise() {
    assert_eq!(count_results("H, D, x, A"), (1, 1, 1));
}

/// Empty text
#[test]
fn empty() {
    assert_eq!(count_results(""), (0, 0, 0));
}

@@hint
`let (mut h, mut d, mut a) = (0, 0, 0);` then loop over `results.chars()` comparing each `c` with `'H'`, `'D'` and `'A'`.
:::

:::quiz rust-strings-check Quick check
? Which type should a function parameter usually have for read-only text?
- [x] `&str`
- [ ] `String`
- [ ] `&String`
> `&str` accepts literals and borrowed Strings, and doesn't take ownership.

? What does `"Malmö".len()` return?
- [ ] 5
- [x] 6
> `len` counts bytes, and `ö` is two bytes in UTF-8. Use `.chars().count()` for characters.

? Why doesn't `s[0]` compile for a string?
- [ ] Strings are immutable
- [x] Characters can be several bytes, so position-based indexing would be ambiguous
- [ ] Indexing starts at 1
> Use `.chars().nth(0)` for the first character or `.as_bytes()[0]` for the first byte.

? What does `.parse()` need to know?
- [x] Which type to produce, from an annotation or the turbofish
- [ ] The number base
- [ ] Nothing
> `let x: u32 = s.parse().unwrap();` or `s.parse::<u32>()`.
:::

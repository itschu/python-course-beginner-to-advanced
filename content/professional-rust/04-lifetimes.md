---
title: Lifetimes
summary: How the compiler proves references are always valid, when you have to write lifetime annotations, and structs that borrow.
minutes: 45
kind: lesson
language: rust
---

Every reference in Rust has a **lifetime**: the stretch of code during which it's valid. Most of the time the compiler works lifetimes out by itself. Occasionally it needs a hint, and that's what the strange-looking `'a` syntax is for.

## The problem lifetimes solve

Which string does this function return a reference to?

```rust expect-error
fn longer(a: &str, b: &str) -> &str {
    if a.len() >= b.len() { a } else { b }
}

fn main() {
    println!("{}", longer("Arsenal", "Chelsea"));
}
```

The compiler can't tell whether the result borrows from `a` or from `b`, so it can't check that callers keep the right one alive. The error message suggests the fix:

```rust
fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

fn main() {
    let home = String::from("Wolverhampton");
    let result;
    {
        let away = String::from("Spurs");
        result = longer(&home, &away);
        println!("{result}");
    }
}
```

`<'a>` declares a lifetime parameter (lifetimes are written with an apostrophe and usually a short name). The signature says: "the result lives at most as long as **both** inputs". Annotations don't change how long anything lives; they describe the relationship so the compiler can check every call.

Now the borrow checker can catch a real bug. Move the `println!` outside the inner block and it refuses to compile, because `result` might point at `away`, which has already been dropped:

```rust expect-error
fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

fn main() {
    let home = String::from("Wolverhampton");
    let result;
    {
        let away = String::from("Spurs");
        result = longer(&home, &away);
    }
    println!("{result}");
}
```

## Lifetime elision: why you rarely write them

You've written dozens of functions returning references without annotations. The compiler applies three **elision rules**:

1. Each reference parameter gets its own lifetime.
2. If there's exactly one input lifetime, the output gets that lifetime.
3. If one of the parameters is `&self` or `&mut self`, the output gets `self`'s lifetime.

So `fn first_word(s: &str) -> &str` needs nothing: there's only one input, so the output must borrow from it. You only annotate when there are several reference inputs and the compiler can't guess, as in `longer`.

## Structs that hold references

A struct can borrow data instead of owning it, if it promises not to outlive that data. This is common in fast parsers: no copying, just views into the original text:

```rust
#[derive(Debug)]
struct MatchLine<'a> {
    home: &'a str,
    away: &'a str,
    score: &'a str,
}

fn parse(line: &str) -> Option<MatchLine<'_>> {
    let mut parts = line.split(',');
    Some(MatchLine { home: parts.next()?, away: parts.next()?, score: parts.next()? })
}

fn main() {
    let csv = String::from("Arsenal,Chelsea,2-1\nSpurs,Leeds,0-0");
    let matches: Vec<MatchLine> = csv.lines().filter_map(parse).collect();
    println!("{matches:?}");
    println!("{} v {}: {}", matches[0].home, matches[0].away, matches[0].score);
    // drop(csv) here would not compile: the matches still borrow from it
}
```

`MatchLine<'a>` reads "a MatchLine that borrows from something that lives for `'a`". `'_` asks the compiler to infer it. Every `&str` in `matches` points into `csv`: parsing copied no text at all.

:::tip Owned or borrowed?
When learning, prefer structs that **own** their data (`String`, `Vec`). They're simpler and you'll rarely need lifetimes. Reach for borrowing structs when profiling shows that copying is slow, or for zero-copy parsers.
:::

## 'static

`'static` means "valid for the whole program". String literals are `&'static str`: they're stored in the program file itself. You'll also see `'static` as a bound, `T: 'static`, meaning "T contains no short-lived references", which is required for data sent to a new thread (lesson 8) or stored in a global on a microcontroller.

```rust
const GREETING: &'static str = "hello";
static LED_PIN: u8 = 25;

fn main() {
    println!("{GREETING} from GP{LED_PIN}");
}
```

## Practice

:::exercise prust-lifetimes-best Best-priced bookmaker
Write `best_price<'a>(quotes: &[(&'a str, f64)]) -> Option<&'a str>` that returns the bookmaker name with the highest odds. The returned name must borrow from the input data, not be copied. On ties, return the first.

@@starter
fn best_price<'a>(quotes: &[(&'a str, f64)]) -> Option<&'a str> {
    todo!()
}

@@solution
fn best_price<'a>(quotes: &[(&'a str, f64)]) -> Option<&'a str> {
    let mut best: Option<(&'a str, f64)> = None;
    for &(name, odds) in quotes {
        match best {
            Some((_, best_odds)) if best_odds >= odds => {}
            _ => best = Some((name, odds)),
        }
    }
    best.map(|(name, _)| name)
}

@@tests
/// Picks the highest odds
#[test]
fn highest() {
    let quotes = [("BookA", 2.10), ("BookB", 2.25), ("BookC", 2.05)];
    assert_eq!(best_price(&quotes), Some("BookB"));
}

/// Ties go to the first
#[test]
fn tie() {
    assert_eq!(best_price(&[("A", 2.0), ("B", 2.0)]), Some("A"));
}

/// Empty gives None
#[test]
fn empty() {
    assert_eq!(best_price(&[]), None);
}

/// The result outlives the slice of quotes, because it borrows the names
#[test]
fn outlives_slice() {
    let name = String::from("Exchange");
    let result = {
        let quotes = vec![(name.as_str(), 3.0)];
        best_price(&quotes)
    };
    assert_eq!(result, Some("Exchange"));
}

@@hint
Keep `let mut best: Option<(&'a str, f64)> = None;`, update it in a loop, and finish with `best.map(|(name, _)| name)`.
:::

:::exercise prust-lifetimes-split Zero-copy key=value parser
Write `parse_config(text: &str) -> Vec<(&str, &str)>` that turns lines like `pin = 25` into `("pin", "25")`, trimming spaces. Skip blank lines, lines starting with `#`, and lines without `=`. The results must borrow from `text` (no `String`s).

@@starter
fn parse_config(text: &str) -> Vec<(&str, &str)> {
    todo!()
}

@@solution
fn parse_config(text: &str) -> Vec<(&str, &str)> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            out.push((key.trim(), value.trim()));
        }
    }
    out
}

@@tests
/// Parses key = value lines
#[test]
fn parses() {
    let text = "pin = 25\nbaud=9600";
    assert_eq!(parse_config(text), vec![("pin", "25"), ("baud", "9600")]);
}

/// Skips comments, blanks and junk
#[test]
fn skips() {
    let text = "# settings\n\nled = on\nnonsense\n  # indented comment";
    assert_eq!(parse_config(text), vec![("led", "on")]);
}

/// Splits on the first = only
#[test]
fn first_equals() {
    assert_eq!(parse_config("expr = a=b"), vec![("expr", "a=b")]);
}

@@hint
`line.split_once('=')` returns `Some((before, after))` or `None`. With one input reference, lifetime elision connects the output to `text` automatically.
:::

:::quiz prust-lifetimes-check Quick check
? Do lifetime annotations change how long values live?
- [ ] Yes, they extend lifetimes
- [x] No, they describe relationships so the compiler can check them
> Annotations are a contract between a function and its callers.

? Why does `fn first(s: &str) -> &str` need no annotation?
- [x] With one input reference, the output must borrow from it (elision)
- [ ] &str is 'static
- [ ] Return values never need lifetimes
> The elision rules cover the common cases.

? What does `T: 'static` require?
- [ ] T is a constant
- [x] T holds no references that could expire, so it can be kept as long as needed
- [ ] T lives on the stack
> Owned types like String and Vec<u8> satisfy 'static; a `&'a str` with a short 'a doesn't.
:::

---
title: Traits
summary: Define shared behaviour with traits, implement standard traits like Display and From, and write functions that accept any type with a given trait.
minutes: 55
kind: lesson
language: rust
---

A **trait** describes behaviour that many types can share: "anything that can be printed", "anything that can predict a probability", "anything that can be turned into an output pin". It's similar to an abstract base class or a `typing.Protocol` in Python, but checked at compile time.

## Defining and implementing a trait

```rust
trait Model {
    fn name(&self) -> String;
    fn predict(&self, features: &[f64]) -> f64;
}

struct AlwaysHome;

struct Linear {
    weights: Vec<f64>,
    bias: f64,
}

impl Model for AlwaysHome {
    fn name(&self) -> String {
        "always home".to_string()
    }
    fn predict(&self, _features: &[f64]) -> f64 {
        0.46
    }
}

impl Model for Linear {
    fn name(&self) -> String {
        format!("linear ({} weights)", self.weights.len())
    }
    fn predict(&self, features: &[f64]) -> f64 {
        let mut z = self.bias;
        for (w, x) in self.weights.iter().zip(features) {
            z += w * x;
        }
        1.0 / (1.0 + (-z).exp())
    }
}

fn main() {
    let baseline = AlwaysHome;
    let model = Linear { weights: vec![0.004, -0.2], bias: 0.1 };
    let features = [120.0, 1.0];
    println!("{}: {:.3}", baseline.name(), baseline.predict(&features));
    println!("{}: {:.3}", model.name(), model.predict(&features));
}
```

`impl Model for Linear` says "Linear implements Model", and the compiler checks that every method in the trait is provided with exactly the right signature. (`_features` starts with an underscore to say "deliberately unused", which silences the warning.)

## Default methods

A trait can provide default implementations that use its other methods. Implementors get them for free, and can override them:

```rust
trait Model {
    fn predict(&self, features: &[f64]) -> f64;

    fn predict_label(&self, features: &[f64]) -> bool {
        self.predict(features) >= 0.5
    }

    fn predict_many(&self, rows: &[Vec<f64>]) -> Vec<f64> {
        let mut out = Vec::new();
        for row in rows {
            out.push(self.predict(row));
        }
        out
    }
}

struct Threshold(f64);

impl Model for Threshold {
    fn predict(&self, features: &[f64]) -> f64 {
        if features[0] > self.0 { 0.8 } else { 0.2 }
    }
}

fn main() {
    let m = Threshold(100.0);
    println!("{}", m.predict_label(&[150.0]));
    println!("{:?}", m.predict_many(&[vec![50.0], vec![150.0]]));
}
```

This mirrors scikit-learn's design, where every classifier provides `predict_proba` and inherits other behaviour from shared base classes.

## Functions that accept any implementor

You can write a function that works with **any** type implementing a trait:

```rust
trait Model {
    fn predict(&self, x: f64) -> f64;
}

struct Constant(f64);
struct Doubler;

impl Model for Constant {
    fn predict(&self, _x: f64) -> f64 {
        self.0
    }
}

impl Model for Doubler {
    fn predict(&self, x: f64) -> f64 {
        2.0 * x
    }
}

// `impl Model` means "some type that implements Model"
fn mean_squared_error(model: &impl Model, xs: &[f64], ys: &[f64]) -> f64 {
    let mut total = 0.0;
    for (x, y) in xs.iter().zip(ys) {
        let err = model.predict(*x) - y;
        total += err * err;
    }
    total / xs.len() as f64
}

fn main() {
    let xs = [1.0, 2.0, 3.0];
    let ys = [2.0, 4.1, 5.9];
    println!("constant: {:.3}", mean_squared_error(&Constant(4.0), &xs, &ys));
    println!("doubler:  {:.3}", mean_squared_error(&Doubler, &xs, &ys));
}
```

Rust generates a separate, fully optimised copy of `mean_squared_error` for each model type it's called with, so using a trait costs nothing at run time. The next lesson explains this in detail.

## Standard library traits

Much of Rust's convenience comes from implementing standard traits on your own types.

**`Display`** controls how `{}` prints a value, like Python's `__str__`:

```rust
use std::fmt;

struct Score {
    home: u8,
    away: u8,
}

impl fmt::Display for Score {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}-{}", self.home, self.away)
    }
}

fn main() {
    let s = Score { home: 2, away: 1 };
    println!("Final score: {s}");
    let text = s.to_string();          // Display gives you to_string() for free
    println!("{}", text.len());
}
```

**`From`** defines a conversion, and gives you `.into()` in the other direction:

```rust
#[derive(Debug)]
struct Celsius(f64);

#[derive(Debug)]
struct Fahrenheit(f64);

impl From<Celsius> for Fahrenheit {
    fn from(c: Celsius) -> Self {
        Fahrenheit(c.0 * 9.0 / 5.0 + 32.0)
    }
}

fn main() {
    let f = Fahrenheit::from(Celsius(100.0));
    println!("{f:?}");
    let g: Fahrenheit = Celsius(-40.0).into();     // into() comes for free
    println!("{g:?} is {} degrees", g.0);
}
```

`From` is also what makes `?` convert errors automatically: if `impl From<ParseFloatError> for MyError` exists, then `?` on a `ParseFloatError` inside a function returning `Result<_, MyError>` converts it for you.

Other traits you'll use constantly:

| Trait | Gives you | Python equivalent |
| --- | --- | --- |
| `Debug` | `{:?}` | `__repr__` |
| `Display` | `{}` and `.to_string()` | `__str__` |
| `Clone`, `Copy` | `.clone()`, implicit copies | `copy` |
| `PartialEq`, `Eq` | `==` | `__eq__` |
| `PartialOrd`, `Ord` | `<`, `>`, sorting | `__lt__` etc. |
| `Hash` | use as a `HashMap` key | `__hash__` |
| `Default` | `T::default()` | default arguments |
| `From` / `Into` | conversions | constructors / `__init__` overloads |
| `Iterator` | `for` loops and adapters | `__iter__` / `__next__` |
| `Add`, `Mul`, ... | `+`, `*`, ... | `__add__`, `__mul__` |

Operator overloading works through these traits:

```rust
use std::ops::Add;

#[derive(Debug, Clone, Copy, PartialEq)]
struct Vec2 {
    x: f64,
    y: f64,
}

impl Add for Vec2 {
    type Output = Vec2;
    fn add(self, other: Vec2) -> Vec2 {
        Vec2 { x: self.x + other.x, y: self.y + other.y }
    }
}

fn main() {
    let a = Vec2 { x: 1.0, y: 2.0 };
    let b = Vec2 { x: 0.5, y: -1.0 };
    println!("{:?}", a + b);
}
```

## The orphan rule

You can implement a trait for a type only if you own the trait or the type (or both). You can implement `Display` for your `Score`, or your `Model` for `f64`, but not `Display` for `Vec<f64>`, because both belong to the standard library. This stops two crates from providing conflicting implementations.

## Practice

:::exercise prust-trait-display Display a match
Implement `Display` for `Match` so that it prints like `Arsenal 2-1 Chelsea`, and implement `From<(&str, &str, u8, u8)>` for `Match` so a tuple can be converted with `.into()`.

@@starter
use std::fmt;

#[derive(Debug, PartialEq)]
struct Match {
    home: String,
    away: String,
    home_goals: u8,
    away_goals: u8,
}

impl fmt::Display for Match {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        todo!()
    }
}

impl From<(&str, &str, u8, u8)> for Match {
    fn from(t: (&str, &str, u8, u8)) -> Self {
        todo!()
    }
}

@@solution
use std::fmt;

#[derive(Debug, PartialEq)]
struct Match {
    home: String,
    away: String,
    home_goals: u8,
    away_goals: u8,
}

impl fmt::Display for Match {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{} {}-{} {}", self.home, self.home_goals, self.away_goals, self.away)
    }
}

impl From<(&str, &str, u8, u8)> for Match {
    fn from(t: (&str, &str, u8, u8)) -> Self {
        Match { home: t.0.to_string(), away: t.1.to_string(), home_goals: t.2, away_goals: t.3 }
    }
}

@@tests
/// Displays as "Home h-a Away"
#[test]
fn display() {
    let m = Match { home: "Arsenal".into(), away: "Chelsea".into(), home_goals: 2, away_goals: 1 };
    assert_eq!(m.to_string(), "Arsenal 2-1 Chelsea");
}

/// Converts from a tuple with into()
#[test]
fn from_tuple() {
    let m: Match = ("Spurs", "Leeds", 0, 0).into();
    assert_eq!(m, Match { home: "Spurs".into(), away: "Leeds".into(), home_goals: 0, away_goals: 0 });
}

@@hint
`write!(f, "{} {}-{} {}", self.home, self.home_goals, self.away_goals, self.away)` is the whole body of `fmt`.
:::

:::exercise prust-trait-shapes A Sensor trait
Define a trait `Sensor` with:

- a required method `read_raw(&self) -> u16`
- a required method `scale(&self) -> f64` (units per raw count)
- a **default** method `read(&self) -> f64` that returns `read_raw() as f64 * scale()`

Implement it for `Thermometer { raw: u16 }` (scale `0.0625`) and `LightSensor { raw: u16 }` (scale `0.5`, and it overrides `read` to cap the result at `1000.0`).

Finally write `total(sensors: &[&dyn Sensor]) -> f64` that adds up `read()` for every sensor. (`&dyn Sensor` means "a reference to any type that implements Sensor"; lesson 6 explains it.)

@@starter
trait Sensor {
    // add the three methods here
}

struct Thermometer {
    raw: u16,
}

struct LightSensor {
    raw: u16,
}

fn total(sensors: &[&dyn Sensor]) -> f64 {
    todo!()
}

@@solution
trait Sensor {
    fn read_raw(&self) -> u16;
    fn scale(&self) -> f64;
    fn read(&self) -> f64 {
        self.read_raw() as f64 * self.scale()
    }
}

struct Thermometer {
    raw: u16,
}

struct LightSensor {
    raw: u16,
}

impl Sensor for Thermometer {
    fn read_raw(&self) -> u16 {
        self.raw
    }
    fn scale(&self) -> f64 {
        0.0625
    }
}

impl Sensor for LightSensor {
    fn read_raw(&self) -> u16 {
        self.raw
    }
    fn scale(&self) -> f64 {
        0.5
    }
    fn read(&self) -> f64 {
        (self.read_raw() as f64 * self.scale()).min(1000.0)
    }
}

fn total(sensors: &[&dyn Sensor]) -> f64 {
    let mut sum = 0.0;
    for s in sensors {
        sum += s.read();
    }
    sum
}

@@tests
/// The thermometer uses the default read
#[test]
fn thermometer() {
    assert_eq!(Thermometer { raw: 344 }.read(), 21.5);
}

/// The light sensor overrides read and caps at 1000
#[test]
fn light() {
    assert_eq!(LightSensor { raw: 600 }.read(), 300.0);
    assert_eq!(LightSensor { raw: 5000 }.read(), 1000.0);
}

/// total adds different sensor types
#[test]
fn totals() {
    let t = Thermometer { raw: 160 };
    let l = LightSensor { raw: 20 };
    assert_eq!(total(&[&t, &l]), 20.0);
}

@@hint
Inside the trait: `fn read_raw(&self) -> u16;` (a semicolon, no body, means "required"), and `fn read(&self) -> f64 { self.read_raw() as f64 * self.scale() }` for the default.

@@hint
Then `impl Sensor for Thermometer { ... }` and `impl Sensor for LightSensor { ... }`. The light sensor also defines its own `read` using `.min(1000.0)`.
:::

:::quiz prust-traits-check Quick check
? What does `impl Display for Score` give you besides `{}` formatting?
- [x] A `to_string()` method
- [ ] A `Debug` implementation
- [ ] Nothing else
> Any type that implements Display automatically gets `to_string()`.

? Which can you NOT write in your own crate?
- [ ] `impl Display for MyType`
- [ ] `impl MyTrait for f64`
- [x] `impl Display for Vec<f64>`
> The orphan rule: you must own the trait or the type.

? In a trait, what does `fn predict(&self) -> f64;` (ending in a semicolon) mean?
- [x] Implementors must provide this method
- [ ] It has an empty default body
- [ ] It's private
> A method with a body is a default; one without is required.

? What does implementing `From<A> for B` give you for free?
- [ ] `B::to_a()`
- [x] `a.into()` producing a B
- [ ] `Display` for B
> `Into` is implemented automatically for every `From`.
:::

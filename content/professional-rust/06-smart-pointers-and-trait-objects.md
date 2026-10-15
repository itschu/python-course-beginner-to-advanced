---
title: Smart pointers and trait objects
summary: Box, Rc and RefCell for data that doesn't fit simple ownership, and dyn Trait for collections of different types.
minutes: 55
kind: lesson
language: rust
---

Plain ownership covers most programs: one owner, borrowed by others for a while. A few designs need more: a value on the heap with an unknown size, data shared by several owners, or a list of different types that share a trait. **Smart pointers** handle these cases.

## Box: a value on the heap

`Box<T>` puts a value on the heap and owns it. When the box is dropped, so is the value. You need it in two situations:

1. **Recursive types**, whose size would otherwise be infinite. A decision tree node contains other nodes:

```rust
#[derive(Debug)]
enum Tree {
    Leaf(f64),                                    // a predicted probability
    Split { feature: usize, threshold: f64, left: Box<Tree>, right: Box<Tree> },
}

impl Tree {
    fn predict(&self, x: &[f64]) -> f64 {
        match self {
            Tree::Leaf(p) => *p,
            Tree::Split { feature, threshold, left, right } => {
                if x[*feature] <= *threshold { left.predict(x) } else { right.predict(x) }
            }
        }
    }
}

fn main() {
    // elo_diff <= 50 ? (home_form <= 1.5 ? 0.35 : 0.45) : 0.62
    let tree = Tree::Split {
        feature: 0,
        threshold: 50.0,
        left: Box::new(Tree::Split {
            feature: 1,
            threshold: 1.5,
            left: Box::new(Tree::Leaf(0.35)),
            right: Box::new(Tree::Leaf(0.45)),
        }),
        right: Box::new(Tree::Leaf(0.62)),
    };
    println!("{}", tree.predict(&[120.0, 1.0]));
    println!("{}", tree.predict(&[10.0, 2.0]));
}
```

Without `Box`, a `Tree` would contain a `Tree` which contains a `Tree`... and the compiler couldn't compute its size. A `Box` is always one pointer wide.

2. **Trait objects**, coming up next.

## Trait objects: dyn Trait

Generics (`impl Model`) produce a separate copy of the code for each type. That's fast, but a `Vec<T>` can only hold **one** type `T`. What if you want a list of different models: a baseline, a logistic regression and a tree?

That's what `dyn Trait` is for. A `Box<dyn Model>` can hold any type that implements `Model`:

```rust
trait Model {
    fn name(&self) -> &str;
    fn predict(&self, elo_diff: f64) -> f64;
}

struct Baseline;
struct Logistic {
    scale: f64,
}

impl Model for Baseline {
    fn name(&self) -> &str {
        "baseline"
    }
    fn predict(&self, _elo_diff: f64) -> f64 {
        0.46
    }
}

impl Model for Logistic {
    fn name(&self) -> &str {
        "logistic"
    }
    fn predict(&self, elo_diff: f64) -> f64 {
        1.0 / (1.0 + (-elo_diff / self.scale).exp())
    }
}

fn main() {
    let models: Vec<Box<dyn Model>> = vec![Box::new(Baseline), Box::new(Logistic { scale: 200.0 })];
    for m in &models {
        println!("{:>8}: {:.3}", m.name(), m.predict(100.0));
    }
}
```

Behind the scenes, a `dyn Model` reference is two pointers: one to the data and one to a **vtable**, a table of the type's method addresses. Each call looks up the method at run time (**dynamic dispatch**), which is how every method call works in Python.

| | Generics `impl Trait` / `<T: Trait>` | Trait objects `dyn Trait` |
| --- | --- | --- |
| Dispatch | static (decided at compile time) | dynamic (vtable lookup) |
| Speed | fastest, can be inlined | a little slower, can't be inlined |
| Mixed types in one collection | no | yes |
| Code size | one copy per type | one copy |

Use generics by default; use `dyn` when you need a mix of types or want to keep binary size down.

## Rc: shared ownership

Sometimes a value genuinely has several owners. `Rc<T>` (reference counted) keeps a count of owners and frees the value when the last one goes away, which is how Python manages *every* object:

```rust
use std::rc::Rc;

#[derive(Debug)]
struct League {
    name: String,
}

#[derive(Debug)]
struct Team {
    name: String,
    league: Rc<League>,
}

fn main() {
    let prem = Rc::new(League { name: "Premier League".to_string() });
    let a = Team { name: "Arsenal".to_string(), league: Rc::clone(&prem) };
    let b = Team { name: "Chelsea".to_string(), league: Rc::clone(&prem) };
    println!("owners: {}", Rc::strong_count(&prem));     // 3: prem, a and b
    println!("{} and {} play in the {}", a.name, b.name, a.league.name);
    drop(a);
    println!("owners: {}", Rc::strong_count(&prem));
    println!("{}", b.league.name);
}
```

`Rc::clone` doesn't copy the league; it just adds 1 to the count. `Rc` only gives shared (read-only) access, and it isn't thread-safe; its thread-safe twin, `Arc`, is in lesson 8.

## RefCell: changing shared data

`Rc` gives read-only access. To change data behind shared pointers, use `RefCell<T>`, which moves the borrow checking from compile time to **run time**: it panics if you break the rules (two mutable borrows at once):

```rust
use std::cell::RefCell;
use std::rc::Rc;

fn main() {
    let log = Rc::new(RefCell::new(Vec::<String>::new()));
    let model_log = Rc::clone(&log);
    let api_log = Rc::clone(&log);

    model_log.borrow_mut().push("model: retrained".to_string());
    api_log.borrow_mut().push("api: 200 OK".to_string());

    println!("{:?}", log.borrow());
}
```

`Rc<RefCell<T>>` is a common pattern for things like GUI state or graphs. But reach for it last: designs where data has a clear single owner are simpler and catch more mistakes at compile time.

:::warning Reference cycles leak
Two `Rc`s pointing at each other never reach a count of zero, so they're never freed. Use `std::rc::Weak` for back-pointers (like a child pointing to its parent).
:::

## Summary

| You need | Use |
| --- | --- |
| A single owner (the normal case) | plain values, `String`, `Vec` |
| A recursive type, or a trait object | `Box<T>`, `Box<dyn Trait>` |
| Several owners, one thread | `Rc<T>` |
| Several owners that can change it, one thread | `Rc<RefCell<T>>` |
| Several owners across threads | `Arc<T>`, `Arc<Mutex<T>>` (lesson 8) |

## Practice

:::exercise prust-dyn-ensemble An ensemble of models
`Model` is a trait with `predict(&self, x: f64) -> f64`. Write a struct `Ensemble` holding a `Vec<Box<dyn Model>>` with:

- `Ensemble::new() -> Ensemble`
- `add(&mut self, model: Box<dyn Model>)`
- `predict(&self, x: f64) -> Option<f64>`: the average of all models' predictions, or `None` if there are no models

@@starter
trait Model {
    fn predict(&self, x: f64) -> f64;
}

struct Constant(f64);

impl Model for Constant {
    fn predict(&self, _x: f64) -> f64 {
        self.0
    }
}

struct Ensemble {
    // add a field
}

impl Ensemble {
    fn new() -> Ensemble {
        todo!()
    }

    fn add(&mut self, model: Box<dyn Model>) {
        todo!()
    }

    fn predict(&self, x: f64) -> Option<f64> {
        todo!()
    }
}

@@solution
trait Model {
    fn predict(&self, x: f64) -> f64;
}

struct Constant(f64);

impl Model for Constant {
    fn predict(&self, _x: f64) -> f64 {
        self.0
    }
}

struct Ensemble {
    models: Vec<Box<dyn Model>>,
}

impl Ensemble {
    fn new() -> Ensemble {
        Ensemble { models: Vec::new() }
    }

    fn add(&mut self, model: Box<dyn Model>) {
        self.models.push(model);
    }

    fn predict(&self, x: f64) -> Option<f64> {
        if self.models.is_empty() {
            return None;
        }
        let total: f64 = self.models.iter().map(|m| m.predict(x)).sum();
        Some(total / self.models.len() as f64)
    }
}

@@tests
struct Linear(f64);

impl Model for Linear {
    fn predict(&self, x: f64) -> f64 {
        self.0 * x
    }
}

/// No models, no prediction
#[test]
fn empty() {
    assert_eq!(Ensemble::new().predict(1.0), None);
}

/// Averages different model types
#[test]
fn averages() {
    let mut e = Ensemble::new();
    e.add(Box::new(Constant(0.25)));
    e.add(Box::new(Linear(0.5)));
    assert_eq!(e.predict(1.5), Some(0.5));
}

@@hint
The field is `models: Vec<Box<dyn Model>>`. In `predict`, `self.models.iter().map(|m| m.predict(x)).sum::<f64>()`.
:::

:::exercise prust-box-expr An expression tree
Evaluate a small arithmetic expression tree. `Expr` is either a number, a variable `x`, or an operation with two boxed sub-expressions. Write `eval(&self, x: f64) -> f64`.

`(x + 2) * 3` at `x = 1` is 9.

@@starter
enum Expr {
    Num(f64),
    X,
    Add(Box<Expr>, Box<Expr>),
    Mul(Box<Expr>, Box<Expr>),
}

impl Expr {
    fn eval(&self, x: f64) -> f64 {
        todo!()
    }
}

@@solution
enum Expr {
    Num(f64),
    X,
    Add(Box<Expr>, Box<Expr>),
    Mul(Box<Expr>, Box<Expr>),
}

impl Expr {
    fn eval(&self, x: f64) -> f64 {
        match self {
            Expr::Num(n) => *n,
            Expr::X => x,
            Expr::Add(a, b) => a.eval(x) + b.eval(x),
            Expr::Mul(a, b) => a.eval(x) * b.eval(x),
        }
    }
}

@@tests
use Expr::*;

/// A number is itself
#[test]
fn number() {
    assert_eq!(Num(4.0).eval(10.0), 4.0);
}

/// (x + 2) * 3
#[test]
fn nested() {
    let e = Mul(Box::new(Add(Box::new(X), Box::new(Num(2.0)))), Box::new(Num(3.0)));
    assert_eq!(e.eval(1.0), 9.0);
    assert_eq!(e.eval(-2.0), 0.0);
}

/// x * x + x
#[test]
fn polynomial() {
    let e = Add(Box::new(Mul(Box::new(X), Box::new(X))), Box::new(X));
    assert_eq!(e.eval(3.0), 12.0);
}

@@hint
`match self { Expr::Num(n) => *n, Expr::X => x, Expr::Add(a, b) => a.eval(x) + b.eval(x), ... }`. A `Box` can call its contents' methods directly.
:::

:::quiz prust-pointers-check Quick check
? Why does a recursive enum like a tree need Box?
- [ ] Recursion is only allowed on the heap
- [x] Otherwise the type would contain itself and have infinite size
- [ ] Box makes it faster
> A Box is a fixed-size pointer, so the enum's size becomes finite.

? You want a Vec holding a Baseline, a Logistic and a Tree, which all implement Model. What type?
- [ ] `Vec<impl Model>`
- [x] `Vec<Box<dyn Model>>`
- [ ] `Vec<Model>`
> Trait objects allow mixing types; generics need a single concrete type.

? What does `Rc::clone(&x)` do?
- [ ] Deep-copies the value
- [x] Adds one to the reference count and returns another pointer to the same value
- [ ] Moves the value
> Shared ownership without copying.

? What happens if a RefCell is mutably borrowed twice at the same time?
- [ ] A compile error
- [x] A panic at run time
- [ ] The second borrow waits
> RefCell checks the borrowing rules at run time instead of compile time.
:::

# Course content

Lessons are Markdown files in `content/<phase-slug>/NN-lesson-slug.md`. The number sets the order;
the slug is the URL. Phase titles, outcomes and resources live in `curriculum.ts`.

Electives (optional mini-courses, listed in `electives` in `curriculum.ts`) work the same way, in
`content/<elective-slug>/`. Each elective has one `language`: every lesson must set it in the frontmatter, and
code blocks in any other language are rejected by both the site and the validator. They're served at
`/electives/<slug>`, and only signed-in learners who choose to take an elective can open its lessons.

The mobile course lives in `content/mobile/`: its phases are listed in `content/mobile/curriculum.ts`, and its
lessons in `content/mobile/<phase-slug>/`. Every course is registered in `content/courses.ts`. Phase slugs must be
unique across courses, because they're the first half of every lesson's progress key. See
[React Native lessons](#react-native-lessons-the-mobile-course) below.

After editing, run `npm run validate` to execute every example and exercise.

## Frontmatter

```yaml
---
title: Variables and types
summary: One sentence shown under the title and in lesson lists.
minutes: 40
kind: lesson        # lesson | project | checkpoint
colab: notebooks/07-02-pytorch-tensors.ipynb   # optional "Open in Colab" button
language: rust      # optional: the language of this lesson's exercises: python (default), rust or tsx
---
```

## Blocks

Ordinary Markdown works, including tables, `$inline$` and `$$display$$` maths.

### Code cells

````markdown
```python
print("Every python block is an editable, runnable cell")
```

```python static
# Shown with highlighting but not runnable (e.g. code that needs a GPU or a terminal)
```

```python expect-error
print(undefined)   # runnable; the validator expects it to raise
```

```python expect-warning
# runnable; the validator allows it to print a warning (all other warnings fail validation)
```
````

Each cell runs in a fresh namespace, so examples must be self-contained. Files in
`public/data/` can be opened as `"data/<name>"`. `input()` is not available in the browser.
Write FastAPI endpoints as `async def` (the browser has no threads).

### Rust cells

````markdown
```rust
fn main() {
    println!("Every rust block is an editable cell that runs on the Rust Playground");
}
```

```rust static
// Highlighted only: code that needs crates from crates.io, or a microcontroller
```
````

`expect-error` and `expect-warning` work as for Python. Runnable Rust needs a `fn main()`, may only use the
standard library, and must compile without warnings (the validator compiles it with the local `rustc`, edition 2024).
A lesson can mix Python and Rust cells.

### The MicroPython simulator

Python cells can `import machine`, `micropython` and `pico_sim`, and use `time.sleep_ms`, `time.ticks_ms` and
`time.ticks_diff`, to run MicroPython-style code on a simulated Raspberry Pi Pico (see `public/micropython-sim.py`).
Time is virtual: `sleep_ms(1000)` returns instantly and advances the simulated clock, firing timers and pin
interrupts on the way. The board is reset before every run. Useful `pico_sim` calls in lessons and tests:

| Call | Does |
| --- | --- |
| `press(pin, at_ms, hold_ms=100, bounce=False)` | schedule a button press (active low) |
| `set_adc(pin, volts_or_fn, noise=0)` | voltage on GP26-28 (a function receives the time in seconds) |
| `set_temperature(c)`, `set_acceleration(x, y, z)` | the TMP102 (I2C 0x48) and MPU-6050 (0x68) |
| `uart_feed(id, text)`, `uart_output(id)` | data arriving on / written to a UART |
| `history(pin)`, `level(pin)`, `waveform(pin, step_ms)` | what a pin did |
| `pwm_duty(pin)`, `now_ms()`, `i2c_device(addr)` | inspect PWM, the clock and simulated devices |

### Exercises

```markdown
:::exercise implied-probability Implied probability
Prompt in Markdown. Explain exactly what to write.

@@starter
def implied_probability(odds):
    pass

@@solution
def implied_probability(odds):
    return 1 / odds

@@tests
def test_even_money():
    """Odds of 2.0 mean a 50% chance"""
    assert implied_probability(2.0) == 0.5

@@hint
Probability is the reciprocal of decimal odds.

@@hint
`1 / odds`
:::
```

Tests are `test_*` functions (sync or async) that run after the learner's code, in the same
namespace. The docstring's first line is shown to the learner. `output` holds everything the
learner's code printed, and `source` holds the learner's code as a string. The validator checks that the solution passes and the starter fails.

#### Rust exercises

In a lesson with `language: rust`, exercises use the same sections, but the starter and solution are Rust, and the
tests are `#[test]` functions. The checker appends the tests to the learner's code inside
`#[cfg(test)] mod tests { use super::*; ... }` and runs `cargo test`. The `///` comment above each test is shown to
the learner. Use `todo!()` in starters so they compile and fail the tests; a starter that doesn't compile also
counts as failing (useful for "fix the compiler error" exercises).

```markdown
:::exercise rust-hello Your first Rust function
Write `greeting(name: &str) -> String`.

@@starter
fn greeting(name: &str) -> String {
    todo!()
}

@@solution
fn greeting(name: &str) -> String {
    format!("Hello, {name}!")
}

@@tests
/// Greets Ada
#[test]
fn greets_ada() {
    assert_eq!(greeting("Ada"), "Hello, Ada!");
}
:::
```

### Quizzes

```markdown
:::quiz basics-check Quick check
? What does `len("hello")` return?
- [ ] 4
- [x] 5
- [ ] "5"
> `len` counts characters, and returns an int.

? Which of these are mutable? (several correct answers make it a "choose all" question)
- [x] list
- [ ] tuple
- [x] dict
> Lists and dicts can change after creation; tuples can't.
:::
```

### Callouts

```markdown
:::tip Optional title
Markdown content.
:::
```

Variants: `note`, `info`, `tip`, `warning`, `colab`.

Display maths must have the `$$` delimiters on their own lines:

```markdown
$$
\text{EV} = p \times (o - 1) - (1 - p)
$$
```

## React Native lessons (the mobile course)

Lessons in `content/mobile/` use `tsx` code: TypeScript with JSX, run by the React Native simulator in
`lib/mobile/rn-runtime.mjs`. Set `language: tsx` in the frontmatter of any lesson with exercises.

### Cells

````markdown
```tsx
import { Text, View } from "react-native";

// A cell with `export default` (or a component called App) runs on the phone preview,
// and gets a Snack button that opens it in Expo Snack.
export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <Text>Hello!</Text>
    </View>
  );
}
```

```tsx
console.log("A cell without a default export just runs, and prints to the output.");
```

```tsx static
// Highlighted only: code that needs a real phone, other packages or several files.
```
````

`expect-error` and `expect-warning` work as for Python. Cells may import `react`, `react-native`, `expo-status-bar` and
`@testing-library/react-native`; anything else must be `static`. Types are stripped, not checked. The validator fails
any cell that prints a warning (like a missing `key`) unless it's marked `expect-warning`.

### Exercises

Exercises use the same sections. The tests are appended to the learner's code and use Jest and React Native Testing
Library, which are already in scope: `test`, `describe`, `expect`, `jest` (`jest.fn`, `jest.spyOn`, fake timers),
`render`, `screen`, `fireEvent`, `waitFor`, `act` and `within`. `source` holds the learner's code as a string. Each
`test`'s name is shown to the learner. Export the components the tests use, and include a default `App` that uses them
so **Run only** shows something on the phone.

```markdown
:::exercise greeting Greet by name
Write a `Greeting` component that shows `Hello, Ada!` for `name="Ada"`.

@@starter
import { Text } from "react-native";

export function Greeting({ name }: { name: string }) {
  return <Text>Hello!</Text>;
}

export default function App() {
  return <Greeting name="Ada" />;
}

@@solution
import { Text } from "react-native";

export function Greeting({ name }: { name: string }) {
  return <Text>Hello, {name}!</Text>;
}

export default function App() {
  return <Greeting name="Ada" />;
}

@@tests
test("Greets by name", () => {
  render(<Greeting name="Grace" />);
  expect(screen.getByText("Hello, Grace!")).toBeOnTheScreen();
});
:::
```

Queries: `getBy`/`getAllBy`/`queryBy`/`queryAllBy`/`findBy`/`findAllBy` + `Text`, `TestId`, `PlaceholderText`,
`DisplayValue`, `LabelText` (accessibilityLabel) and `Role`. Events: `fireEvent.press`, `fireEvent.changeText`,
`fireEvent(element, "valueChange", true)` and so on; presses on disabled elements are ignored. Matchers include Jest's
common ones plus `toBeOnTheScreen`, `toHaveTextContent`, `toHaveDisplayValue`, `toHaveStyle`, `toHaveProp`,
`toBeDisabled`, `toBeEnabled` and `toBeVisible`.

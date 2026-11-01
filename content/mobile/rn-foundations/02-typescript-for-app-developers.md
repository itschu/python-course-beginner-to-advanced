---
title: The TypeScript you need
summary: Variables, types, functions, arrays, objects and the modern syntax every React Native screen uses.
minutes: 55
kind: lesson
language: tsx
---

React Native apps are written in **TypeScript**: JavaScript with types. If you know another language (Python, for example), most ideas carry over. This lesson covers exactly what you need for the rest of the course, with comparisons to Python where they help.

Every cell here is plain TypeScript with no screen, so the output appears as text. Use `console.log` to print.

## Variables: const and let

```tsx
const appName = "Habit Tracker"; // can't be reassigned
let streak = 3; // can change
streak = streak + 1;

console.log(appName, streak);
```

Use `const` by default and `let` only when the value really changes. (Avoid the old `var`.) Statements end with a semicolon. It's optional, but most code uses one.

## Types

TypeScript works out most types itself, from the value. You can also write them explicitly after a colon:

```tsx
const title: string = "Read";
const minutes: number = 20; // one number type for ints and decimals
const done: boolean = false;

let reminder = "08:00"; // TypeScript infers string
console.log(typeof title, typeof minutes, typeof done, typeof reminder);
```

Types are checked by your editor and by the TypeScript compiler, **before** the code runs. If you write `reminder = 8` in a real project, VS Code underlines it in red: "Type 'number' is not assignable to type 'string'". That catches whole classes of bugs before your users find them.

:::note About this site
The simulator here removes the types and runs your code without checking them, like the Expo development server does. In your own project (Phase 2), VS Code checks types as you type, and `npx tsc` checks the whole app.
:::

## Strings

Template literals use backticks and `${...}` to insert values, like Python's f-strings:

```tsx
const habit = "Walk";
const minutes = 30;

console.log(`${habit} for ${minutes} minutes`);
console.log(`That's ${minutes / 60} hours`);
console.log(habit.toUpperCase(), habit.length, habit.includes("al"));
```

## Comparisons and conditions

Always compare with `===` and `!==`. The older `==` converts types in surprising ways (`"1" == 1` is true).

```tsx
const streak = 7;

if (streak >= 30) {
  console.log("Amazing!");
} else if (streak >= 7) {
  console.log("One week strong");
} else {
  console.log("Keep going");
}

// The ternary operator: condition ? valueIfTrue : valueIfFalse
const label = streak === 1 ? "day" : "days";
console.log(`${streak} ${label}`);

// && and || (Python's and / or), ! (not)
console.log(streak > 0 && streak < 10, !true);
```

## Functions

Functions declare the types of their parameters, and optionally of their return value:

```tsx
function minutesToHours(minutes: number): number {
  return minutes / 60;
}

// An arrow function does the same thing. You'll see these everywhere in React.
const double = (n: number) => n * 2;

// Parameters can have default values
function greet(name: string, greeting = "Hello") {
  return `${greeting}, ${name}!`;
}

console.log(minutesToHours(90), double(21));
console.log(greet("Ada"), greet("Ada", "Welcome back"));
```

An arrow function with a single expression returns it automatically. With braces, you need `return`:

```tsx
const square = (n: number) => n * n;
const squareVerbose = (n: number) => {
  const result = n * n;
  return result;
};
console.log(square(4), squareVerbose(4));
```

## Arrays

Arrays are like Python lists. Their type is written `string[]` or `number[]`:

```tsx
const habits: string[] = ["Read", "Walk", "Meditate"];

console.log(habits.length, habits[0], habits.at(-1));
console.log(habits.includes("Walk"), habits.indexOf("Meditate"));
console.log(habits.join(", "));
```

In React you rarely use `for` loops. Instead you **transform** arrays with methods that take a function:

```tsx
const minutes = [20, 45, 10, 30];

const doubled = minutes.map((m) => m * 2); // transform each item
const long = minutes.filter((m) => m >= 30); // keep some items
const firstLong = minutes.find((m) => m >= 30); // the first match, or undefined
const total = minutes.reduce((sum, m) => sum + m, 0); // combine into one value
const anyShort = minutes.some((m) => m < 15);
const allPositive = minutes.every((m) => m > 0);

console.log(doubled, long, firstLong, total, anyShort, allPositive);
```

`map` is how lists of items become lists of components in lesson 8, so get comfortable with it. If you know Python, `minutes.map((m) => m * 2)` is `[m * 2 for m in minutes]`, and `filter` is the `if` part of a comprehension.

`sort` sorts the array **in place** and compares items as strings by default, which gives surprising results for numbers. Pass a compare function, and copy first with `toSorted` (or `[...array].sort(...)`) so you don't change the original:

```tsx
const scores = [10, 9, 100, 1];
console.log([...scores].sort()); // compared as text!
console.log(scores.toSorted((a, b) => a - b)); // numbers, smallest first
console.log(scores); // unchanged
```

## Objects and types for them

Objects group named values, like Python dictionaries. Describe their shape with a `type` (or an `interface`, which is nearly the same):

```tsx
type Habit = {
  id: string;
  title: string;
  done: boolean;
  streak?: number; // optional: may be missing
};

const reading: Habit = { id: "1", title: "Read", done: false, streak: 4 };
const walking: Habit = { id: "2", title: "Walk", done: true };

console.log(reading.title, reading.streak, walking.streak);
```

`walking.streak` is `undefined`: the property is missing. TypeScript knows `streak` might be missing, and makes you deal with it.

## Missing values: ?. and ??

`undefined` means "no value". (There's also `null`, which means the same thing in practice.) Two operators make missing values easy:

```tsx
type User = { name: string; address?: { city: string } };

const ada: User = { name: "Ada", address: { city: "London" } };
const bob: User = { name: "Bob" };

// ?. stops and gives undefined if the left side is missing
console.log(ada.address?.city, bob.address?.city);

// ?? gives a fallback when the left side is null or undefined
console.log(bob.address?.city ?? "Unknown city");

// Careful: || also replaces 0 and "", which are often real values
const streak = 0;
console.log(streak || 5, streak ?? 5);
```

## Union types

A union type says a value can be one of several types or values. Unions of strings are a great way to list the allowed options:

```tsx
type Frequency = "daily" | "weekly";

function timesPerMonth(frequency: Frequency): number {
  return frequency === "daily" ? 30 : 4;
}

console.log(timesPerMonth("daily"), timesPerMonth("weekly"));
// timesPerMonth("hourly") would be a type error in your editor
```

## Destructuring and spread

**Destructuring** pulls values out of objects and arrays. React code uses it constantly:

```tsx
const habit = { title: "Read", minutes: 20, done: false };

const { title, minutes } = habit;
console.log(title, minutes);

const [first, second] = ["Read", "Walk", "Run"];
console.log(first, second);

// In a function's parameters:
function describe({ title, minutes }: { title: string; minutes: number }) {
  return `${title} (${minutes} min)`;
}
console.log(describe(habit));
```

**Spread** (`...`) copies the contents of an array or object into a new one. This is how React code "changes" data without modifying the original:

```tsx
const habit = { title: "Read", done: false };
const finished = { ...habit, done: true }; // copy, then override done

const habits = ["Read", "Walk"];
const more = [...habits, "Meditate"]; // copy, then add

console.log(habit, finished);
console.log(habits, more);
```

Here `habit` and `habits` are unchanged. You'll see why that matters for React in lesson 6.

## Modules: import and export

Each file is a module. `export` makes things available to other files, and `import` uses them:

```tsx static
// habits.ts
export type Habit = { id: string; title: string; done: boolean };
export function countDone(habits: Habit[]) {
  return habits.filter((h) => h.done).length;
}

// App.tsx
import { countDone, type Habit } from "./habits";
import { Text, View } from "react-native";
```

`export default` marks a file's main export, imported without braces: `import App from "./App"`. Named exports (with braces) are usually clearer, except for screens and the app itself.

:::exercise format-duration Format a duration
Write `formatDuration(minutes: number): string` that formats a number of minutes for the habit tracker:

- `90` → `"1h 30m"`
- `45` → `"45m"`
- `120` → `"2h"`
- `0` → `"0m"`

Use `Math.floor` for whole hours and `%` for the remaining minutes.

@@starter
function formatDuration(minutes: number): string {
  return "";
}

console.log(formatDuration(90));

@@solution
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

console.log(formatDuration(90));

@@tests
test("90 minutes is 1h 30m", () => {
  expect(formatDuration(90)).toBe("1h 30m");
});

test("Under an hour shows only minutes", () => {
  expect(formatDuration(45)).toBe("45m");
  expect(formatDuration(0)).toBe("0m");
});

test("Whole hours show only hours", () => {
  expect(formatDuration(120)).toBe("2h");
  expect(formatDuration(60)).toBe("1h");
});

@@hint
`Math.floor(90 / 60)` is `1` and `90 % 60` is `30`.

@@hint
Handle the two special cases first: no hours, then no leftover minutes.
:::

:::exercise count-done Count finished habits
Each habit is an object with a `title` and a `done` flag. Write two functions:

- `countDone(habits)` returns how many habits are done.
- `remainingTitles(habits)` returns the titles of the habits that are **not** done, in their original order.

Use `filter` and `map` instead of loops.

@@starter
type Habit = { id: string; title: string; done: boolean };

function countDone(habits: Habit[]): number {
  return 0;
}

function remainingTitles(habits: Habit[]): string[] {
  return [];
}

@@solution
type Habit = { id: string; title: string; done: boolean };

function countDone(habits: Habit[]): number {
  return habits.filter((h) => h.done).length;
}

function remainingTitles(habits: Habit[]): string[] {
  return habits.filter((h) => !h.done).map((h) => h.title);
}

@@tests
const sample = [
  { id: "1", title: "Read", done: true },
  { id: "2", title: "Walk", done: false },
  { id: "3", title: "Meditate", done: true },
  { id: "4", title: "Stretch", done: false },
];

test("countDone counts the finished habits", () => {
  expect(countDone(sample)).toBe(2);
  expect(countDone([])).toBe(0);
});

test("remainingTitles lists unfinished habits in order", () => {
  expect(remainingTitles(sample)).toEqual(["Walk", "Stretch"]);
});

test("remainingTitles of an empty list is empty", () => {
  expect(remainingTitles([])).toEqual([]);
});

@@hint
`habits.filter((h) => h.done)` keeps only the finished ones. What property of the result tells you how many there are?

@@hint
Chain them: `habits.filter(...).map((h) => h.title)`.
:::

:::exercise toggle-habit Toggle without changing the original
Write `toggleHabit(habits, id)` that returns a **new** array where the habit with that `id` has its `done` flag flipped. Every other habit stays the same, and the original array and objects must not change.

This is exactly how you'll update state in React.

@@starter
type Habit = { id: string; title: string; done: boolean };

function toggleHabit(habits: Habit[], id: string): Habit[] {
  for (const habit of habits) {
    if (habit.id === id) habit.done = !habit.done;
  }
  return habits;
}

@@solution
type Habit = { id: string; title: string; done: boolean };

function toggleHabit(habits: Habit[], id: string): Habit[] {
  return habits.map((h) => (h.id === id ? { ...h, done: !h.done } : h));
}

@@tests
const make = () => [
  { id: "a", title: "Read", done: false },
  { id: "b", title: "Walk", done: true },
];

test("Flips the habit with the matching id", () => {
  const result = toggleHabit(make(), "a");
  expect(result[0].done).toBe(true);
  expect(toggleHabit(make(), "b")[1].done).toBe(false);
});

test("Leaves the other habits alone", () => {
  const result = toggleHabit(make(), "a");
  expect(result[1]).toEqual({ id: "b", title: "Walk", done: true });
  expect(result).toHaveLength(2);
});

test("Doesn't change the original array or objects", () => {
  const original = make();
  const result = toggleHabit(original, "a");
  expect(original[0].done).toBe(false);
  expect(result).not.toBe(original);
  expect(result[0]).not.toBe(original[0]);
});

@@hint
`map` always returns a new array. For each habit, return either the same habit or a changed copy.

@@hint
`h.id === id ? { ...h, done: !h.done } : h`
:::

:::exercise streak-label Missing values
Write `streakLabel(habit)` for habits whose `streak` may be missing:

- `{ title: "Read", streak: 3 }` → `"Read: 3-day streak"`
- `{ title: "Read", streak: 1 }` → `"Read: 1-day streak"`
- `{ title: "Walk", streak: 0 }` → `"Walk: no streak yet"`
- `{ title: "Walk" }` (no streak) → `"Walk: no streak yet"`

@@starter
type Habit = { title: string; streak?: number };

function streakLabel(habit: Habit): string {
  return `${habit.title}: ${habit.streak}-day streak`;
}

@@solution
type Habit = { title: string; streak?: number };

function streakLabel(habit: Habit): string {
  const streak = habit.streak ?? 0;
  return streak > 0 ? `${habit.title}: ${streak}-day streak` : `${habit.title}: no streak yet`;
}

@@tests
test("Shows the streak when there is one", () => {
  expect(streakLabel({ title: "Read", streak: 3 })).toBe("Read: 3-day streak");
  expect(streakLabel({ title: "Read", streak: 1 })).toBe("Read: 1-day streak");
});

test("A streak of 0 is no streak yet", () => {
  expect(streakLabel({ title: "Walk", streak: 0 })).toBe("Walk: no streak yet");
});

test("A missing streak is no streak yet", () => {
  expect(streakLabel({ title: "Walk" })).toBe("Walk: no streak yet");
});

@@hint
`habit.streak ?? 0` turns a missing streak into `0`. Then one condition handles both cases.
:::

:::quiz ts-check Quick check
? What does `[3, 1, 2].map((n) => n * 10)` return?
- [ ] `60`
- [x] `[30, 10, 20]`
- [ ] `[10, 20, 30]`
> `map` transforms each item and keeps the order.

? Which comparison should you use in TypeScript?
- [ ] `a == b`
- [x] `a === b`
- [ ] `a = b`
> `===` compares without converting types. `=` is assignment.

? `const habit = { done: false }; const copy = { ...habit, done: true };` What is `habit.done` afterwards?
- [x] `false`
- [ ] `true`
> Spread makes a new object. The original is unchanged.

? `const count = 0;` What is `count ?? 10`?
- [x] `0`
- [ ] `10`
> `??` only falls back for `null` and `undefined`. `count || 10` would give `10`, because `||` also replaces `0`.

? When does TypeScript check your types?
- [x] Before the code runs, in your editor and with the compiler
- [ ] Only when the app crashes
- [ ] Never: types are just comments
> Types are checked ahead of time, then removed. The phone only runs plain JavaScript.
:::

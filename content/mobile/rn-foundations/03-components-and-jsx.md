---
title: Components and JSX
summary: Build screens from small components, write JSX correctly, put values in it and show things conditionally.
minutes: 45
kind: lesson
language: tsx
---

A React Native screen is a **tree of components**. You build big things, like a screen, out of small things, like a header, a card and a button. This lesson covers how to write components and the JSX inside them.

## Components are functions

A component is a function whose name starts with a capital letter and which returns JSX:

```tsx
import { Text, View } from "react-native";

function Header() {
  return (
    <View style={{ padding: 16, backgroundColor: "#7c3aed" }}>
      <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>My Habits</Text>
    </View>
  );
}

function EmptyState() {
  return <Text style={{ padding: 16, color: "#666" }}>No habits yet. Add your first one!</Text>;
}

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <Header />
      <EmptyState />
    </View>
  );
}
```

React calls `App`, sees `<Header />`, calls `Header`, and so on, until it has a tree made only of core components (`View`, `Text`, ...). Then React Native draws that tree with native views.

Splitting a screen into components keeps each piece small enough to understand, lets you reuse pieces, and lets you test them one at a time.

## The core components

You'll use a handful of React Native components all the time:

| Component | What it is | Closest web equivalent |
| --- | --- | --- |
| `View` | A container for layout | `<div>` |
| `Text` | Text (the only place text can go) | `<p>`, `<span>` |
| `Image` | A picture | `<img>` |
| `ScrollView` | A container that scrolls | a scrolling `<div>` |
| `TextInput` | A text field | `<input>` |
| `Pressable` | Anything tappable | `<button>` |
| `FlatList` | A long, efficient list | none |

There's no `div`, `p` or `button` in React Native, and no CSS files: you'll style with JavaScript objects in lesson 5.

## JSX rules

JSX looks like HTML but it's JavaScript, compiled to function calls. A few rules:

**1. Return one root element.** Two siblings at the top need a parent. If you don't want an extra `View`, use a **fragment**, `<>...</>`, which groups without adding anything to the screen:

```tsx
import { Text } from "react-native";

function Title() {
  return (
    <>
      <Text style={{ fontSize: 24 }}>Today</Text>
      <Text style={{ color: "#666" }}>Monday</Text>
    </>
  );
}

export default function App() {
  return <Title />;
}
```

**2. Close every tag.** Tags with no children close themselves: `<Header />`, `<Image source={...} />`.

**3. Props use camelCase**, and values that aren't plain strings go in braces: `style={{ fontSize: 24 }}`, `numberOfLines={2}`. (The double braces are a JavaScript object `{ fontSize: 24 }` inside the JSX braces `{ }`.)

**4. Put JavaScript in `{ }`.** Inside JSX, braces hold any JavaScript expression: a variable, a calculation, a function call.

```tsx
import { Text, View } from "react-native";

const user = { name: "Ada", habits: 4, done: 3 };

export default function App() {
  const percent = Math.round((user.done / user.habits) * 100);
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Text style={{ fontSize: 22 }}>Hi, {user.name}!</Text>
      <Text>
        You've done {user.done} of {user.habits} habits today.
      </Text>
      <Text>That's {percent}%.</Text>
      <Text>{user.name.toUpperCase()}</Text>
    </View>
  );
}
```

Braces hold *expressions* (things that produce a value), not statements: you can't put an `if` or a `for` inside them. The next sections show what to do instead.

**5. Comments** in JSX look like `{/* this */}`.

## Showing things conditionally

Because `if` doesn't work inside JSX, use one of these patterns.

**`&&`** shows something only when a condition is true:

```tsx
import { Text, View } from "react-native";

const streak = 12;

export default function App() {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Text style={{ fontSize: 20 }}>Streak: {streak} days</Text>
      {streak >= 7 && <Text>🔥 More than a week!</Text>}
      {streak >= 30 && <Text>🏆 A whole month!</Text>}
    </View>
  );
}
```

When the condition is false, `false && <Text/>` is `false`, and React shows nothing for `false`, `null` or `undefined`.

:::warning Careful with numbers and &&
`{count && <Text>...</Text>}` with `count = 0` renders the number `0`, and on a phone a loose `0` outside `<Text>` crashes the app ("Text strings must be rendered within a `<Text>` component"). Write a real condition instead: `{count > 0 && ...}`.
:::

**The ternary** `condition ? a : b` chooses between two things:

```tsx
import { Text, View } from "react-native";

const done = false;

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <Text style={{ fontSize: 20 }}>{done ? "✅ Done for today" : "⏳ Not done yet"}</Text>
    </View>
  );
}
```

**An early return** handles a whole different screen, using an ordinary `if` before the JSX:

```tsx
import { Text, View } from "react-native";

const habits: string[] = [];

export default function App() {
  if (habits.length === 0) {
    return <Text style={{ padding: 24 }}>No habits yet.</Text>;
  }
  return (
    <View style={{ padding: 24 }}>
      <Text>You have {habits.length} habits.</Text>
    </View>
  );
}
```

A component can also return `null` to show nothing at all.

## Components can be reused

The same component can appear many times. In the next lesson you'll give each copy different data with **props**. For now, notice that each `<Divider />` is its own copy:

```tsx
import { Text, View } from "react-native";

function Divider() {
  return <View style={{ height: 1, backgroundColor: "#ddd", marginVertical: 12 }} />;
}

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <Text>Morning</Text>
      <Divider />
      <Text>Afternoon</Text>
      <Divider />
      <Text>Evening</Text>
    </View>
  );
}
```

:::exercise profile-header A profile header
Write a component `ProfileHeader` that shows two pieces of text: the name `Ada Lovelace` and, below it, `Member since 2024`.

Then use it in `App`.

@@starter
import { Text, View } from "react-native";

function ProfileHeader() {
  return null;
}

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      {/* use ProfileHeader here */}
    </View>
  );
}

@@solution
import { Text, View } from "react-native";

function ProfileHeader() {
  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Ada Lovelace</Text>
      <Text style={{ color: "#666" }}>Member since 2024</Text>
    </View>
  );
}

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <ProfileHeader />
    </View>
  );
}

@@tests
test("ProfileHeader shows the name", () => {
  render(<ProfileHeader />);
  expect(screen.getByText("Ada Lovelace")).toBeOnTheScreen();
});

test("ProfileHeader shows the member-since line", () => {
  render(<ProfileHeader />);
  expect(screen.getByText("Member since 2024")).toBeOnTheScreen();
});

test("App uses ProfileHeader", () => {
  render(<App />);
  expect(screen.getByText("Ada Lovelace")).toBeOnTheScreen();
});

@@hint
Two `<Text>` siblings need a parent: wrap them in a `<View>` or a fragment `<>...</>`.

@@hint
In `App`, replace the comment with `<ProfileHeader />`.
:::

:::exercise progress-text Values in JSX
`App` has a `done` count and a `total`. Make it show:

- `3 of 5 done` (using the variables, not typed-in numbers),
- `60%`: the percentage, rounded with `Math.round`.

The tests change the numbers, so the text must come from the variables.

@@starter
import { Text, View } from "react-native";

export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <View style={{ padding: 24 }}>
      <Text>3 of 5 done</Text>
    </View>
  );
}

export default function App() {
  return <Progress done={3} total={5} />;
}

@@solution
import { Text, View } from "react-native";

export function Progress({ done, total }: { done: number; total: number }) {
  const percent = Math.round((done / total) * 100);
  return (
    <View style={{ padding: 24 }}>
      <Text>
        {done} of {total} done
      </Text>
      <Text>{percent}%</Text>
    </View>
  );
}

export default function App() {
  return <Progress done={3} total={5} />;
}

@@tests
test("Shows 3 of 5 done and 60%", () => {
  render(<Progress done={3} total={5} />);
  expect(screen.getByText("3 of 5 done")).toBeOnTheScreen();
  expect(screen.getByText("60%")).toBeOnTheScreen();
});

test("Uses the numbers it's given", () => {
  render(<Progress done={1} total={3} />);
  expect(screen.getByText("1 of 3 done")).toBeOnTheScreen();
  expect(screen.getByText("33%")).toBeOnTheScreen();
});

@@hint
`{done}` inside JSX shows the value of `done`. The props are already pulled out for you: you'll learn how that works in the next lesson.

@@hint
Work out `const percent = Math.round((done / total) * 100);` before the `return`, then show `{percent}%`.
:::

:::exercise streak-badge Show it only sometimes
`StreakBadge` gets a `streak` number. Make it show:

- `🔥 7-day streak` (with the real number) when the streak is **7 or more**,
- `Keep going!` when the streak is between 1 and 6,
- nothing at all (`null`) when the streak is `0`.

@@starter
import { Text, View } from "react-native";

export function StreakBadge({ streak }: { streak: number }) {
  return <Text>🔥 {streak}-day streak</Text>;
}

export default function App() {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <StreakBadge streak={10} />
      <StreakBadge streak={2} />
      <StreakBadge streak={0} />
    </View>
  );
}

@@solution
import { Text, View } from "react-native";

export function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;
  return <Text>{streak >= 7 ? `🔥 ${streak}-day streak` : "Keep going!"}</Text>;
}

export default function App() {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <StreakBadge streak={10} />
      <StreakBadge streak={2} />
      <StreakBadge streak={0} />
    </View>
  );
}

@@tests
test("A streak of 7 or more shows the fire badge", () => {
  render(<StreakBadge streak={7} />);
  expect(screen.getByText("🔥 7-day streak")).toBeOnTheScreen();
  render(<StreakBadge streak={21} />);
  expect(screen.getByText("🔥 21-day streak")).toBeOnTheScreen();
});

test("A short streak shows Keep going!", () => {
  render(<StreakBadge streak={3} />);
  expect(screen.getByText("Keep going!")).toBeOnTheScreen();
  expect(screen.queryByText(/streak/)).toBeNull();
});

test("A streak of 0 shows nothing", () => {
  render(<StreakBadge streak={0} />);
  expect(screen.toJSON()).toBeNull();
});

@@hint
Return `null` early when `streak === 0`.

@@hint
For the other two cases a ternary works: `streak >= 7 ? ... : "Keep going!"`. A template literal builds the badge text.
:::

:::quiz jsx-check Quick check
? Why does this fail? `return <Text>One</Text><Text>Two</Text>;`
- [ ] Text can't be repeated
- [x] A component must return a single root element
- [ ] The strings need quotes
> Wrap the two in a `<View>` or a fragment `<>...</>`.

? What does `{false}` render?
- [x] Nothing
- [ ] The text "false"
- [ ] An error
> React ignores `false`, `null` and `undefined`, which is what makes `condition && <Thing />` work.

? With `count = 0`, what is the problem with `{count && <Text>{count} new</Text>}` inside a View?
- [ ] Nothing, it shows nothing
- [x] It renders a loose `0`, which crashes because text must be inside Text
- [ ] It shows "0 new"
> `0 && ...` is `0`, and React renders numbers. Use `count > 0 && ...`.

? Which of these can go inside JSX braces `{ }`? (choose all that apply)
- [x] `user.name`
- [x] `items.length * 2`
- [ ] `if (done) { ... }`
- [x] `done ? "Yes" : "No"`
> Braces take expressions. `if` is a statement, so use a ternary or `&&`, or decide before the `return`.
:::

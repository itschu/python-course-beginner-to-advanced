---
title: State and events
summary: Make screens interactive with useState and Pressable, update state correctly, and share it between components.
minutes: 60
kind: lesson
language: tsx
---

So far every screen has been static. Apps react to people: a tap marks a habit done, a switch turns on dark mode. In React, data that changes over time is called **state**, and changing it makes React re-render the screen.

## Responding to taps

`Pressable` makes anything tappable. Its `onPress` prop is a function that runs on each tap:

```tsx
import { Pressable, Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Pressable
        onPress={() => console.log("Tapped!")}
        style={{ backgroundColor: "#7c3aed", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}
      >
        <Text style={{ color: "white", fontSize: 18 }}>Tap me</Text>
      </Pressable>
    </View>
  );
}
```

Tap the button on the phone and watch the output. React Native also has a ready-made `<Button title="..." onPress={...} />`, which looks different on iOS and Android and can't be styled much. Most apps build their own buttons from `Pressable`.

## Why a normal variable doesn't work

Here's a counter that doesn't count. Tap the button a few times:

```tsx
import { Button, Text, View } from "react-native";

export default function App() {
  let count = 0;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 48 }}>{count}</Text>
      <Button
        title="Add one"
        onPress={() => {
          count = count + 1;
          console.log("count is now", count);
        }}
      />
    </View>
  );
}
```

The variable changes (the log shows it), but the screen doesn't. Two things are missing: React doesn't know it needs to re-render, and even if it did, `let count = 0` would run again and reset it.

## useState

`useState` solves both. It gives you the current value and a function to change it:

```tsx
import { useState } from "react";
import { Button, Text, View } from "react-native";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 48 }}>{count}</Text>
      <Button title="Add one" onPress={() => setCount(count + 1)} />
      <Button title="Reset" onPress={() => setCount(0)} />
    </View>
  );
}
```

- `useState(0)` creates a piece of state with the starting value `0`. React remembers it between renders.
- It returns a pair, which we destructure: `count` (the current value) and `setCount` (the setter).
- Calling `setCount(...)` stores the new value **and asks React to re-render** the component. React calls `App` again, this time `useState` returns the new value, and the screen updates.

Functions starting with `use` are **hooks**. Hooks have two rules: call them only at the top level of a component (not inside `if`, loops or event handlers), and always in the same order. React tracks state by the order of the hook calls.

A component can have as many pieces of state as it needs, of any type:

```tsx
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

export default function App() {
  const [done, setDone] = useState(false);
  const [reminders, setReminders] = useState(true);
  return (
    <View style={{ padding: 24, gap: 20 }}>
      <Pressable onPress={() => setDone(!done)}>
        <Text style={{ fontSize: 22 }}>{done ? "✅ Read (done)" : "⬜️ Read"}</Text>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 18 }}>Reminders</Text>
        <Switch value={reminders} onValueChange={setReminders} />
      </View>
      <Text style={{ color: "#71717a" }}>Reminders are {reminders ? "on" : "off"}.</Text>
    </View>
  );
}
```

`Switch` calls `onValueChange` with the new value, so you can pass the setter directly.

## State is a snapshot

Inside one render, `count` is a fixed value. Setting state doesn't change the variable you already have: it schedules a re-render with the new value. Read this and predict what one tap does:

```tsx
import { useState } from "react";
import { Button, Text, View } from "react-native";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 48 }}>{count}</Text>
      <Button
        title="Add three?"
        onPress={() => {
          setCount(count + 1);
          setCount(count + 1);
          setCount(count + 1);
          console.log("count in this handler is still", count);
        }}
      />
    </View>
  );
}
```

It adds **one**, not three: all three calls compute `0 + 1`. When the new value depends on the old one, pass an **updater function** instead. React calls it with the latest value:

```tsx static
setCount((c) => c + 1);
setCount((c) => c + 1);
setCount((c) => c + 1); // now it really adds three
```

## Updating objects and arrays

React decides whether to re-render by checking whether you gave it a **new** value. If you change an object or array in place and pass the same one back, React sees the same object and does nothing. Always create a new copy, with the spread syntax from lesson 2:

```tsx
import { useState } from "react";
import { Button, Text, View } from "react-native";

type Habit = { id: string; title: string; done: boolean };

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([
    { id: "1", title: "Read", done: false },
    { id: "2", title: "Walk", done: false },
  ]);

  const addHabit = () => {
    const id = String(habits.length + 1);
    setHabits([...habits, { id, title: `Habit ${id}`, done: false }]); // a new array
  };

  const toggle = (id: string) => {
    setHabits(habits.map((h) => (h.id === id ? { ...h, done: !h.done } : h))); // a new array, a new object
  };

  const remove = (id: string) => {
    setHabits(habits.filter((h) => h.id !== id)); // a new, shorter array
  };

  return (
    <View style={{ padding: 24, gap: 8 }}>
      {habits.map((h) => (
        <View key={h.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 18 }} onPress={() => toggle(h.id)}>
            {h.done ? "✅" : "⬜️"} {h.title}
          </Text>
          <Button title="Delete" color="#dc2626" onPress={() => remove(h.id)} />
        </View>
      ))}
      <Button title="Add habit" onPress={addHabit} />
    </View>
  );
}
```

Tap a habit to toggle it. `useState<Habit[]>` tells TypeScript the type of the state, which helps when the starting value alone isn't enough (an empty array, for example). The `key` prop is explained in lesson 8.

| To... | Write |
| --- | --- |
| add to an array | `[...items, newItem]` |
| remove from an array | `items.filter((x) => x.id !== id)` |
| change one item | `items.map((x) => (x.id === id ? { ...x, done: true } : x))` |
| change an object's field | `{ ...user, name: "Ada" }` |

## Sharing state: lift it up

When two components need the same state, move it up to their closest common parent and pass it down as props. The parent owns the state; children show it and call callbacks to change it:

```tsx
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

function Summary({ done, total }: { done: number; total: number }) {
  return (
    <Text style={{ fontSize: 20, fontWeight: "600" }}>
      {done} of {total} done
    </Text>
  );
}

function HabitToggle({ title, done, onToggle }: { title: string; done: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={{ padding: 12, borderRadius: 10, backgroundColor: done ? "#dcfce7" : "#f4f4f5" }}>
      <Text style={{ fontSize: 18 }}>
        {done ? "✅" : "⬜️"} {title}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const [read, setRead] = useState(false);
  const [walk, setWalk] = useState(false);
  const done = [read, walk].filter(Boolean).length;
  return (
    <View style={{ padding: 24, gap: 10 }}>
      <Summary done={done} total={2} />
      <HabitToggle title="Read" done={read} onToggle={() => setRead(!read)} />
      <HabitToggle title="Walk" done={walk} onToggle={() => setWalk(!walk)} />
    </View>
  );
}
```

Notice `done` isn't state: it's **calculated** from state on every render. Never store something in state that you can work out from other state. It saves code and a whole family of bugs where the two get out of sync.

## Testing interactions

Tests can tap buttons too. `fireEvent.press` finds the nearest pressable parent of an element and calls its `onPress`, and the screen re-renders before the next line:

```tsx static
test("adds one on each tap", () => {
  render(<Counter />);
  fireEvent.press(screen.getByText("Add one"));
  fireEvent.press(screen.getByText("Add one"));
  expect(screen.getByText("2")).toBeOnTheScreen();
});
```

That's how every exercise from here on is checked.

:::exercise counter-buttons A counter with limits
Build a `Counter` with:

- a `<Text testID="count">` showing the current number (starting at `0`),
- a `+` button that adds one,
- a `−` button that subtracts one, but **never goes below 0**.

Use `Pressable`s (or `Button`s) whose text is exactly `+` and `−`.

@@starter
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

export function Counter() {
  const count = 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 24 }}>
      <Pressable style={{ padding: 12 }}>
        <Text style={{ fontSize: 24 }}>−</Text>
      </Pressable>
      <Text testID="count" style={{ fontSize: 32 }}>
        {count}
      </Text>
      <Pressable style={{ padding: 12 }}>
        <Text style={{ fontSize: 24 }}>+</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  return <Counter />;
}

@@solution
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 24 }}>
      <Pressable style={{ padding: 12 }} onPress={() => setCount((c) => Math.max(0, c - 1))}>
        <Text style={{ fontSize: 24 }}>−</Text>
      </Pressable>
      <Text testID="count" style={{ fontSize: 32 }}>
        {count}
      </Text>
      <Pressable style={{ padding: 12 }} onPress={() => setCount((c) => c + 1)}>
        <Text style={{ fontSize: 24 }}>+</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  return <Counter />;
}

@@tests
test("Starts at 0", () => {
  render(<Counter />);
  expect(screen.getByTestId("count")).toHaveTextContent("0");
});

test("+ adds one each time", () => {
  render(<Counter />);
  fireEvent.press(screen.getByText("+"));
  fireEvent.press(screen.getByText("+"));
  fireEvent.press(screen.getByText("+"));
  expect(screen.getByTestId("count")).toHaveTextContent("3");
});

test("− subtracts one", () => {
  render(<Counter />);
  fireEvent.press(screen.getByText("+"));
  fireEvent.press(screen.getByText("+"));
  fireEvent.press(screen.getByText("−"));
  expect(screen.getByTestId("count")).toHaveTextContent("1");
});

test("Never goes below 0", () => {
  render(<Counter />);
  fireEvent.press(screen.getByText("−"));
  fireEvent.press(screen.getByText("−"));
  expect(screen.getByTestId("count")).toHaveTextContent("0");
  fireEvent.press(screen.getByText("+"));
  expect(screen.getByTestId("count")).toHaveTextContent("1");
});

@@hint
Replace `const count = 0` with `const [count, setCount] = useState(0)`, then give each `Pressable` an `onPress`.

@@hint
`Math.max(0, count - 1)` never goes below zero.
:::

:::exercise like-toggle A like button
Build a `LikeButton`. It shows `♡ Like` at first. Each tap toggles between `♥ Liked` and `♡ Like`. It also takes an optional `onChange` prop: call it with the **new** liked value (`true` or `false`) on every tap.

@@starter
import { useState } from "react";
import { Pressable, Text } from "react-native";

type LikeButtonProps = { onChange?: (liked: boolean) => void };

export function LikeButton({ onChange }: LikeButtonProps) {
  return (
    <Pressable style={{ padding: 12 }}>
      <Text style={{ fontSize: 20 }}>♡ Like</Text>
    </Pressable>
  );
}

export default function App() {
  return <LikeButton onChange={(liked) => console.log("liked:", liked)} />;
}

@@solution
import { useState } from "react";
import { Pressable, Text } from "react-native";

type LikeButtonProps = { onChange?: (liked: boolean) => void };

export function LikeButton({ onChange }: LikeButtonProps) {
  const [liked, setLiked] = useState(false);
  const toggle = () => {
    const next = !liked;
    setLiked(next);
    onChange?.(next);
  };
  return (
    <Pressable style={{ padding: 12 }} onPress={toggle}>
      <Text style={{ fontSize: 20 }}>{liked ? "♥ Liked" : "♡ Like"}</Text>
    </Pressable>
  );
}

export default function App() {
  return <LikeButton onChange={(liked) => console.log("liked:", liked)} />;
}

@@tests
test("Starts as ♡ Like", () => {
  render(<LikeButton />);
  expect(screen.getByText("♡ Like")).toBeOnTheScreen();
});

test("A tap shows ♥ Liked, another tap goes back", () => {
  render(<LikeButton />);
  fireEvent.press(screen.getByText("♡ Like"));
  expect(screen.getByText("♥ Liked")).toBeOnTheScreen();
  fireEvent.press(screen.getByText("♥ Liked"));
  expect(screen.getByText("♡ Like")).toBeOnTheScreen();
});

test("Calls onChange with the new value", () => {
  const onChange = jest.fn();
  render(<LikeButton onChange={onChange} />);
  fireEvent.press(screen.getByText("♡ Like"));
  expect(onChange).toHaveBeenLastCalledWith(true);
  fireEvent.press(screen.getByText("♥ Liked"));
  expect(onChange).toHaveBeenLastCalledWith(false);
  expect(onChange).toHaveBeenCalledTimes(2);
});

@@hint
One boolean state: `const [liked, setLiked] = useState(false)`.

@@hint
Work out `const next = !liked` first, then use `next` for both `setLiked` and `onChange?.(next)`. (`?.()` only calls the function if it was passed.)
:::

:::exercise add-three Fix the +3 button
Pressing `+3` should add three, but it only adds one. Fix it **without** changing it to `setCount(count + 3)`: keep the three separate updates (imagine each one is a different bonus).

@@starter
import { useState } from "react";
import { Button, Text, View } from "react-native";

export function Bonus() {
  const [count, setCount] = useState(0);
  const addBonuses = () => {
    setCount(count + 1); // daily bonus
    setCount(count + 1); // streak bonus
    setCount(count + 1); // weekend bonus
  };
  return (
    <View style={{ padding: 24 }}>
      <Text>Points: {count}</Text>
      <Button title="+3" onPress={addBonuses} />
    </View>
  );
}

export default function App() {
  return <Bonus />;
}

@@solution
import { useState } from "react";
import { Button, Text, View } from "react-native";

export function Bonus() {
  const [count, setCount] = useState(0);
  const addBonuses = () => {
    setCount((c) => c + 1); // daily bonus
    setCount((c) => c + 1); // streak bonus
    setCount((c) => c + 1); // weekend bonus
  };
  return (
    <View style={{ padding: 24 }}>
      <Text>Points: {count}</Text>
      <Button title="+3" onPress={addBonuses} />
    </View>
  );
}

export default function App() {
  return <Bonus />;
}

@@tests
test("One tap adds 3 points", () => {
  render(<Bonus />);
  fireEvent.press(screen.getByText("+3"));
  expect(screen.getByText("Points: 3")).toBeOnTheScreen();
});

test("Two taps add 6 points", () => {
  render(<Bonus />);
  fireEvent.press(screen.getByText("+3"));
  fireEvent.press(screen.getByText("+3"));
  expect(screen.getByText("Points: 6")).toBeOnTheScreen();
});

test("Keeps three separate updates", () => {
  expect(source.match(/setCount\(/g)?.length).toBe(3);
});

@@hint
All three calls see the same `count` from this render. An updater function receives the latest value instead.
:::

:::exercise mark-done Update arrays the React way
Tapping a habit should mark it done, but nothing happens on screen. The code changes the array in place and gives React the same array back. Fix `markDone` so it gives React a **new** array with a **new** object for the changed habit.

Each habit shows `⬜️ Title` or `✅ Title`.

@@starter
import { useState } from "react";
import { Text, View } from "react-native";

type Habit = { id: string; title: string; done: boolean };

const START: Habit[] = [
  { id: "1", title: "Read", done: false },
  { id: "2", title: "Walk", done: false },
];

export function Habits() {
  const [habits, setHabits] = useState<Habit[]>(START);

  const markDone = (id: string) => {
    const habit = habits.find((h) => h.id === id);
    if (habit) habit.done = true;
    setHabits(habits);
  };

  return (
    <View style={{ padding: 24, gap: 8 }}>
      {habits.map((h) => (
        <Text key={h.id} style={{ fontSize: 20 }} onPress={() => markDone(h.id)}>
          {h.done ? "✅" : "⬜️"} {h.title}
        </Text>
      ))}
    </View>
  );
}

export default function App() {
  return <Habits />;
}

@@solution
import { useState } from "react";
import { Text, View } from "react-native";

type Habit = { id: string; title: string; done: boolean };

const START: Habit[] = [
  { id: "1", title: "Read", done: false },
  { id: "2", title: "Walk", done: false },
];

export function Habits() {
  const [habits, setHabits] = useState<Habit[]>(START);

  const markDone = (id: string) => {
    setHabits(habits.map((h) => (h.id === id ? { ...h, done: true } : h)));
  };

  return (
    <View style={{ padding: 24, gap: 8 }}>
      {habits.map((h) => (
        <Text key={h.id} style={{ fontSize: 20 }} onPress={() => markDone(h.id)}>
          {h.done ? "✅" : "⬜️"} {h.title}
        </Text>
      ))}
    </View>
  );
}

export default function App() {
  return <Habits />;
}

@@tests
test("Tapping a habit marks it done", () => {
  render(<Habits />);
  fireEvent.press(screen.getByText("⬜️ Read"));
  expect(screen.getByText("✅ Read")).toBeOnTheScreen();
});

test("Other habits are unchanged", () => {
  render(<Habits />);
  fireEvent.press(screen.getByText("⬜️ Walk"));
  expect(screen.getByText("⬜️ Read")).toBeOnTheScreen();
  expect(screen.getByText("✅ Walk")).toBeOnTheScreen();
});

test("The starting data isn't modified", () => {
  render(<Habits />);
  fireEvent.press(screen.getByText("⬜️ Read"));
  expect(START[0].done).toBe(false);
});

@@hint
`map` returns a new array. Inside it, return `{ ...h, done: true }` for the habit with the matching id and `h` for the rest.
:::

:::quiz state-check Quick check
? What does calling a state setter like `setCount(5)` do?
- [ ] Changes the `count` variable immediately
- [x] Stores the new value and asks React to re-render the component
- [ ] Nothing until the app restarts
> The current render keeps its snapshot. The next render sees 5.

? Where can you call `useState`?
- [x] At the top level of a component, in the same order every render
- [ ] Inside an `if`, when you need it
- [ ] Inside an `onPress` handler
> Hooks are matched up by call order, so they can't be conditional.

? Why doesn't this re-render? `items.push(newItem); setItems(items);`
- [ ] `push` is not allowed in TypeScript
- [x] It's the same array, so React sees no change
- [ ] `setItems` needs an updater function
> Create a new array: `setItems([...items, newItem])`.

? You store `habits` in state. Should you also store `doneCount` in state?
- [ ] Yes, so it's fast
- [x] No: calculate it from `habits` when you render
> Derived values belong in a plain variable. Storing them twice lets them drift apart.
:::

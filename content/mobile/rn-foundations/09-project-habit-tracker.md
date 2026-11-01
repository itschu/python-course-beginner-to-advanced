---
title: "Project: a habit tracker"
summary: Plan and build a complete habit tracker app from small tested pieces, then run it on your own phone.
minutes: 120
kind: project
language: tsx
---

Time to put the whole phase together. You'll build a habit tracker: add habits, tick them off each day, watch your streaks grow, and delete habits you've dropped. It's the app you'll keep improving in later phases, with navigation, storage, notifications and animation.

Here's the finished app. Try it: add a habit, tick it, delete one.

```tsx
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Habit = { id: string; title: string; doneToday: boolean; streak: number };

let nextId = 4;

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([
    { id: "1", title: "Read 20 minutes", doneToday: true, streak: 5 },
    { id: "2", title: "Walk", doneToday: false, streak: 2 },
    { id: "3", title: "Drink water", doneToday: false, streak: 0 },
  ]);
  const [title, setTitle] = useState("");
  const done = habits.filter((h) => h.doneToday).length;

  const add = () => {
    const t = title.trim();
    if (!t) return;
    setHabits([...habits, { id: String(nextId++), title: t, doneToday: false, streak: 0 }]);
    setTitle("");
  };
  const toggle = (id: string) =>
    setHabits(
      habits.map((h) =>
        h.id === id ? { ...h, doneToday: !h.doneToday, streak: Math.max(0, h.streak + (h.doneToday ? -1 : 1)) } : h,
      ),
    );
  const remove = (id: string) => setHabits(habits.filter((h) => h.id !== id));

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.subtitle}>
        {habits.length === 0 ? "Add your first habit" : done === habits.length ? "All done! 🎉" : `${done} of ${habits.length} done today`}
      </Text>
      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="New habit" value={title} onChangeText={setTitle} onSubmitEditing={add} />
        <Pressable style={[styles.add, !title.trim() && { opacity: 0.4 }]} onPress={add} disabled={!title.trim()}>
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>
      <FlatList
        data={habits}
        keyExtractor={(h) => h.id}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable onPress={() => toggle(item.id)} style={[styles.check, item.doneToday && styles.checked]}>
              <Text style={styles.checkMark}>{item.doneToday ? "✓" : ""}</Text>
            </Pressable>
            <Text style={[styles.habit, item.doneToday && styles.habitDone]}>{item.title}</Text>
            <Text style={styles.streak}>🔥 {item.streak}</Text>
            <Text style={styles.delete} onPress={() => remove(item.id)}>
              ✕
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No habits yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, backgroundColor: "#faf5ff" },
  title: { fontSize: 32, fontWeight: "800", color: "#3b0764" },
  subtitle: { fontSize: 16, color: "#6b21a8", marginBottom: 16 },
  form: { flexDirection: "row", gap: 8, marginBottom: 16 },
  input: { flex: 1, backgroundColor: "white", borderRadius: 12, padding: 12, fontSize: 16, borderWidth: 1, borderColor: "#e9d5ff" },
  add: { backgroundColor: "#7c3aed", borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  addText: { color: "white", fontWeight: "700", fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "white", padding: 14, borderRadius: 14 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#a78bfa", alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#7c3aed", borderColor: "#7c3aed" },
  checkMark: { color: "white", fontWeight: "800" },
  habit: { flex: 1, fontSize: 17 },
  habitDone: { color: "#a1a1aa", textDecorationLine: "line-through" },
  streak: { fontWeight: "700", color: "#ea580c" },
  delete: { color: "#a1a1aa", fontSize: 18, paddingHorizontal: 4 },
  empty: { color: "#71717a", textAlign: "center", marginTop: 24 },
});
```

That's about 80 lines in one component, which works, but is hard to test and to change. Professional apps split this up. You'll build it again in four tested steps:

1. **The logic**: plain functions that update the list of habits, with no screen at all.
2. **A habit row**: one component for one habit.
3. **The header**: the progress summary.
4. **The app**: everything wired together with state.

## Step 1: the logic

Start with the data. Each habit has an id, a title, whether it's done today, and a streak (how many days in a row). Updating data is easiest to get right, and to test, as **pure functions**: they take the current habits and return new ones, without changing anything.

:::exercise habit-logic Habit logic
Write three pure functions. None of them may change the array or objects they're given.

- `addHabit(habits, title, id)` returns the habits with a new one at the **end**: `{ id, title, doneToday: false, streak: 0 }`, with the title trimmed. If the trimmed title is empty, return `habits` unchanged.
- `toggleHabit(habits, id)` flips that habit's `doneToday`. Marking it done adds 1 to its streak; un-marking takes 1 off, never going below 0.
- `removeHabit(habits, id)` returns the habits without that one.

@@starter
type Habit = { id: string; title: string; doneToday: boolean; streak: number };

function addHabit(habits: Habit[], title: string, id: string): Habit[] {
  return habits;
}

function toggleHabit(habits: Habit[], id: string): Habit[] {
  return habits;
}

function removeHabit(habits: Habit[], id: string): Habit[] {
  return habits;
}

@@solution
type Habit = { id: string; title: string; doneToday: boolean; streak: number };

function addHabit(habits: Habit[], title: string, id: string): Habit[] {
  const trimmed = title.trim();
  if (!trimmed) return habits;
  return [...habits, { id, title: trimmed, doneToday: false, streak: 0 }];
}

function toggleHabit(habits: Habit[], id: string): Habit[] {
  return habits.map((h) => {
    if (h.id !== id) return h;
    const doneToday = !h.doneToday;
    return { ...h, doneToday, streak: Math.max(0, h.streak + (doneToday ? 1 : -1)) };
  });
}

function removeHabit(habits: Habit[], id: string): Habit[] {
  return habits.filter((h) => h.id !== id);
}

@@tests
const start = () => [
  { id: "1", title: "Read", doneToday: false, streak: 3 },
  { id: "2", title: "Walk", doneToday: true, streak: 1 },
];

test("addHabit adds a new habit at the end", () => {
  const result = addHabit(start(), "Meditate", "3");
  expect(result).toHaveLength(3);
  expect(result[2]).toEqual({ id: "3", title: "Meditate", doneToday: false, streak: 0 });
});

test("addHabit trims the title and ignores empty ones", () => {
  expect(addHabit([], "  Stretch ", "9")[0].title).toBe("Stretch");
  const habits = start();
  expect(addHabit(habits, "   ", "9")).toBe(habits);
});

test("toggleHabit marks a habit done and adds to its streak", () => {
  const result = toggleHabit(start(), "1");
  expect(result[0]).toEqual({ id: "1", title: "Read", doneToday: true, streak: 4 });
});

test("toggleHabit un-marks a habit and takes one off its streak", () => {
  const result = toggleHabit(start(), "2");
  expect(result[1]).toEqual({ id: "2", title: "Walk", doneToday: false, streak: 0 });
});

test("A streak never goes below 0", () => {
  const habits = [{ id: "1", title: "Read", doneToday: true, streak: 0 }];
  expect(toggleHabit(habits, "1")[0].streak).toBe(0);
});

test("removeHabit removes only that habit", () => {
  expect(removeHabit(start(), "1")).toEqual([{ id: "2", title: "Walk", doneToday: true, streak: 1 }]);
});

test("Nothing changes the original habits", () => {
  const habits = start();
  addHabit(habits, "New", "3");
  toggleHabit(habits, "1");
  removeHabit(habits, "2");
  expect(habits).toEqual(start());
  expect(toggleHabit(habits, "1")).not.toBe(habits);
});

@@hint
These are the patterns from lessons 2 and 6: spread to add, `map` to change one item, `filter` to remove.

@@hint
In `toggleHabit`, work out the new `doneToday` first, then add `1` or `-1` to the streak, and wrap it in `Math.max(0, ...)`.
:::

## Step 2: a habit row

Next, the component for one habit. It doesn't own any state: it gets the habit and two callbacks as props, and tells its parent when something is tapped. Components like this are easy to reuse and to test.

The check button needs an **accessibility label**, because it has no text. Screen readers (VoiceOver on iOS, TalkBack on Android) read the label aloud, and tests can find the button by it. You'll learn much more about accessibility in Phase 6.

:::exercise habit-row A habit row
Build `HabitRow` with props `habit`, `onToggle` and `onDelete`. It shows:

- a `Pressable` check button with `accessibilityLabel` `Mark Read done` (or `Mark Read not done` when it's already done, using the real title). It shows `✓` when done and nothing otherwise, and calls `onToggle` when pressed,
- the habit's title,
- the streak as `🔥 3`,
- a `Pressable` with `accessibilityLabel` `Delete Read` that calls `onDelete`.

@@starter
import { Pressable, Text, View } from "react-native";

type Habit = { id: string; title: string; doneToday: boolean; streak: number };

type HabitRowProps = {
  habit: Habit;
  onToggle: () => void;
  onDelete: () => void;
};

export function HabitRow({ habit, onToggle, onDelete }: HabitRowProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
      <Text style={{ flex: 1 }}>{habit.title}</Text>
    </View>
  );
}

export default function App() {
  return (
    <HabitRow
      habit={{ id: "1", title: "Read", doneToday: false, streak: 3 }}
      onToggle={() => console.log("toggle")}
      onDelete={() => console.log("delete")}
    />
  );
}

@@solution
import { Pressable, Text, View } from "react-native";

type Habit = { id: string; title: string; doneToday: boolean; streak: number };

type HabitRowProps = {
  habit: Habit;
  onToggle: () => void;
  onDelete: () => void;
};

export function HabitRow({ habit, onToggle, onDelete }: HabitRowProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityLabel={habit.doneToday ? `Mark ${habit.title} not done` : `Mark ${habit.title} done`}
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: "#7c3aed",
          backgroundColor: habit.doneToday ? "#7c3aed" : "white",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "800" }}>{habit.doneToday ? "✓" : ""}</Text>
      </Pressable>
      <Text style={{ flex: 1, fontSize: 17 }}>{habit.title}</Text>
      <Text>🔥 {habit.streak}</Text>
      <Pressable onPress={onDelete} accessibilityLabel={`Delete ${habit.title}`} style={{ padding: 4 }}>
        <Text style={{ color: "#a1a1aa" }}>✕</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  return (
    <HabitRow
      habit={{ id: "1", title: "Read", doneToday: false, streak: 3 }}
      onToggle={() => console.log("toggle")}
      onDelete={() => console.log("delete")}
    />
  );
}

@@tests
const read = { id: "1", title: "Read", doneToday: false, streak: 3 };

test("Shows the title and streak", () => {
  render(<HabitRow habit={read} onToggle={() => {}} onDelete={() => {}} />);
  expect(screen.getByText("Read")).toBeOnTheScreen();
  expect(screen.getByText("🔥 3")).toBeOnTheScreen();
});

test("The check button calls onToggle", () => {
  const onToggle = jest.fn();
  render(<HabitRow habit={read} onToggle={onToggle} onDelete={() => {}} />);
  fireEvent.press(screen.getByLabelText("Mark Read done"));
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test("A done habit shows a tick and a different label", () => {
  render(<HabitRow habit={{ ...read, doneToday: true }} onToggle={() => {}} onDelete={() => {}} />);
  expect(screen.getByLabelText("Mark Read not done")).toBeOnTheScreen();
  expect(screen.getByText("✓")).toBeOnTheScreen();
});

test("A habit that isn't done shows no tick", () => {
  render(<HabitRow habit={read} onToggle={() => {}} onDelete={() => {}} />);
  expect(screen.queryByText("✓")).toBeNull();
});

test("The delete button calls onDelete", () => {
  const onDelete = jest.fn();
  const onToggle = jest.fn();
  render(<HabitRow habit={{ ...read, title: "Walk" }} onToggle={onToggle} onDelete={onDelete} />);
  fireEvent.press(screen.getByLabelText("Delete Walk"));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(onToggle).not.toHaveBeenCalled();
});

@@hint
The labels are template literals: `` `Mark ${habit.title} done` ``. A ternary chooses between the two.

@@hint
`screen.getByLabelText(...)` finds an element by its `accessibilityLabel`, then `fireEvent.press` taps it.
:::

## Step 3: the header

The header summarises the day. Notice there are three different situations to handle. Thinking through every state a screen can be in (empty, partly done, finished, loading, failed...) is one of the habits that separates good apps from frustrating ones.

:::exercise progress-header The progress header
Build `ProgressHeader`, which gets the `habits` array and shows one `<Text>`:

- `Add your first habit` when there are no habits,
- `All done! 🎉` when every habit is done today,
- otherwise `2 of 3 done today` (with the real numbers).

@@starter
import { Text } from "react-native";

type Habit = { id: string; title: string; doneToday: boolean; streak: number };

export function ProgressHeader({ habits }: { habits: Habit[] }) {
  return <Text>0 of 0 done today</Text>;
}

export default function App() {
  return (
    <ProgressHeader
      habits={[
        { id: "1", title: "Read", doneToday: true, streak: 1 },
        { id: "2", title: "Walk", doneToday: false, streak: 0 },
      ]}
    />
  );
}

@@solution
import { Text } from "react-native";

type Habit = { id: string; title: string; doneToday: boolean; streak: number };

export function ProgressHeader({ habits }: { habits: Habit[] }) {
  const done = habits.filter((h) => h.doneToday).length;
  let message = `${done} of ${habits.length} done today`;
  if (habits.length === 0) message = "Add your first habit";
  else if (done === habits.length) message = "All done! 🎉";
  return <Text style={{ fontSize: 16, color: "#6b21a8" }}>{message}</Text>;
}

export default function App() {
  return (
    <ProgressHeader
      habits={[
        { id: "1", title: "Read", doneToday: true, streak: 1 },
        { id: "2", title: "Walk", doneToday: false, streak: 0 },
      ]}
    />
  );
}

@@tests
const h = (id: string, doneToday: boolean) => ({ id, title: id, doneToday, streak: 0 });

test("No habits asks you to add one", () => {
  render(<ProgressHeader habits={[]} />);
  expect(screen.getByText("Add your first habit")).toBeOnTheScreen();
});

test("Shows how many are done", () => {
  render(<ProgressHeader habits={[h("a", true), h("b", false), h("c", true)]} />);
  expect(screen.getByText("2 of 3 done today")).toBeOnTheScreen();
});

test("None done yet", () => {
  render(<ProgressHeader habits={[h("a", false)]} />);
  expect(screen.getByText("0 of 1 done today")).toBeOnTheScreen();
});

test("Celebrates when everything is done", () => {
  render(<ProgressHeader habits={[h("a", true), h("b", true)]} />);
  expect(screen.getByText("All done! 🎉")).toBeOnTheScreen();
});

@@hint
Count the finished habits with `filter(...).length`, then check the special cases: no habits first, then all done.
:::

## Step 4: put it together

Now the app itself. It owns the state (the habits and the text being typed), and passes data and callbacks down to the pieces. The pieces you built in steps 1–3 are already in the starter, so you only need to write `App`.

:::exercise habit-tracker-app The habit tracker
Write `App` using the given pieces. It should:

- start with **no habits**, so the header says `Add your first habit` and the list shows `No habits yet`,
- have a `TextInput` (placeholder `New habit`) and an `Add` button that adds the trimmed habit with `addHabit` and clears the input (the button does nothing for an empty title),
- show each habit with `HabitRow`, in a `FlatList`,
- toggle and delete habits with `toggleHabit` and `removeHabit`,
- show `ProgressHeader` above the form.

Each habit needs a unique id: the starter has a `nextId` counter you can use with `String(nextId++)`.

@@starter
import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

type Habit = { id: string; title: string; doneToday: boolean; streak: number };

// ---- Step 1: logic
function addHabit(habits: Habit[], title: string, id: string): Habit[] {
  const trimmed = title.trim();
  return trimmed ? [...habits, { id, title: trimmed, doneToday: false, streak: 0 }] : habits;
}
function toggleHabit(habits: Habit[], id: string): Habit[] {
  return habits.map((h) =>
    h.id === id ? { ...h, doneToday: !h.doneToday, streak: Math.max(0, h.streak + (h.doneToday ? -1 : 1)) } : h,
  );
}
function removeHabit(habits: Habit[], id: string): Habit[] {
  return habits.filter((h) => h.id !== id);
}

// ---- Step 2: one row
function HabitRow({ habit, onToggle, onDelete }: { habit: Habit; onToggle: () => void; onDelete: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: "white", borderRadius: 12 }}>
      <Pressable
        onPress={onToggle}
        accessibilityLabel={habit.doneToday ? `Mark ${habit.title} not done` : `Mark ${habit.title} done`}
        style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#7c3aed", backgroundColor: habit.doneToday ? "#7c3aed" : "white", alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: "white" }}>{habit.doneToday ? "✓" : ""}</Text>
      </Pressable>
      <Text style={{ flex: 1, fontSize: 17 }}>{habit.title}</Text>
      <Text>🔥 {habit.streak}</Text>
      <Pressable onPress={onDelete} accessibilityLabel={`Delete ${habit.title}`}>
        <Text style={{ color: "#a1a1aa" }}>✕</Text>
      </Pressable>
    </View>
  );
}

// ---- Step 3: the header
function ProgressHeader({ habits }: { habits: Habit[] }) {
  const done = habits.filter((h) => h.doneToday).length;
  const message =
    habits.length === 0 ? "Add your first habit" : done === habits.length ? "All done! 🎉" : `${done} of ${habits.length} done today`;
  return <Text style={{ fontSize: 16, color: "#6b21a8", marginBottom: 12 }}>{message}</Text>;
}

// ---- Step 4: the app
let nextId = 1;

export default function App() {
  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: "#faf5ff" }}>
      <Text style={{ fontSize: 30, fontWeight: "800" }}>Today</Text>
    </View>
  );
}

@@solution
import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

type Habit = { id: string; title: string; doneToday: boolean; streak: number };

// ---- Step 1: logic
function addHabit(habits: Habit[], title: string, id: string): Habit[] {
  const trimmed = title.trim();
  return trimmed ? [...habits, { id, title: trimmed, doneToday: false, streak: 0 }] : habits;
}
function toggleHabit(habits: Habit[], id: string): Habit[] {
  return habits.map((h) =>
    h.id === id ? { ...h, doneToday: !h.doneToday, streak: Math.max(0, h.streak + (h.doneToday ? -1 : 1)) } : h,
  );
}
function removeHabit(habits: Habit[], id: string): Habit[] {
  return habits.filter((h) => h.id !== id);
}

// ---- Step 2: one row
function HabitRow({ habit, onToggle, onDelete }: { habit: Habit; onToggle: () => void; onDelete: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: "white", borderRadius: 12 }}>
      <Pressable
        onPress={onToggle}
        accessibilityLabel={habit.doneToday ? `Mark ${habit.title} not done` : `Mark ${habit.title} done`}
        style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#7c3aed", backgroundColor: habit.doneToday ? "#7c3aed" : "white", alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: "white" }}>{habit.doneToday ? "✓" : ""}</Text>
      </Pressable>
      <Text style={{ flex: 1, fontSize: 17 }}>{habit.title}</Text>
      <Text>🔥 {habit.streak}</Text>
      <Pressable onPress={onDelete} accessibilityLabel={`Delete ${habit.title}`}>
        <Text style={{ color: "#a1a1aa" }}>✕</Text>
      </Pressable>
    </View>
  );
}

// ---- Step 3: the header
function ProgressHeader({ habits }: { habits: Habit[] }) {
  const done = habits.filter((h) => h.doneToday).length;
  const message =
    habits.length === 0 ? "Add your first habit" : done === habits.length ? "All done! 🎉" : `${done} of ${habits.length} done today`;
  return <Text style={{ fontSize: 16, color: "#6b21a8", marginBottom: 12 }}>{message}</Text>;
}

// ---- Step 4: the app
let nextId = 1;

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [title, setTitle] = useState("");

  const add = () => {
    if (!title.trim()) return;
    setHabits(addHabit(habits, title, String(nextId++)));
    setTitle("");
  };

  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: "#faf5ff" }}>
      <Text style={{ fontSize: 30, fontWeight: "800" }}>Today</Text>
      <ProgressHeader habits={habits} />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <TextInput
          placeholder="New habit"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={add}
          style={{ flex: 1, backgroundColor: "white", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#e9d5ff" }}
        />
        <Pressable onPress={add} style={{ backgroundColor: "#7c3aed", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" }}>
          <Text style={{ color: "white", fontWeight: "700" }}>Add</Text>
        </Pressable>
      </View>
      <FlatList
        data={habits}
        keyExtractor={(h) => h.id}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => (
          <HabitRow
            habit={item}
            onToggle={() => setHabits(toggleHabit(habits, item.id))}
            onDelete={() => setHabits(removeHabit(habits, item.id))}
          />
        )}
        ListEmptyComponent={<Text style={{ color: "#71717a", textAlign: "center", marginTop: 24 }}>No habits yet</Text>}
      />
    </View>
  );
}

@@tests
const add = (title: string) => {
  fireEvent.changeText(screen.getByPlaceholderText("New habit"), title);
  fireEvent.press(screen.getByText("Add"));
};

test("Starts empty", () => {
  render(<App />);
  expect(screen.getByText("Add your first habit")).toBeOnTheScreen();
  expect(screen.getByText("No habits yet")).toBeOnTheScreen();
});

test("Adds habits and clears the input", () => {
  render(<App />);
  add("Read");
  add("  Walk ");
  expect(screen.getByText("Read")).toBeOnTheScreen();
  expect(screen.getByText("Walk")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("New habit")).toHaveDisplayValue("");
  expect(screen.getByText("0 of 2 done today")).toBeOnTheScreen();
  expect(screen.queryByText("No habits yet")).toBeNull();
});

test("An empty title adds nothing", () => {
  render(<App />);
  add("   ");
  expect(screen.getByText("No habits yet")).toBeOnTheScreen();
});

test("Ticking a habit updates the streak and the header", () => {
  render(<App />);
  add("Read");
  add("Walk");
  fireEvent.press(screen.getByLabelText("Mark Read done"));
  expect(screen.getByText("1 of 2 done today")).toBeOnTheScreen();
  expect(screen.getByLabelText("Mark Read not done")).toBeOnTheScreen();
  expect(screen.getAllByText("🔥 1")).toHaveLength(1);
  fireEvent.press(screen.getByLabelText("Mark Walk done"));
  expect(screen.getByText("All done! 🎉")).toBeOnTheScreen();
});

test("Un-ticking takes the streak back down", () => {
  render(<App />);
  add("Read");
  fireEvent.press(screen.getByLabelText("Mark Read done"));
  fireEvent.press(screen.getByLabelText("Mark Read not done"));
  expect(screen.getByText("🔥 0")).toBeOnTheScreen();
  expect(screen.getByText("0 of 1 done today")).toBeOnTheScreen();
});

test("Deleting removes only that habit", () => {
  render(<App />);
  add("Read");
  add("Walk");
  fireEvent.press(screen.getByLabelText("Delete Read"));
  expect(screen.queryByText("Read")).toBeNull();
  expect(screen.getByText("Walk")).toBeOnTheScreen();
  fireEvent.press(screen.getByLabelText("Delete Walk"));
  expect(screen.getByText("Add your first habit")).toBeOnTheScreen();
});

@@hint
`App` needs two pieces of state: `habits` (starting as `[]`) and the `title` being typed.

@@hint
Each callback replaces the habits with the result of a logic function: `onToggle={() => setHabits(toggleHabit(habits, item.id))}`.

@@hint
For `Add`: `setHabits(addHabit(habits, title, String(nextId++)))`, then `setTitle("")`.
:::

## Run it on your phone

When your app passes, press **Snack** on the exercise to open your code in Expo Snack. Choose **My Device**, scan the QR code with Expo Go, and use your habit tracker on your own phone. Show someone!

:::tip Make it yours
Some ideas to try in the playground or in Snack:

- Add an emoji to each habit, chosen from a row of options when you add it.
- Show the longest streak in the header.
- Sort habits so unfinished ones come first.
- Confirm before deleting with `Alert.alert("Delete habit?", "", [{ text: "Cancel" }, { text: "Delete", onPress: ... }])` (on a real phone).
:::

Right now, everything disappears when the app restarts, and "today" never ends. In Phase 4 you'll store habits on the phone and track real dates, so streaks work properly.

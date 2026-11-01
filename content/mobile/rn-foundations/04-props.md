---
title: Props
summary: Pass data into components, type props with TypeScript, use children, defaults and callback props.
minutes: 45
kind: lesson
language: tsx
---

A component that always shows the same thing isn't very useful. **Props** (short for properties) let the parent pass data in, so one component can show many different things, like a function with parameters.

## Passing and reading props

You pass props like attributes, and the component receives them as one object:

```tsx
import { Text, View } from "react-native";

type HabitRowProps = {
  title: string;
  minutes: number;
};

function HabitRow(props: HabitRowProps) {
  return (
    <Text style={{ fontSize: 18, paddingVertical: 6 }}>
      {props.title} · {props.minutes} min
    </Text>
  );
}

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <HabitRow title="Read" minutes={20} />
      <HabitRow title="Walk" minutes={30} />
      <HabitRow title="Meditate" minutes={10} />
    </View>
  );
}
```

Strings can be written in quotes (`title="Read"`). Anything else goes in braces: numbers (`minutes={20}`), booleans, arrays, objects and functions.

The `HabitRowProps` type says which props the component needs. In your editor, forgetting `minutes` or passing `minutes="20"` (a string) is underlined straight away. Typed props are like documentation that can't go out of date.

## Destructuring props

Most React code destructures props in the parameter list, which reads better than `props.title` everywhere:

```tsx
import { Text, View } from "react-native";

type HabitRowProps = { title: string; minutes: number };

function HabitRow({ title, minutes }: HabitRowProps) {
  return (
    <Text style={{ fontSize: 18 }}>
      {title} · {minutes} min
    </Text>
  );
}

export default function App() {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <HabitRow title="Read" minutes={20} />
      <HabitRow title="Walk" minutes={30} />
    </View>
  );
}
```

## Optional props and defaults

Mark a prop optional with `?` and give it a default in the destructuring:

```tsx
import { Text, View } from "react-native";

type TagProps = {
  label: string;
  color?: string; // optional
  size?: "small" | "large";
};

function Tag({ label, color = "#7c3aed", size = "small" }: TagProps) {
  return (
    <Text
      style={{
        alignSelf: "flex-start",
        backgroundColor: color,
        color: "white",
        fontSize: size === "small" ? 12 : 16,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      {label}
    </Text>
  );
}

export default function App() {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Tag label="Health" />
      <Tag label="Learning" color="#0891b2" />
      <Tag label="Big tag" size="large" />
    </View>
  );
}
```

## Props are read-only

A component must never change its own props. Props belong to the parent: if something needs to change over time, that's **state**, the subject of lesson 6. Treat props like the arguments of a pure function: same props in, same screen out.

## The children prop

Whatever you put *between* a component's opening and closing tags arrives as a special prop called `children`. It's how you build wrappers like cards and screens:

```tsx
import type { ReactNode } from "react";
import { Text, View } from "react-native";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: "white", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#e4e4e7" }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}

export default function App() {
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#f4f4f5" }}>
      <Card title="Today">
        <Text>3 of 5 habits done</Text>
      </Card>
      <Card title="This week">
        <Text>Best day: Tuesday</Text>
        <Text>Longest streak: 12 days</Text>
      </Card>
    </View>
  );
}
```

`ReactNode` is the TypeScript type for "anything React can render": elements, strings, numbers, arrays of those, or nothing.

## Passing objects

Often a component takes one object rather than many separate props. Share the type so parent and child agree:

```tsx
import { Text, View } from "react-native";

type Habit = { id: string; title: string; emoji: string; streak: number };

function HabitSummary({ habit }: { habit: Habit }) {
  return (
    <Text style={{ fontSize: 18, paddingVertical: 4 }}>
      {habit.emoji} {habit.title}: {habit.streak} days
    </Text>
  );
}

const read: Habit = { id: "1", title: "Read", emoji: "📚", streak: 4 };
const walk: Habit = { id: "2", title: "Walk", emoji: "🚶", streak: 9 };

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <HabitSummary habit={read} />
      <HabitSummary habit={walk} />
    </View>
  );
}
```

## Passing functions

Props can be functions too. That's how a child tells its parent something happened: the parent passes a function, and the child calls it. You'll use this pattern for every button. Here `onPress` is a prop of React Native's `Pressable`; `Alert.alert` shows a native alert (in the simulator it prints to the output):

```tsx
import { Alert, Pressable, Text, View } from "react-native";

type ActionButtonProps = { label: string; onPress: () => void };

function ActionButton({ label, onPress }: ActionButtonProps) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: "#7c3aed", padding: 14, borderRadius: 10 }}>
      <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <ActionButton label="Save" onPress={() => Alert.alert("Saved!")} />
      <ActionButton label="Share" onPress={() => console.log("Share pressed")} />
    </View>
  );
}
```

Tap the buttons on the phone. The component doesn't know what will happen; the parent decides. Callback props are named `onSomething` by convention.

:::exercise habit-row-props A habit row
Write a component `HabitRow` with props `title` (string) and `minutes` (number) that shows a single `<Text>` like `Read · 20 min`.

@@starter
import { Text, View } from "react-native";

type HabitRowProps = { title: string; minutes: number };

export function HabitRow({ title, minutes }: HabitRowProps) {
  return <Text>Read · 20 min</Text>;
}

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <HabitRow title="Read" minutes={20} />
      <HabitRow title="Walk" minutes={45} />
    </View>
  );
}

@@solution
import { Text, View } from "react-native";

type HabitRowProps = { title: string; minutes: number };

export function HabitRow({ title, minutes }: HabitRowProps) {
  return (
    <Text>
      {title} · {minutes} min
    </Text>
  );
}

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <HabitRow title="Read" minutes={20} />
      <HabitRow title="Walk" minutes={45} />
    </View>
  );
}

@@tests
test("Shows the title and minutes", () => {
  render(<HabitRow title="Read" minutes={20} />);
  expect(screen.getByText("Read · 20 min")).toBeOnTheScreen();
});

test("Uses the props it's given", () => {
  render(<HabitRow title="Walk" minutes={45} />);
  expect(screen.getByText("Walk · 45 min")).toBeOnTheScreen();
});

@@hint
Replace the typed-in text with `{title}` and `{minutes}`. The ` · ` and ` min` stay as plain text.
:::

:::exercise tag-defaults Optional props
Write a `Badge` component with:

- `label` (string, required): the text to show,
- `count` (number, optional, default `0`).

It shows `label` followed by the count in brackets, like `Inbox (3)`. When `count` is `0` it shows just the label: `Inbox`.

@@starter
import { Text } from "react-native";

type BadgeProps = { label: string; count?: number };

export function Badge({ label, count }: BadgeProps) {
  return <Text>{label} ({count})</Text>;
}

export default function App() {
  return <Badge label="Inbox" count={3} />;
}

@@solution
import { Text } from "react-native";

type BadgeProps = { label: string; count?: number };

export function Badge({ label, count = 0 }: BadgeProps) {
  return <Text>{count > 0 ? `${label} (${count})` : label}</Text>;
}

export default function App() {
  return <Badge label="Inbox" count={3} />;
}

@@tests
test("Shows the count in brackets", () => {
  render(<Badge label="Inbox" count={3} />);
  expect(screen.getByText("Inbox (3)")).toBeOnTheScreen();
});

test("A count of 0 shows only the label", () => {
  render(<Badge label="Inbox" count={0} />);
  expect(screen.getByText("Inbox")).toBeOnTheScreen();
});

test("A missing count shows only the label", () => {
  render(<Badge label="Done" />);
  expect(screen.getByText("Done")).toBeOnTheScreen();
});

@@hint
Give `count` a default in the destructuring: `{ label, count = 0 }`.

@@hint
A ternary picks between the two texts: `count > 0 ? ... : label`.
:::

:::exercise card-children A card with children
Write a `Card` component that takes a `title` and `children`. It shows the title in a `<Text>`, then whatever children it's given, inside a `<View>`.

@@starter
import type { ReactNode } from "react";
import { Text, View } from "react-native";

type CardProps = { title: string; children: ReactNode };

export function Card({ title }: CardProps) {
  return (
    <View style={{ padding: 16, borderWidth: 1, borderColor: "#ddd", borderRadius: 12 }}>
      <Text style={{ fontWeight: "700" }}>{title}</Text>
    </View>
  );
}

export default function App() {
  return (
    <View style={{ padding: 16 }}>
      <Card title="Today">
        <Text>3 habits left</Text>
      </Card>
    </View>
  );
}

@@solution
import type { ReactNode } from "react";
import { Text, View } from "react-native";

type CardProps = { title: string; children: ReactNode };

export function Card({ title, children }: CardProps) {
  return (
    <View style={{ padding: 16, borderWidth: 1, borderColor: "#ddd", borderRadius: 12 }}>
      <Text style={{ fontWeight: "700" }}>{title}</Text>
      {children}
    </View>
  );
}

export default function App() {
  return (
    <View style={{ padding: 16 }}>
      <Card title="Today">
        <Text>3 habits left</Text>
      </Card>
    </View>
  );
}

@@tests
test("Shows the title", () => {
  render(<Card title="This week"><Text>x</Text></Card>);
  expect(screen.getByText("This week")).toBeOnTheScreen();
});

test("Shows its children", () => {
  render(
    <Card title="Today">
      <Text>First child</Text>
      <Text>Second child</Text>
    </Card>,
  );
  expect(screen.getByText("First child")).toBeOnTheScreen();
  expect(screen.getByText("Second child")).toBeOnTheScreen();
});

@@hint
Destructure `children` too, then put `{children}` after the title.
:::

:::exercise callback-prop Tell the parent
Write a `DeleteButton` component with an `onDelete` prop (a function). It shows a `Pressable` with the text `Delete`, and calls `onDelete` when pressed.

The test checks this with `jest.fn()`, a fake function that records how it was called.

@@starter
import { Pressable, Text, View } from "react-native";

type DeleteButtonProps = { onDelete: () => void };

export function DeleteButton({ onDelete }: DeleteButtonProps) {
  return (
    <Pressable style={{ backgroundColor: "#dc2626", padding: 12, borderRadius: 8 }}>
      <Text style={{ color: "white" }}>Delete</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <DeleteButton onDelete={() => console.log("Deleted!")} />
    </View>
  );
}

@@solution
import { Pressable, Text, View } from "react-native";

type DeleteButtonProps = { onDelete: () => void };

export function DeleteButton({ onDelete }: DeleteButtonProps) {
  return (
    <Pressable onPress={onDelete} style={{ backgroundColor: "#dc2626", padding: 12, borderRadius: 8 }}>
      <Text style={{ color: "white" }}>Delete</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <DeleteButton onDelete={() => console.log("Deleted!")} />
    </View>
  );
}

@@tests
test("Shows a Delete button", () => {
  render(<DeleteButton onDelete={() => {}} />);
  expect(screen.getByText("Delete")).toBeOnTheScreen();
});

test("Calls onDelete once when pressed", () => {
  const onDelete = jest.fn();
  render(<DeleteButton onDelete={onDelete} />);
  fireEvent.press(screen.getByText("Delete"));
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test("Doesn't call onDelete before it's pressed", () => {
  const onDelete = jest.fn();
  render(<DeleteButton onDelete={onDelete} />);
  expect(onDelete).not.toHaveBeenCalled();
});

@@hint
`Pressable` has an `onPress` prop. Pass it the function you were given.

@@hint
`<Pressable onPress={onDelete} ...>`. Don't write `onPress={onDelete()}`: that calls it straight away, while rendering.
:::

:::quiz props-check Quick check
? How do you pass the number 5 as a prop?
- [ ] `count="5"`
- [x] `count={5}`
- [ ] `count=5`
> `count="5"` passes the *string* "5". Anything that isn't a plain string goes in braces.

? A component wants to change one of its props. What should it do?
- [ ] Assign to it: `props.title = "New"`
- [x] Use state instead, or ask the parent to change it through a callback prop
- [ ] Make a copy of the prop and hope
> Props are read-only. Data that changes is state, owned by whichever component changes it.

? What arrives in `children` for `<Card title="A"><Text>Hi</Text></Card>`?
- [ ] `"A"`
- [x] The `<Text>Hi</Text>` element
- [ ] Nothing: Card has no children prop
> Everything between the tags is passed as `children`.

? What's wrong with `<Pressable onPress={save()}>`?
- [x] It calls `save` while rendering, instead of passing it to be called on a tap
- [ ] Nothing
- [ ] `onPress` must be a string
> Pass the function itself (`onPress={save}`) or a new arrow function (`onPress={() => save(id)}`).
:::

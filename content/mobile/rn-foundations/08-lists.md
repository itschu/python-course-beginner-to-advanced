---
title: Lists with map, ScrollView and FlatList
summary: Render arrays as components, choose good keys, scroll, and show long lists efficiently with FlatList.
minutes: 55
kind: lesson
language: tsx
---

Most app screens are lists: messages, contacts, habits, search results. In React a list starts as an **array of data**, and you turn it into an **array of components** with `map`.

## From data to components

```tsx
import { Text, View } from "react-native";

const habits = ["Read", "Walk", "Meditate", "Stretch"];

export default function App() {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      {habits.map((habit) => (
        <Text key={habit} style={{ fontSize: 18 }}>
          • {habit}
        </Text>
      ))}
    </View>
  );
}
```

JSX accepts arrays, so `{habits.map(...)}` puts one `<Text>` on screen for each item.

## Keys

Every item in a list needs a `key` prop: a string or number that is **unique among its siblings** and **stays the same** for the same item. Remove the key from this example and run it: you get a warning.

```tsx expect-warning
import { Text, View } from "react-native";

const habits = ["Read", "Walk"];

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      {habits.map((habit) => (
        <Text style={{ fontSize: 18 }}>{habit}</Text>
      ))}
    </View>
  );
}
```

Keys tell React which item is which between renders. When an item is added, removed or moved, React uses the keys to keep each item's state and native view with the right data. Without good keys, a checkbox can end up ticked on the wrong row after you delete something.

- **Best:** a stable id from your data, like `habit.id` or a database id.
- **Avoid:** the array index (`key={index}`) for lists that can change order, because the index of an item changes when items are added or removed. It's fine for a static list that never changes.
- Never generate keys while rendering (`key={Math.random()}`): every render would look like a brand-new list.

## Lists of objects

Real data is usually an array of objects with ids:

```tsx
import { StyleSheet, Text, View } from "react-native";

type Contact = { id: string; name: string; phone: string };

const contacts: Contact[] = [
  { id: "c1", name: "Ada Lovelace", phone: "555-0101" },
  { id: "c2", name: "Grace Hopper", phone: "555-0102" },
  { id: "c3", name: "Alan Turing", phone: "555-0103" },
];

function ContactRow({ contact }: { contact: Contact }) {
  return (
    <View style={styles.row}>
      <Text style={styles.name}>{contact.name}</Text>
      <Text style={styles.phone}>{contact.phone}</Text>
    </View>
  );
}

export default function App() {
  return (
    <View style={{ padding: 16 }}>
      {contacts.map((c) => (
        <ContactRow key={c.id} contact={c} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e4e4e7" },
  name: { fontSize: 17, fontWeight: "600" },
  phone: { color: "#71717a", marginTop: 2 },
});
```

The `key` goes on the outermost element returned from `map` (here `ContactRow`), not inside the component.

## Scrolling

A `View` doesn't scroll: content taller than the screen is just cut off. Wrap content in a `ScrollView` to make it scroll:

```tsx
import { ScrollView, Text, View } from "react-native";

const days = Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`);

export default function App() {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 8 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>30-day challenge</Text>
      {days.map((day) => (
        <View key={day} style={{ padding: 14, backgroundColor: "#f4f4f5", borderRadius: 10 }}>
          <Text>{day}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
```

Scroll the phone screen. Padding and gaps for the content go in `contentContainerStyle`, because a ScrollView has two parts: the scrolling frame and the content inside.

## FlatList: for long lists

A `ScrollView` renders **every** child at once. With thousands of items, that's slow and uses a lot of memory. `FlatList` only renders the items near the screen and recycles them as you scroll. Use it for any list that can grow:

```tsx
import { FlatList, StyleSheet, Text, View } from "react-native";

type Habit = { id: string; title: string; emoji: string };

const habits: Habit[] = [
  { id: "1", title: "Read", emoji: "📚" },
  { id: "2", title: "Walk", emoji: "🚶" },
  { id: "3", title: "Meditate", emoji: "🧘" },
  { id: "4", title: "Drink water", emoji: "💧" },
];

export default function App() {
  return (
    <FlatList
      data={habits}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.emoji}>{item.emoji}</Text>
          <Text style={styles.title}>{item.title}</Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={<Text style={styles.header}>My habits</Text>}
      ListEmptyComponent={<Text>No habits yet.</Text>}
      contentContainerStyle={{ padding: 16 }}
    />
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 26, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  emoji: { fontSize: 26 },
  title: { fontSize: 18 },
  separator: { height: 1, backgroundColor: "#e4e4e7" },
});
```

The props you'll use most:

| Prop | What it's for |
| --- | --- |
| `data` | The array to show |
| `renderItem` | A function `({ item, index }) => element` for one row |
| `keyExtractor` | A function returning each item's key (without it, FlatList uses `item.key` or `item.id`) |
| `ItemSeparatorComponent` | Drawn between rows |
| `ListHeaderComponent`, `ListFooterComponent` | Above and below the rows, scrolling with them |
| `ListEmptyComponent` | Shown when `data` is empty |
| `horizontal` | Scroll sideways |
| `numColumns` | A grid |

:::note About the simulator
On a phone, FlatList renders only what's near the screen. The simulator on this page renders every item, which is fine for lesson-sized lists. In Phase 7 you'll measure list performance on real devices.
:::

## Filtering and searching

A search box is state plus a **derived** list. Don't store the filtered list in state: calculate it on every render from the full list and the query:

```tsx
import { useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

const fruits = ["Apple", "Apricot", "Banana", "Blueberry", "Cherry", "Grape", "Mango", "Orange", "Peach", "Pear"];

export default function App() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = fruits.filter((f) => f.toLowerCase().includes(q));

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput
        placeholder="Search fruit"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        style={{ borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 10, padding: 12, fontSize: 16 }}
      />
      <Text style={{ color: "#71717a" }}>{results.length} results</Text>
      <FlatList
        data={results}
        keyExtractor={(f) => f}
        renderItem={({ item }) => <Text style={{ fontSize: 18, paddingVertical: 8 }}>{item}</Text>}
        ListEmptyComponent={<Text>No fruit matches “{query}”.</Text>}
      />
    </View>
  );
}
```

## Selecting items

To let people pick an item, store the **id** of the selected item (not a copy of the item), and compare ids when rendering:

```tsx
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

const plans = [
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Once a week" },
];

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = plans.find((p) => p.id === selectedId);

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <FlatList
        data={plans}
        renderItem={({ item }) => {
          const isSelected = item.id === selectedId;
          return (
            <Pressable
              onPress={() => setSelectedId(item.id)}
              style={{ padding: 14, borderRadius: 10, marginBottom: 8, backgroundColor: isSelected ? "#7c3aed" : "#f4f4f5" }}
            >
              <Text style={{ fontSize: 17, color: isSelected ? "white" : "#18181b" }}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
      <Text style={{ fontSize: 16 }}>Repeat: {selected ? selected.label : "not chosen"}</Text>
    </View>
  );
}
```

This FlatList has no `keyExtractor`: each item has an `id`, which FlatList uses by default.

## Sections and horizontal lists

`SectionList` is FlatList with group headings, for contacts by letter or habits by time of day:

```tsx
import { SectionList, Text } from "react-native";

const sections = [
  { title: "Morning", data: ["Stretch", "Read"] },
  { title: "Evening", data: ["Walk", "Journal"] },
];

export default function App() {
  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item}
      renderSectionHeader={({ section }) => (
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#7c3aed", paddingTop: 16, paddingHorizontal: 16 }}>
          {section.title.toUpperCase()}
        </Text>
      )}
      renderItem={({ item }) => <Text style={{ fontSize: 18, paddingVertical: 8, paddingHorizontal: 16 }}>{item}</Text>}
    />
  );
}
```

And `horizontal` makes any FlatList scroll sideways, for carousels and chips:

```tsx
import { FlatList, Text, View } from "react-native";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function App() {
  return (
    <View style={{ paddingVertical: 24 }}>
      <FlatList
        horizontal
        data={days}
        keyExtractor={(d) => d}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
        renderItem={({ item }) => (
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontWeight: "600" }}>{item}</Text>
          </View>
        )}
      />
    </View>
  );
}
```

:::exercise shopping-list Render an array
`ShoppingList` gets an `items` prop: an array of `{ id, name, quantity }`. Render one `<Text testID="item">` per item, in order, showing `2 × Milk` (the quantity, ` × `, then the name). Give each one a proper `key`.

@@starter
import { Text, View } from "react-native";

type Item = { id: string; name: string; quantity: number };

export function ShoppingList({ items }: { items: Item[] }) {
  return (
    <View style={{ padding: 24, gap: 6 }}>
      <Text testID="item">2 × Milk</Text>
    </View>
  );
}

export default function App() {
  return (
    <ShoppingList
      items={[
        { id: "a", name: "Milk", quantity: 2 },
        { id: "b", name: "Bread", quantity: 1 },
        { id: "c", name: "Eggs", quantity: 12 },
      ]}
    />
  );
}

@@solution
import { Text, View } from "react-native";

type Item = { id: string; name: string; quantity: number };

export function ShoppingList({ items }: { items: Item[] }) {
  return (
    <View style={{ padding: 24, gap: 6 }}>
      {items.map((item) => (
        <Text key={item.id} testID="item">
          {item.quantity} × {item.name}
        </Text>
      ))}
    </View>
  );
}

export default function App() {
  return (
    <ShoppingList
      items={[
        { id: "a", name: "Milk", quantity: 2 },
        { id: "b", name: "Bread", quantity: 1 },
        { id: "c", name: "Eggs", quantity: 12 },
      ]}
    />
  );
}

@@tests
const items = [
  { id: "a", name: "Milk", quantity: 2 },
  { id: "b", name: "Bread", quantity: 1 },
  { id: "c", name: "Eggs", quantity: 12 },
];

test("One row per item", () => {
  render(<ShoppingList items={items} />);
  expect(screen.getAllByTestId("item")).toHaveLength(3);
});

test("Rows show the quantity and name, in order", () => {
  render(<ShoppingList items={items} />);
  const rows = screen.getAllByTestId("item");
  expect(rows[0]).toHaveTextContent("2 × Milk");
  expect(rows[1]).toHaveTextContent("1 × Bread");
  expect(rows[2]).toHaveTextContent("12 × Eggs");
});

test("An empty list shows no rows", () => {
  render(<ShoppingList items={[]} />);
  expect(screen.queryAllByTestId("item")).toHaveLength(0);
});

test("Each row has a key", () => {
  expect(source).toMatch(/key=\{/);
});

@@hint
`{items.map((item) => <Text key={item.id} testID="item">...</Text>)}`
:::

:::exercise contacts-flatlist Contacts with FlatList
Show the `contacts` prop in a `FlatList`:

- each row shows the contact's `name`,
- use `keyExtractor` with the contact's `email` (they have no `id`),
- when there are no contacts, show `No contacts yet` with `ListEmptyComponent`,
- show the heading `Contacts (3)` (with the real count) with `ListHeaderComponent`.

@@starter
import { FlatList, Text } from "react-native";

type Contact = { name: string; email: string };

export function ContactList({ contacts }: { contacts: Contact[] }) {
  return <FlatList data={contacts} renderItem={({ item }) => <Text>{item.email}</Text>} />;
}

export default function App() {
  return (
    <ContactList
      contacts={[
        { name: "Ada Lovelace", email: "ada@example.com" },
        { name: "Grace Hopper", email: "grace@example.com" },
      ]}
    />
  );
}

@@solution
import { FlatList, Text } from "react-native";

type Contact = { name: string; email: string };

export function ContactList({ contacts }: { contacts: Contact[] }) {
  return (
    <FlatList
      data={contacts}
      keyExtractor={(c) => c.email}
      renderItem={({ item }) => <Text style={{ fontSize: 18, padding: 12 }}>{item.name}</Text>}
      ListHeaderComponent={<Text style={{ fontSize: 24, fontWeight: "700", padding: 12 }}>Contacts ({contacts.length})</Text>}
      ListEmptyComponent={<Text style={{ padding: 12 }}>No contacts yet</Text>}
    />
  );
}

export default function App() {
  return (
    <ContactList
      contacts={[
        { name: "Ada Lovelace", email: "ada@example.com" },
        { name: "Grace Hopper", email: "grace@example.com" },
      ]}
    />
  );
}

@@tests
const people = [
  { name: "Ada Lovelace", email: "ada@example.com" },
  { name: "Grace Hopper", email: "grace@example.com" },
  { name: "Alan Turing", email: "alan@example.com" },
];

test("Shows every contact's name", () => {
  render(<ContactList contacts={people} />);
  expect(screen.getByText("Ada Lovelace")).toBeOnTheScreen();
  expect(screen.getByText("Grace Hopper")).toBeOnTheScreen();
  expect(screen.getByText("Alan Turing")).toBeOnTheScreen();
});

test("Shows the heading with the count", () => {
  render(<ContactList contacts={people} />);
  expect(screen.getByText("Contacts (3)")).toBeOnTheScreen();
});

test("An empty list shows the empty message", () => {
  render(<ContactList contacts={[]} />);
  expect(screen.getByText("No contacts yet")).toBeOnTheScreen();
  expect(screen.getByText("Contacts (0)")).toBeOnTheScreen();
});

test("Uses keyExtractor", () => {
  expect(source).toMatch(/keyExtractor/);
});

@@hint
`ListHeaderComponent` and `ListEmptyComponent` accept an element: `ListEmptyComponent={<Text>No contacts yet</Text>}`.

@@hint
`keyExtractor={(c) => c.email}`
:::

:::exercise search-filter Search as you type
Build `HabitSearch`, which gets a `habits` prop (an array of strings). It has a `TextInput` with the placeholder `Search` and shows each habit that **contains** the query, ignoring upper and lower case and surrounding spaces, in a `<Text>`. When nothing matches, show `No matches`.

An empty query shows every habit.

@@starter
import { useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

export function HabitSearch({ habits }: { habits: string[] }) {
  const [query, setQuery] = useState("");
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TextInput placeholder="Search" value={query} onChangeText={setQuery} />
      <FlatList data={habits} keyExtractor={(h) => h} renderItem={({ item }) => <Text>{item}</Text>} />
    </View>
  );
}

export default function App() {
  return <HabitSearch habits={["Read", "Walk", "Read the news", "Meditate"]} />;
}

@@solution
import { useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

export function HabitSearch({ habits }: { habits: string[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = habits.filter((h) => h.toLowerCase().includes(q));
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TextInput placeholder="Search" value={query} onChangeText={setQuery} />
      <FlatList
        data={matches}
        keyExtractor={(h) => h}
        renderItem={({ item }) => <Text>{item}</Text>}
        ListEmptyComponent={<Text>No matches</Text>}
      />
    </View>
  );
}

export default function App() {
  return <HabitSearch habits={["Read", "Walk", "Read the news", "Meditate"]} />;
}

@@tests
const habits = ["Read", "Walk", "Read the news", "Meditate"];

test("An empty query shows every habit", () => {
  render(<HabitSearch habits={habits} />);
  for (const h of habits) expect(screen.getByText(h)).toBeOnTheScreen();
});

test("Shows only the habits that contain the query", () => {
  render(<HabitSearch habits={habits} />);
  fireEvent.changeText(screen.getByPlaceholderText("Search"), "read");
  expect(screen.getByText("Read")).toBeOnTheScreen();
  expect(screen.getByText("Read the news")).toBeOnTheScreen();
  expect(screen.queryByText("Walk")).toBeNull();
  expect(screen.queryByText("Meditate")).toBeNull();
});

test("Ignores case and spaces", () => {
  render(<HabitSearch habits={habits} />);
  fireEvent.changeText(screen.getByPlaceholderText("Search"), "  MEDI ");
  expect(screen.getByText("Meditate")).toBeOnTheScreen();
  expect(screen.queryByText("Read")).toBeNull();
});

test("Shows No matches when nothing matches", () => {
  render(<HabitSearch habits={habits} />);
  fireEvent.changeText(screen.getByPlaceholderText("Search"), "swim");
  expect(screen.getByText("No matches")).toBeOnTheScreen();
});

@@hint
Work out the filtered list on each render, from `habits` and `query`. It doesn't need its own state.

@@hint
`habits.filter((h) => h.toLowerCase().includes(q))`, where `q` is the trimmed, lower-case query.
:::

:::exercise pick-one Pick one
Build `ColorPicker`, which shows the colours `Red`, `Green` and `Blue` as `Pressable` rows. Tapping a row selects it (only one can be selected at a time), and a `Text` below says `Selected: Green`, or `Selected: none` at first.

Each row has `testID` set to `row-<name>` (for example `row-Green`). The selected row has the background colour `#7c3aed`; the others have `#f4f4f5`.

@@starter
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

const COLORS = ["Red", "Green", "Blue"];

export function ColorPicker() {
  return (
    <View style={{ padding: 16, gap: 8 }}>
      {COLORS.map((name) => (
        <Pressable key={name} testID={`row-${name}`} style={{ padding: 14, borderRadius: 10, backgroundColor: "#f4f4f5" }}>
          <Text>{name}</Text>
        </Pressable>
      ))}
      <Text>Selected: none</Text>
    </View>
  );
}

export default function App() {
  return <ColorPicker />;
}

@@solution
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

const COLORS = ["Red", "Green", "Blue"];

export function ColorPicker() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      {COLORS.map((name) => (
        <Pressable
          key={name}
          testID={`row-${name}`}
          onPress={() => setSelected(name)}
          style={{ padding: 14, borderRadius: 10, backgroundColor: name === selected ? "#7c3aed" : "#f4f4f5" }}
        >
          <Text style={{ color: name === selected ? "white" : "black" }}>{name}</Text>
        </Pressable>
      ))}
      <Text>Selected: {selected ?? "none"}</Text>
    </View>
  );
}

export default function App() {
  return <ColorPicker />;
}

@@tests
test("Nothing is selected at first", () => {
  render(<ColorPicker />);
  expect(screen.getByText("Selected: none")).toBeOnTheScreen();
  expect(screen.getByTestId("row-Red")).toHaveStyle({ backgroundColor: "#f4f4f5" });
});

test("Tapping a row selects it", () => {
  render(<ColorPicker />);
  fireEvent.press(screen.getByText("Green"));
  expect(screen.getByText("Selected: Green")).toBeOnTheScreen();
  expect(screen.getByTestId("row-Green")).toHaveStyle({ backgroundColor: "#7c3aed" });
});

test("Only one row is selected at a time", () => {
  render(<ColorPicker />);
  fireEvent.press(screen.getByText("Green"));
  fireEvent.press(screen.getByText("Blue"));
  expect(screen.getByText("Selected: Blue")).toBeOnTheScreen();
  expect(screen.getByTestId("row-Blue")).toHaveStyle({ backgroundColor: "#7c3aed" });
  expect(screen.getByTestId("row-Green")).toHaveStyle({ backgroundColor: "#f4f4f5" });
});

@@hint
Store the selected name: `useState<string | null>(null)`. Each row compares its own name with it.

@@hint
`Selected: {selected ?? "none"}`
:::

:::quiz lists-check Quick check
? Which is the best key for a list of messages?
- [ ] `key={index}`
- [x] `key={message.id}`
- [ ] `key={Math.random()}`
> A stable, unique id keeps each row's state with the right message when the list changes.

? When should you use `FlatList` instead of `ScrollView` with `map`?
- [x] When the list can be long or grow over time
- [ ] Never: they're the same
- [ ] Only for horizontal lists
> FlatList renders only what's near the screen, so it stays fast with thousands of items.

? Where should the filtered results of a search live?
- [ ] In their own state, updated in `onChangeText`
- [x] In a variable calculated from the full list and the query on each render
> Storing derived data in state means keeping two things in sync by hand.

? Your FlatList items have an `id` and you don't pass `keyExtractor`. What does FlatList use as keys?
- [x] `item.id` (or `item.key` if there is one)
- [ ] Nothing: it crashes
- [ ] Random numbers
> The default key extractor looks for `key`, then `id`, then falls back to the index.
:::

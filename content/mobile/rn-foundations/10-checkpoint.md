---
title: "Checkpoint: React Native foundations"
summary: A test of everything in Phase 1, with a quiz and three exercises to build and fix real components.
minutes: 75
kind: checkpoint
language: tsx
---

This checkpoint covers the whole phase: TypeScript, components and JSX, props, styling, state, input and lists. Try it without looking back at the lessons first. If something trips you up, that's the lesson to review before Phase 2.

:::quiz phase-1-quiz Phase 1 quiz
? Which statement about React Native is true?
- [ ] It runs your app inside a hidden web browser
- [x] Your components become real native views on iOS and Android
- [ ] You must write Swift and Kotlin as well
> React Native drives native UI components from JavaScript. That's why apps look and feel native.

? What's wrong with this component? `function card() { return <View><Text>Hi</Text></View>; }`
- [ ] It needs a semicolon
- [x] Component names must start with a capital letter
- [ ] View can't contain Text
> React treats lowercase tags as built-in elements, so `<card />` won't call your function.

? Which of these crash a React Native app? (choose all that apply)
- [x] `<View>Hello</View>`
- [x] `<View>{0}</View>`
- [ ] `<Text>{0}</Text>`
- [ ] `<View>{null}</View>`
> Strings and numbers must be inside `<Text>`. `null`, `false` and `undefined` render nothing.

? `const [items, setItems] = useState<string[]>([])`. Which line adds an item correctly?
- [ ] `items.push("Read"); setItems(items);`
- [x] `setItems([...items, "Read"]);`
- [ ] `items = [...items, "Read"];`
> Give React a new array. Changing the old one in place and passing it back looks like "no change".

? A button should add 2: `onPress={() => { setN(n + 1); setN(n + 1); }}`. What happens?
- [x] It adds 1, because both calls use the same `n`
- [ ] It adds 2
- [ ] It crashes
> Use `setN((x) => x + 1)` twice, or `setN(n + 2)`.

? In a `flexDirection: "row"` container, how do you push two children to opposite ends?
- [ ] `alignItems: "space-between"`
- [x] `justifyContent: "space-between"`
- [ ] `flex: 1` on the container
> `justifyContent` works along the main axis, which is horizontal in a row.

? What does `<FlatList data={habits} renderItem={...} />` use as the key if items have an `id` and you pass no `keyExtractor`?
- [x] `item.id`
- [ ] The index, with no exceptions
- [ ] It requires a `keyExtractor`
> FlatList's default looks for `key`, then `id`.

? Where should the list of search results live?
- [ ] In state, updated whenever the query changes
- [x] In a variable calculated during render from the full list and the query
> It's derived data. Keeping it in state means two sources of truth.

? `onPress={deleteHabit(habit.id)}`. What happens?
- [ ] It deletes the habit when tapped
- [x] It calls `deleteHabit` during render, for every habit, and `onPress` gets its return value
- [ ] TypeScript fixes it automatically
> Pass a function: `onPress={() => deleteHabit(habit.id)}`.

? What does `fireEvent.press(screen.getByText("Save"))` do in a test?
- [ ] Clicks the screen at the position of the word Save
- [x] Finds the nearest pressable parent of that text and calls its `onPress`, then re-renders
- [ ] Checks that the Save button exists
> Tests interact with components the way a user would, through what's on screen.
:::

:::exercise tip-calculator A tip calculator
Build `TipCalculator`:

- a `TextInput` with the placeholder `Bill` and `keyboardType="decimal-pad"`,
- three `Pressable` buttons labelled `10%`, `15%` and `20%`; **15%** is selected at first. The selected one has `backgroundColor` `#7c3aed` and `testID` `tip-15` (the others `tip-10`, `tip-20`, all always present),
- when the bill is a number greater than 0, two texts: `Tip: $7.50` and `Total: $57.50`, with two decimal places (`toFixed(2)`),
- otherwise one text: `Enter the bill amount`.

@@starter
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const TIPS = [10, 15, 20];

export function TipCalculator() {
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <TextInput placeholder="Bill" />
    </View>
  );
}

export default function App() {
  return <TipCalculator />;
}

@@solution
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const TIPS = [10, 15, 20];

export function TipCalculator() {
  const [bill, setBill] = useState("");
  const [tip, setTip] = useState(15);
  const amount = Number(bill);
  const valid = bill.trim() !== "" && !Number.isNaN(amount) && amount > 0;
  const tipAmount = (amount * tip) / 100;

  return (
    <View style={{ padding: 24, gap: 12 }}>
      <TextInput
        placeholder="Bill"
        keyboardType="decimal-pad"
        value={bill}
        onChangeText={setBill}
        style={{ borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 10, padding: 12, fontSize: 18 }}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {TIPS.map((t) => (
          <Pressable
            key={t}
            testID={`tip-${t}`}
            onPress={() => setTip(t)}
            style={{ flex: 1, padding: 12, borderRadius: 10, alignItems: "center", backgroundColor: t === tip ? "#7c3aed" : "#f4f4f5" }}
          >
            <Text style={{ color: t === tip ? "white" : "black", fontWeight: "600" }}>{t}%</Text>
          </Pressable>
        ))}
      </View>
      {valid ? (
        <>
          <Text style={{ fontSize: 18 }}>Tip: ${tipAmount.toFixed(2)}</Text>
          <Text style={{ fontSize: 24, fontWeight: "700" }}>Total: ${(amount + tipAmount).toFixed(2)}</Text>
        </>
      ) : (
        <Text style={{ color: "#71717a" }}>Enter the bill amount</Text>
      )}
    </View>
  );
}

export default function App() {
  return <TipCalculator />;
}

@@tests
const typeBill = (text: string) => fireEvent.changeText(screen.getByPlaceholderText("Bill"), text);

test("Asks for the bill at first", () => {
  render(<TipCalculator />);
  expect(screen.getByText("Enter the bill amount")).toBeOnTheScreen();
});

test("Uses a decimal keyboard", () => {
  render(<TipCalculator />);
  expect(screen.getByPlaceholderText("Bill")).toHaveProp("keyboardType", "decimal-pad");
});

test("15% is selected at first", () => {
  render(<TipCalculator />);
  expect(screen.getByTestId("tip-15")).toHaveStyle({ backgroundColor: "#7c3aed" });
  expect(screen.getByTestId("tip-10")).not.toHaveStyle({ backgroundColor: "#7c3aed" });
  typeBill("50");
  expect(screen.getByText("Tip: $7.50")).toBeOnTheScreen();
  expect(screen.getByText("Total: $57.50")).toBeOnTheScreen();
});

test("Choosing another tip updates the amounts", () => {
  render(<TipCalculator />);
  typeBill("42.5");
  fireEvent.press(screen.getByText("20%"));
  expect(screen.getByText("Tip: $8.50")).toBeOnTheScreen();
  expect(screen.getByText("Total: $51.00")).toBeOnTheScreen();
  expect(screen.getByTestId("tip-20")).toHaveStyle({ backgroundColor: "#7c3aed" });
  expect(screen.getByTestId("tip-15")).not.toHaveStyle({ backgroundColor: "#7c3aed" });
});

test("Text that isn't a positive number asks for the bill again", () => {
  render(<TipCalculator />);
  typeBill("abc");
  expect(screen.getByText("Enter the bill amount")).toBeOnTheScreen();
  typeBill("0");
  expect(screen.getByText("Enter the bill amount")).toBeOnTheScreen();
  expect(screen.queryByText(/Total/)).toBeNull();
});

@@hint
Two pieces of state: the bill text and the chosen tip percentage. Everything else (the number, whether it's valid, the amounts) is calculated.

@@hint
Render the three buttons with `TIPS.map(...)`, comparing each `t` with the selected tip for the style.
:::

:::exercise fix-the-bugs Fix the shopping list
This shopping list has **three bugs**. Find and fix them so that:

- adding an item shows it in the list and clears the input,
- tapping an item crosses it off (and tapping again un-crosses it), shown with `✓ ` before the name,
- each item can be removed with its `Remove` button, which removes only that item,
- there are no warnings in the output.

Run it, read the warnings and errors, and test it on the phone before you check.

@@starter
import { useState } from "react";
import { Button, Pressable, Text, TextInput, View } from "react-native";

type Item = { id: number; name: string; bought: boolean };

let nextId = 1;

export function ShoppingList() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");

  const add = () => {
    if (!name.trim()) return;
    items.push({ id: nextId++, name: name.trim(), bought: false });
    setItems(items);
    setName("");
  };
  const toggle = (id: number) => setItems(items.map((i) => (i.id === id ? { ...i, bought: !i.bought } : i)));
  const remove = (id: number) => setItems(items.filter((i) => i.id !== id));

  return (
    <View style={{ padding: 20, gap: 8 }}>
      <TextInput placeholder="Item" value={name} onChangeText={setName} />
      <Button title="Add" onPress={add} />
      {items.map((item) => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable style={{ flex: 1 }} onPress={() => toggle(item.id)}>
            <Text>{item.bought ? `✓ ${item.name}` : item.name}</Text>
          </Pressable>
          <Button title="Remove" onPress={remove(item.id)} />
        </View>
      ))}
    </View>
  );
}

export default function App() {
  return <ShoppingList />;
}

@@solution
import { useState } from "react";
import { Button, Pressable, Text, TextInput, View } from "react-native";

type Item = { id: number; name: string; bought: boolean };

let nextId = 1;

export function ShoppingList() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");

  const add = () => {
    if (!name.trim()) return;
    setItems([...items, { id: nextId++, name: name.trim(), bought: false }]);
    setName("");
  };
  const toggle = (id: number) => setItems(items.map((i) => (i.id === id ? { ...i, bought: !i.bought } : i)));
  const remove = (id: number) => setItems(items.filter((i) => i.id !== id));

  return (
    <View style={{ padding: 20, gap: 8 }}>
      <TextInput placeholder="Item" value={name} onChangeText={setName} />
      <Button title="Add" onPress={add} />
      {items.map((item) => (
        <View key={item.id} style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable style={{ flex: 1 }} onPress={() => toggle(item.id)}>
            <Text>{item.bought ? `✓ ${item.name}` : item.name}</Text>
          </Pressable>
          <Button title="Remove" onPress={() => remove(item.id)} />
        </View>
      ))}
    </View>
  );
}

export default function App() {
  return <ShoppingList />;
}

@@tests
const addItem = (name: string) => {
  fireEvent.changeText(screen.getByPlaceholderText("Item"), name);
  fireEvent.press(screen.getByText("Add"));
};

test("Adding shows the item and clears the input", () => {
  render(<ShoppingList />);
  addItem("Milk");
  expect(screen.getByText("Milk")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Item")).toHaveDisplayValue("");
  addItem("Eggs");
  expect(screen.getByText("Eggs")).toBeOnTheScreen();
});

test("Tapping an item crosses it off and back", () => {
  render(<ShoppingList />);
  addItem("Bread");
  fireEvent.press(screen.getByText("Bread"));
  expect(screen.getByText("✓ Bread")).toBeOnTheScreen();
  fireEvent.press(screen.getByText("✓ Bread"));
  expect(screen.getByText("Bread")).toBeOnTheScreen();
});

test("Remove removes only that item", () => {
  render(<ShoppingList />);
  addItem("Milk");
  addItem("Eggs");
  addItem("Tea");
  fireEvent.press(screen.getAllByText("Remove")[1]);
  expect(screen.queryByText("Eggs")).toBeNull();
  expect(screen.getByText("Milk")).toBeOnTheScreen();
  expect(screen.getByText("Tea")).toBeOnTheScreen();
});

test("Every row has a key", () => {
  expect(source).toMatch(/key=\{item\.id\}/);
});

@@hint
One bug changes the state array in place. It only seems to work because `setName("")` re-renders the screen anyway. React needs a new array.

@@hint
One bug runs code while rendering instead of on a tap. Look at how each `onPress` is written.

@@hint
One bug is reported as a warning in the output when you add items.
:::

:::exercise star-rating A star rating
Build `StarRating` with props `value` (a number from 0 to 5) and `onChange`. It shows five `Pressable` stars in a row:

- star *n* shows `★` if *n* ≤ `value`, otherwise `☆`,
- each star has `accessibilityLabel` `Rate 1 star`, `Rate 2 stars`, ... `Rate 5 stars` (note "star" for 1),
- tapping star *n* calls `onChange(n)`, except tapping the star equal to the current value, which clears the rating with `onChange(0)`.

`StarRating` holds no state: the `App` below keeps the rating and passes it in.

@@starter
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

type StarRatingProps = { value: number; onChange: (value: number) => void };

export function StarRating({ value, onChange }: StarRatingProps) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      <Text style={{ fontSize: 32 }}>☆☆☆☆☆</Text>
    </View>
  );
}

export default function App() {
  const [rating, setRating] = useState(0);
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <StarRating value={rating} onChange={setRating} />
      <Text>Your rating: {rating}</Text>
    </View>
  );
}

@@solution
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

type StarRatingProps = { value: number; onChange: (value: number) => void };

export function StarRating({ value, onChange }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {stars.map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${n} ${n === 1 ? "star" : "stars"}`}
          onPress={() => onChange(n === value ? 0 : n)}
        >
          <Text style={{ fontSize: 32, color: "#f59e0b" }}>{n <= value ? "★" : "☆"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function App() {
  const [rating, setRating] = useState(0);
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <StarRating value={rating} onChange={setRating} />
      <Text>Your rating: {rating}</Text>
    </View>
  );
}

@@tests
test("Shows filled and empty stars for the value", () => {
  render(<StarRating value={3} onChange={() => {}} />);
  expect(screen.getAllByText("★")).toHaveLength(3);
  expect(screen.getAllByText("☆")).toHaveLength(2);
});

test("A value of 0 shows five empty stars", () => {
  render(<StarRating value={0} onChange={() => {}} />);
  expect(screen.getAllByText("☆")).toHaveLength(5);
  expect(screen.queryAllByText("★")).toHaveLength(0);
});

test("Each star has a label", () => {
  render(<StarRating value={0} onChange={() => {}} />);
  expect(screen.getByLabelText("Rate 1 star")).toBeOnTheScreen();
  expect(screen.getByLabelText("Rate 4 stars")).toBeOnTheScreen();
});

test("Tapping a star calls onChange with its number", () => {
  const onChange = jest.fn();
  render(<StarRating value={2} onChange={onChange} />);
  fireEvent.press(screen.getByLabelText("Rate 4 stars"));
  expect(onChange).toHaveBeenCalledWith(4);
});

test("Tapping the current rating clears it", () => {
  const onChange = jest.fn();
  render(<StarRating value={2} onChange={onChange} />);
  fireEvent.press(screen.getByLabelText("Rate 2 stars"));
  expect(onChange).toHaveBeenCalledWith(0);
});

test("Works inside the App", () => {
  render(<App />);
  fireEvent.press(screen.getByLabelText("Rate 5 stars"));
  expect(screen.getByText("Your rating: 5")).toBeOnTheScreen();
  expect(screen.getAllByText("★")).toHaveLength(5);
});

@@hint
`[1, 2, 3, 4, 5].map((n) => ...)` gives you each star's number. Compare it with `value` for the symbol.

@@hint
`onPress={() => onChange(n === value ? 0 : n)}`
:::

## What's next

You've finished Phase 1. You can build screens from typed components, lay them out with Flexbox, make them interactive with state, handle input and show lists, and test all of it.

In **Phase 2** you'll install Expo on your computer, run apps on your own phone, and build multi-screen apps with Expo Router.

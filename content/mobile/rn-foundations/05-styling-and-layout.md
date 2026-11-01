---
title: Styling and Flexbox layout
summary: StyleSheet, colours and spacing, text styles, and laying out any screen with Flexbox.
minutes: 55
kind: lesson
language: tsx
---

React Native has no CSS files. You style components with JavaScript objects whose property names look like CSS in camelCase: `backgroundColor`, `fontSize`, `marginTop`. Layout uses **Flexbox**, with a few defaults that differ from the web.

## StyleSheet

Inline `style={{ ... }}` objects are fine for experiments. Real apps define styles once with `StyleSheet.create`, below the component:

```tsx
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Good morning</Text>
      <Text style={styles.subtitle}>3 habits to go</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    backgroundColor: "#faf5ff",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#3b0764",
  },
  subtitle: {
    fontSize: 16,
    color: "#6b21a8",
    marginTop: 4,
  },
});
```

`StyleSheet.create` gives each style a name, keeps the JSX readable, and in a real project lets TypeScript check every property name and value.

## Units and colours

Sizes are plain numbers, with no `px`. They're **density-independent points**: `fontSize: 16` looks the same physical size on a cheap phone and on a high-resolution one, because the phone multiplies by its pixel density. Percentages work as strings: `width: "50%"`.

Colours can be names (`"white"`), hex (`"#7c3aed"`), `rgb(...)` or `rgba(...)` for transparency.

## Combining styles

Pass an **array** to combine styles. Later entries win, and `false`, `null` and `undefined` are skipped, which makes conditional styles easy:

```tsx
import { StyleSheet, Text, View } from "react-native";

function Chip({ label, selected }: { label: string; selected: boolean }) {
  return <Text style={[styles.chip, selected && styles.selected]}>{label}</Text>;
}

export default function App() {
  return (
    <View style={{ padding: 24, flexDirection: "row", gap: 8 }}>
      <Chip label="All" selected={true} />
      <Chip label="Today" selected={false} />
      <Chip label="Done" selected={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d4d4d8",
    color: "#3f3f46",
  },
  selected: {
    backgroundColor: "#7c3aed",
    borderColor: "#7c3aed",
    color: "white",
  },
});
```

## Spacing, borders and corners

The box model is like the web's: `padding` is inside the border, `margin` is outside. React Native adds handy shortcuts:

| Property | Means |
| --- | --- |
| `padding: 16` | all four sides |
| `paddingHorizontal: 16` | left and right |
| `paddingVertical: 8` | top and bottom |
| `marginTop`, `marginBottom`, ... | one side |
| `gap: 12` | space *between* children |

```tsx
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rounded card</Text>
        <Text>borderRadius, borderWidth and padding</Text>
      </View>
      <View style={[styles.card, styles.highlight]}>
        <Text style={styles.cardTitle}>Highlighted</Text>
        <Text>Same card, plus one extra style</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12, backgroundColor: "#f4f4f5" },
  card: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    gap: 4,
  },
  highlight: { borderColor: "#7c3aed", borderWidth: 2 },
  cardTitle: { fontSize: 18, fontWeight: "600" },
});
```

## Text styles don't inherit (mostly)

On the web, a `color` set on a `<div>` applies to all the text inside it. In React Native, a `View` can't have text styles at all. Only **nested `Text`** inherits from its parent `Text`:

```tsx
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <Text style={{ fontSize: 18, color: "#3f3f46" }}>
        You're on a <Text style={{ fontWeight: "700", color: "#7c3aed" }}>12-day</Text> streak.
      </Text>
    </View>
  );
}
```

The inner `Text` inherits the size and adds bold and a colour. This is how you style part of a sentence.

## Flexbox

Every `View` lays out its children with Flexbox. Three ideas cover most screens:

1. **`flexDirection`** sets the main axis. In React Native the default is **`"column"`** (top to bottom), unlike the web's `row`. Use `"row"` to put children side by side.
2. **`justifyContent`** places children along the main axis: `"flex-start"` (default), `"center"`, `"flex-end"`, `"space-between"`, `"space-around"`, `"space-evenly"`.
3. **`alignItems`** places children across the other axis: `"stretch"` (default), `"flex-start"`, `"center"`, `"flex-end"`.

Try changing the values in this cell and running it:

```tsx
import { StyleSheet, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <View style={[styles.box, { backgroundColor: "#7c3aed" }]} />
      <View style={[styles.box, { backgroundColor: "#0891b2" }]} />
      <View style={[styles.box, { backgroundColor: "#f59e0b" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row", // try "column"
    justifyContent: "space-between", // try "center", "flex-end", "space-evenly"
    alignItems: "center", // try "flex-start", "stretch" (and remove the box height)
    padding: 24,
  },
  box: { width: 70, height: 70, borderRadius: 12 },
});
```

## flex: 1 fills the space

`flex: 1` makes a child take up the remaining space along its parent's main axis. When several children have `flex`, they share the space in proportion:

```tsx
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 60, backgroundColor: "#7c3aed", justifyContent: "center", paddingHorizontal: 16 }}>
        <Text style={{ color: "white", fontSize: 18 }}>Header (fixed height)</Text>
      </View>
      <View style={{ flex: 2, backgroundColor: "#ede9fe", padding: 16 }}>
        <Text>flex: 2 (two thirds of what's left)</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: "#ddd6fe", padding: 16 }}>
        <Text>flex: 1 (one third)</Text>
      </View>
    </View>
  );
}
```

The outermost `View` of a screen almost always has `flex: 1`, so it fills the whole screen.

## A real layout: a list row

Most rows in apps are the same shape: something on the left, text in the middle that takes the remaining space, something on the right. That's a `row` with a `flex: 1` middle:

```tsx
import { StyleSheet, Text, View } from "react-native";

function HabitRow({ emoji, title, detail, streak }: { emoji: string; title: string; detail: string; streak: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.middle}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Text style={styles.streak}>🔥 {streak}</Text>
    </View>
  );
}

export default function App() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 10, backgroundColor: "#f4f4f5" }}>
      <HabitRow emoji="📚" title="Read" detail="20 minutes a day" streak={12} />
      <HabitRow emoji="🚶" title="Walk" detail="Every morning, before work" streak={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "white",
    borderRadius: 14,
  },
  emoji: { fontSize: 28 },
  middle: { flex: 1 },
  title: { fontSize: 17, fontWeight: "600" },
  detail: { color: "#71717a", marginTop: 2 },
  streak: { fontWeight: "600", color: "#ea580c" },
});
```

## Absolute positioning

`position: "absolute"` takes a view out of the layout and places it relative to its parent with `top`, `right`, `bottom` and `left`. It's useful for badges and floating buttons:

```tsx
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 18 }}>Floating action button →</Text>
      <View
        style={{
          position: "absolute",
          right: 24,
          bottom: 24,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: "#7c3aed",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 30, lineHeight: 34 }}>+</Text>
      </View>
    </View>
  );
}
```

## iOS and Android differences

Most styles behave the same on both platforms. Shadows are the classic exception: iOS uses `shadowColor`, `shadowOffset`, `shadowOpacity` and `shadowRadius`, while Android uses `elevation`. `Platform.select` picks a value per platform:

```tsx static
import { Platform, StyleSheet } from "react-native";

const styles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
});
```

(Recent React Native versions also support a cross-platform `boxShadow` style.) Always check your screens on both platforms: Expo Snack's iOS and Android previews make it easy.

:::exercise header-row A header row
Style the `Header` so its two texts sit **side by side**, pushed to opposite ends, and **vertically centred**: the title on the left, the date on the right.

The outer `View` has `testID="header"` so the tests can find it. Give it a style with `flexDirection`, `justifyContent` and `alignItems`, plus some padding of your choice.

@@starter
import { StyleSheet, Text, View } from "react-native";

export function Header() {
  return (
    <View testID="header" style={styles.header}>
      <Text style={styles.title}>Today</Text>
      <Text>Mon 3 Nov</Text>
    </View>
  );
}

export default function App() {
  return <Header />;
}

const styles = StyleSheet.create({
  header: {
    padding: 16,
  },
  title: { fontSize: 24, fontWeight: "700" },
});

@@solution
import { StyleSheet, Text, View } from "react-native";

export function Header() {
  return (
    <View testID="header" style={styles.header}>
      <Text style={styles.title}>Today</Text>
      <Text>Mon 3 Nov</Text>
    </View>
  );
}

export default function App() {
  return <Header />;
}

const styles = StyleSheet.create({
  header: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "700" },
});

@@tests
test("Children sit side by side", () => {
  render(<Header />);
  expect(screen.getByTestId("header")).toHaveStyle({ flexDirection: "row" });
});

test("Children are pushed to opposite ends", () => {
  render(<Header />);
  expect(screen.getByTestId("header")).toHaveStyle({ justifyContent: "space-between" });
});

test("Children are vertically centred", () => {
  render(<Header />);
  expect(screen.getByTestId("header")).toHaveStyle({ alignItems: "center" });
});

@@hint
`flexDirection: "row"` makes the main axis horizontal. Then `justifyContent` works left to right, and `alignItems` works top to bottom.
:::

:::exercise selected-style Conditional styles
`FilterChip` gets a `selected` prop. Using a style **array**, give the chip:

- always: the `chip` style,
- only when selected: the `selected` style, which makes the background `#7c3aed`.

Don't change the styles themselves: combine them.

@@starter
import { StyleSheet, Text, View } from "react-native";

export function FilterChip({ label, selected }: { label: string; selected: boolean }) {
  return (
    <Text testID={`chip-${label}`} style={styles.chip}>
      {label}
    </Text>
  );
}

export default function App() {
  return (
    <View style={{ flexDirection: "row", gap: 8, padding: 24 }}>
      <FilterChip label="All" selected />
      <FilterChip label="Done" selected={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#e4e4e7" },
  selected: { backgroundColor: "#7c3aed", color: "white" },
});

@@solution
import { StyleSheet, Text, View } from "react-native";

export function FilterChip({ label, selected }: { label: string; selected: boolean }) {
  return (
    <Text testID={`chip-${label}`} style={[styles.chip, selected && styles.selected]}>
      {label}
    </Text>
  );
}

export default function App() {
  return (
    <View style={{ flexDirection: "row", gap: 8, padding: 24 }}>
      <FilterChip label="All" selected />
      <FilterChip label="Done" selected={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#e4e4e7" },
  selected: { backgroundColor: "#7c3aed", color: "white" },
});

@@tests
test("A selected chip is purple", () => {
  render(<FilterChip label="All" selected />);
  expect(screen.getByTestId("chip-All")).toHaveStyle({ backgroundColor: "#7c3aed", color: "white" });
});

test("A selected chip keeps the base chip style", () => {
  render(<FilterChip label="All" selected />);
  expect(screen.getByTestId("chip-All")).toHaveStyle({ borderRadius: 999, paddingHorizontal: 12 });
});

test("An unselected chip is grey", () => {
  render(<FilterChip label="Done" selected={false} />);
  expect(screen.getByTestId("chip-Done")).toHaveStyle({ backgroundColor: "#e4e4e7" });
});

@@hint
`style={[styles.chip, selected && styles.selected]}`: when `selected` is false, the second entry is `false`, and it's skipped.
:::

:::exercise fill-screen Fill the screen
Build a `Screen` layout with three parts, top to bottom:

- a header `View` (`testID="top"`) with a fixed `height` of `56`,
- a content `View` (`testID="content"`) that **fills all the remaining space**,
- a footer `View` (`testID="bottom"`) with a fixed `height` of `64`.

The outer `View` (`testID="screen"`) must fill the whole screen too.

@@starter
import { Text, View } from "react-native";

export function Screen() {
  return (
    <View testID="screen">
      <View testID="top" style={{ backgroundColor: "#7c3aed" }}>
        <Text style={{ color: "white" }}>Header</Text>
      </View>
      <View testID="content">
        <Text>Content</Text>
      </View>
      <View testID="bottom" style={{ backgroundColor: "#e4e4e7" }}>
        <Text>Tab bar</Text>
      </View>
    </View>
  );
}

export default function App() {
  return <Screen />;
}

@@solution
import { Text, View } from "react-native";

export function Screen() {
  return (
    <View testID="screen" style={{ flex: 1 }}>
      <View testID="top" style={{ height: 56, backgroundColor: "#7c3aed" }}>
        <Text style={{ color: "white" }}>Header</Text>
      </View>
      <View testID="content" style={{ flex: 1 }}>
        <Text>Content</Text>
      </View>
      <View testID="bottom" style={{ height: 64, backgroundColor: "#e4e4e7" }}>
        <Text>Tab bar</Text>
      </View>
    </View>
  );
}

export default function App() {
  return <Screen />;
}

@@tests
test("The screen fills the whole space", () => {
  render(<Screen />);
  expect(screen.getByTestId("screen")).toHaveStyle({ flex: 1 });
});

test("The header and footer have fixed heights", () => {
  render(<Screen />);
  expect(screen.getByTestId("top")).toHaveStyle({ height: 56 });
  expect(screen.getByTestId("bottom")).toHaveStyle({ height: 64 });
});

test("The content fills the remaining space", () => {
  render(<Screen />);
  expect(screen.getByTestId("content")).toHaveStyle({ flex: 1 });
});

test("The header keeps its colour", () => {
  render(<Screen />);
  expect(screen.getByTestId("top")).toHaveStyle({ backgroundColor: "#7c3aed" });
});

@@hint
`flex: 1` on a child makes it take the space its siblings don't use. The parent needs `flex: 1` too, or it's only as tall as its children.
:::

:::quiz layout-check Quick check
? What is the default `flexDirection` in React Native?
- [x] `"column"`
- [ ] `"row"`
> Unlike the web, children stack top to bottom by default.

? In a `flexDirection: "row"` container, which property centres children vertically?
- [ ] `justifyContent: "center"`
- [x] `alignItems: "center"`
> `justifyContent` works along the main axis (horizontal in a row). `alignItems` works across it.

? `style={[styles.base, isActive && styles.active]}` with `isActive = false`. What happens?
- [x] Only `styles.base` applies
- [ ] It crashes because `false` isn't a style
- [ ] Both apply
> Falsy entries in a style array are skipped.

? You set `color: "red"` on a `View`. What colour is the `Text` inside?
- [ ] Red
- [x] The default (black): Views don't pass text styles to their children
> Only a parent `Text` passes text styles down, to nested `Text`.

? What does `fontSize: 16` mean?
- [ ] 16 physical pixels
- [x] 16 density-independent points, the same physical size on every screen
- [ ] 16% of the screen width
> React Native multiplies by the screen's pixel density for you.
:::

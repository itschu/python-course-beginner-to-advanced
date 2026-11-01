---
title: How mobile apps are built
summary: Native, cross-platform and web apps, how React Native turns your code into real native views, and your first component.
minutes: 35
kind: lesson
language: tsx
---

Welcome to the mobile course. By the end you'll have built, tested and published your own iPhone and Android app. This first phase teaches the foundations: components, styling, state, input and lists. Everything runs right here in your browser, so you don't need to install anything yet.

## Three ways to build a mobile app

There are roughly three ways to put an app on someone's phone:

| Approach | Languages | One codebase for iOS and Android? | Feels native? |
| --- | --- | --- | --- |
| **Native** | Swift (iOS), Kotlin (Android) | No: two separate apps | Yes |
| **Cross-platform** | React Native (TypeScript), Flutter (Dart) | Yes | Yes, with care |
| **Web app** | HTML, CSS, JavaScript in a browser | Yes | Usually not |

Native development gives you full control, but you build and maintain everything twice, in two languages. Web apps are easy to ship, but they can't fully use the phone and rarely feel like real apps.

**React Native** is in the middle. You write your app once in TypeScript using React, and it runs on iOS and Android with **real native views**: a `<Text>` in your code becomes a `UILabel` on an iPhone and a `TextView` on Android. Apps like Instagram, Discord, Shopify, Coinbase and Microsoft Teams use React Native.

## How React Native works

Your app has two parts:

1. **Your JavaScript** (written in TypeScript), which runs in a JavaScript engine on the phone called Hermes. It decides *what* the screen should show.
2. **The native side**, which draws real iOS or Android views and handles touches.

You describe the screen with **components**. React works out what changed since the last render and tells the native side to update just those views. You never touch the native views directly.

:::info Why TypeScript?
React Native code is JavaScript. Almost every professional team writes it in **TypeScript**: JavaScript plus types, which catch mistakes before you run the app. This course uses TypeScript from the start. Lesson 2 teaches what you need.
:::

## Expo: the easy way to run React Native

**Expo** is a set of tools and libraries on top of React Native, and the way the React Native team recommends starting new apps. With Expo you can:

- run your app on your own phone with the **Expo Go** app by scanning a QR code,
- try code in the browser with **Expo Snack**,
- build the iOS app in the cloud, so you never need a Mac,
- publish to the App Store and Google Play.

In Phase 2 you'll create an Expo project on your computer. For now, everything runs on this page.

## Your first component

Here is a complete React Native app. Press **Run**:

```tsx
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 24 }}>Hello from my phone!</Text>
    </View>
  );
}
```

The phone next to the output is a **simulator** that runs your code in the browser. Let's read the code line by line:

- `import { Text, View } from "react-native";` loads two **core components** from React Native. `View` is a container, like a box. `Text` shows text.
- `export default function App()` defines a **component**: a function that returns what should appear on the screen. `export default` makes it the app's main screen.
- `return ( ... )` returns **JSX**: the HTML-like syntax that describes the screen. `<View>` contains `<Text>`, just as a box contains a label.
- `style={{ ... }}` styles a component. `flex: 1` makes the view fill the screen, and the two other properties centre its children. You'll learn layout properly in lesson 5.

Change the text and run it again. Then press **Snack** to open the same code in Expo Snack, where you can run it on an iOS or Android preview, or on your own phone with Expo Go.

:::tip Run it on your phone today
Install **Expo Go** from the App Store or Google Play. In Snack, choose **My Device** and scan the QR code. Seeing your own code running on your own phone is the best motivation there is.
:::

## Components inside components

Apps are built from many small components. `App` can use components you write yourself:

```tsx
import { Text, View } from "react-native";

function Greeting() {
  return <Text style={{ fontSize: 22 }}>Welcome!</Text>;
}

function Subtitle() {
  return <Text style={{ color: "#666" }}>Your first React Native screen</Text>;
}

export default function App() {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Greeting />
      <Subtitle />
      <Greeting />
    </View>
  );
}
```

`<Greeting />` tells React to call the `Greeting` function and put whatever it returns in that spot. Component names must start with a **capital letter**: `<greeting />` would not work.

## Text must live inside Text

One rule surprises everyone coming from the web: **all text must be inside a `<Text>` component**. Run this:

```tsx expect-error
import { View } from "react-native";

export default function App() {
  return <View>Hello!</View>;
}
```

On a real phone this crashes the app with the same message. Native views can't hold loose text: only a text view can. Wrap it in `<Text>` and it works.

## Logging

`console.log` prints to the output panel, just as it prints to the terminal in a real Expo project. It's the quickest way to look inside your code:

```tsx
const appName = "Habit Tracker";
const habits = ["Read", "Walk", "Drink water"];

console.log("Building", appName);
console.log("Habits:", habits);
console.log("Number of habits:", habits.length);
```

This cell has no `export default`, so nothing appears on the phone: it's just code that runs.

## How exercises work

Each exercise has automatic tests. They are written with **Jest** and **React Native Testing Library**, the same tools professional React Native teams use. A typical test looks like this:

```tsx static
test("shows the app name", () => {
  render(<App />);
  expect(screen.getByText("Habit Tracker")).toBeOnTheScreen();
});
```

`render` draws your component off-screen, `screen.getByText` finds the `<Text>` showing that text (and fails if there isn't one), and `expect(...)` checks something. You'll learn to write tests like these yourself. For now, press **View tests** in any exercise to see exactly what's being checked.

:::exercise first-screen Your first screen
Change the app so it shows the text `Hello, React Native!` inside a `<Text>`.

Press **Run only** to see it on the phone, then **Check my code**.

@@starter
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Change me</Text>
    </View>
  );
}

@@solution
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Hello, React Native!</Text>
    </View>
  );
}

@@tests
test("Shows Hello, React Native!", () => {
  render(<App />);
  expect(screen.getByText("Hello, React Native!")).toBeOnTheScreen();
});

@@hint
Replace `Change me` with the exact text, including the comma and the exclamation mark.
:::

:::exercise two-lines Two lines of text
Make the app show two pieces of text, one below the other: `My Habits` and `0 done today`. Each needs its own `<Text>`.

@@starter
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <Text>My Habits</Text>
    </View>
  );
}

@@solution
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <Text>My Habits</Text>
      <Text>0 done today</Text>
    </View>
  );
}

@@tests
test("Shows the title My Habits", () => {
  render(<App />);
  expect(screen.getByText("My Habits")).toBeOnTheScreen();
});

test("Shows 0 done today in a separate Text", () => {
  render(<App />);
  expect(screen.getByText("0 done today")).toBeOnTheScreen();
});

@@hint
Add a second `<Text>...</Text>` inside the `<View>`, after the first one.
:::

:::exercise fix-loose-text Fix the crash
This app crashes because some text isn't inside a `<Text>`. Fix it so the screen shows `Welcome back` and `Let's keep your streak going`.

@@starter
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <Text style={{ fontSize: 22 }}>Welcome back</Text>
      Let's keep your streak going
    </View>
  );
}

@@solution
import { Text, View } from "react-native";

export default function App() {
  return (
    <View style={{ padding: 24 }}>
      <Text style={{ fontSize: 22 }}>Welcome back</Text>
      <Text>Let's keep your streak going</Text>
    </View>
  );
}

@@tests
test("Shows the welcome title", () => {
  render(<App />);
  expect(screen.getByText("Welcome back")).toBeOnTheScreen();
});

test("Shows the message inside a Text", () => {
  render(<App />);
  expect(screen.getByText("Let's keep your streak going")).toBeOnTheScreen();
});

@@hint
Wrap the loose sentence in `<Text>` and `</Text>`.
:::

:::quiz rn-intro-check Quick check
? What does a `<Text>` component become on an iPhone?
- [ ] An HTML `<p>` element inside a hidden browser
- [x] A real native text view (`UILabel`)
- [ ] A picture of the text
> React Native renders real native views. That's why apps feel native: they *are* native views, controlled from JavaScript.

? Which statements about React Native are true? (choose all that apply)
- [x] One codebase can run on iOS and Android
- [x] Your app's logic runs in a JavaScript engine on the phone
- [ ] You must own a Mac to build any React Native app
- [x] Components are functions that return JSX
> With Expo you can build iOS apps in the cloud, so a Mac is optional. The rest is how React Native works.

? Why does `<View>Hello</View>` crash?
- [ ] `View` can't have children
- [x] Text has to be inside a `<Text>` component
- [ ] "Hello" needs to be in quotes
> Native container views can't display text. Only text components can, so React Native refuses loose strings.

? What must a component's name start with?
- [ ] A lowercase letter
- [x] A capital letter
- [ ] The word `component`
> React treats `<lowercase>` tags as built-in elements and `<Capitalised>` tags as your components.
:::

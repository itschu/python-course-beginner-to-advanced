---
title: Text input and forms
summary: Controlled TextInputs, keyboards, numbers, validation, and forms that give clear feedback.
minutes: 55
kind: lesson
language: tsx
---

Almost every app asks people to type something: a habit name, a search, an email address. React Native's `TextInput` is the native text field, and forms are built from inputs plus state.

## A controlled TextInput

The standard pattern is a **controlled** input: the text lives in state, the input shows that state through `value`, and every keystroke updates it through `onChangeText`:

```tsx
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

export default function App() {
  const [name, setName] = useState("");
  return (
    <View style={styles.screen}>
      <TextInput style={styles.input} placeholder="Your name" value={name} onChangeText={setName} />
      <Text style={styles.greeting}>Hello, {name || "stranger"}!</Text>
      <Text style={styles.hint}>{name.length} characters</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 12 },
  input: { borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 10, padding: 12, fontSize: 16 },
  greeting: { fontSize: 22 },
  hint: { color: "#71717a" },
});
```

Type into the input on the phone. `onChangeText` receives the new text, so the setter can be passed directly. Because the text is in state, everything else on the screen can use it right away.

A `TextInput` has **no border by default**, so give it a style that looks like a field. Remember that text styles go on the input itself.

## Useful TextInput props

| Prop | Does |
| --- | --- |
| `placeholder` | Grey hint text when empty |
| `keyboardType` | `"default"`, `"numeric"`, `"decimal-pad"`, `"email-address"`, `"phone-pad"` |
| `secureTextEntry` | Hides the text, for passwords |
| `autoCapitalize` | `"none"`, `"sentences"` (default), `"words"`, `"characters"` |
| `autoCorrect` | `false` to turn off autocorrect (for emails and codes) |
| `maxLength` | Limits how many characters can be typed |
| `multiline` | A multi-line text area |
| `returnKeyType` | The return key's label: `"done"`, `"next"`, `"search"`, `"send"` |
| `onSubmitEditing` | Runs when the return key is pressed |
| `editable` | `false` makes it read-only |

Choosing the right `keyboardType` is a small detail that makes an app feel professional: nobody wants a full keyboard to type a number.

## Numbers from text

A `TextInput` always gives you a **string**. Convert it with `Number(...)`, and check for `NaN` ("not a number") before using it:

```tsx
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export default function App() {
  const [minutesText, setMinutesText] = useState("20");
  const minutes = Number(minutesText);
  const valid = minutesText.trim() !== "" && !Number.isNaN(minutes) && minutes > 0;

  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Text style={{ fontWeight: "600" }}>Minutes per day</Text>
      <TextInput
        keyboardType="numeric"
        value={minutesText}
        onChangeText={setMinutesText}
        style={{ borderWidth: 1, borderColor: valid ? "#d4d4d8" : "#dc2626", borderRadius: 10, padding: 12, fontSize: 16 }}
      />
      {valid ? (
        <Text>That's {minutes * 7} minutes a week.</Text>
      ) : (
        <Text style={{ color: "#dc2626" }}>Enter a number greater than 0</Text>
      )}
    </View>
  );
}
```

Keep the raw text in state (so the person can type freely, including an empty field) and work out the number from it on each render.

## Changing what was typed

Because you control the value, you can transform input as it's typed. This field only accepts digits:

```tsx
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export default function App() {
  const [code, setCode] = useState("");
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Text>Enter the 6-digit code</Text>
      <TextInput
        value={code}
        onChangeText={(text) => setCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
        keyboardType="number-pad"
        placeholder="123456"
        style={{ borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 10, padding: 12, fontSize: 24, letterSpacing: 8 }}
      />
      <Text style={{ color: "#71717a" }}>{6 - code.length} digits to go</Text>
    </View>
  );
}
```

Try typing letters: they never appear. `replace(/[^0-9]/g, "")` uses a regular expression to remove every character that isn't a digit.

## A small form

A form is several inputs, validation, and a submit button. A few habits make forms pleasant:

- **Disable** the submit button until the form can be submitted.
- **Trim** text, so `"  Read "` becomes `"Read"`.
- **Show errors** next to the field they're about, in words that say how to fix them.
- **Clear** the input after a successful submit.

```tsx
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function App() {
  const [title, setTitle] = useState("");
  const [habits, setHabits] = useState<string[]>([]);
  const trimmed = title.trim();
  const duplicate = habits.some((h) => h.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length > 0 && !duplicate;

  const add = () => {
    if (!canAdd) return;
    setHabits([...habits, trimmed]);
    setTitle("");
  };

  return (
    <View style={styles.screen}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="New habit"
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Pressable onPress={add} disabled={!canAdd} style={[styles.button, !canAdd && styles.disabled]}>
          <Text style={styles.buttonText}>Add</Text>
        </Pressable>
      </View>
      {duplicate && <Text style={styles.error}>You already have “{trimmed}”.</Text>}
      {habits.map((h) => (
        <Text key={h} style={styles.habit}>
          • {h}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 10 },
  row: { flexDirection: "row", gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 10, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#7c3aed", borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
  disabled: { opacity: 0.4 },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626" },
  habit: { fontSize: 18 },
});
```

A `disabled` `Pressable` ignores taps, and tests treat it the same way: `fireEvent.press` on a disabled button does nothing.

:::tip Forms on a real phone
On a real device the keyboard covers the bottom half of the screen. In Phase 2 you'll use `KeyboardAvoidingView` and scroll views so fields stay visible while typing. Libraries like React Hook Form help with big forms, but the ideas are the ones in this lesson.
:::

## Testing inputs

`fireEvent.changeText(input, "text")` types into a `TextInput`. Find inputs with `getByPlaceholderText`, or check what they show with `toHaveDisplayValue`:

```tsx static
test("clears the input after adding", () => {
  render(<AddHabit />);
  fireEvent.changeText(screen.getByPlaceholderText("New habit"), "Read");
  fireEvent.press(screen.getByText("Add"));
  expect(screen.getByPlaceholderText("New habit")).toHaveDisplayValue("");
});
```

:::exercise greeting-input Greet by name
Build `NameGreeting`: a `TextInput` with the placeholder `Your name`, and a `Text` below it.

- While the name is empty (or only spaces), the text says `Hello, stranger!`
- Otherwise it says `Hello, Ada!` with the **trimmed** name.

@@starter
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export function NameGreeting() {
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <TextInput placeholder="Your name" style={{ borderWidth: 1, borderColor: "#ccc", padding: 10 }} />
      <Text>Hello, stranger!</Text>
    </View>
  );
}

export default function App() {
  return <NameGreeting />;
}

@@solution
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export function NameGreeting() {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <TextInput
        placeholder="Your name"
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, borderColor: "#ccc", padding: 10 }}
      />
      <Text>Hello, {trimmed || "stranger"}!</Text>
    </View>
  );
}

export default function App() {
  return <NameGreeting />;
}

@@tests
test("Greets a stranger at first", () => {
  render(<NameGreeting />);
  expect(screen.getByText("Hello, stranger!")).toBeOnTheScreen();
});

test("Greets by name as you type", () => {
  render(<NameGreeting />);
  fireEvent.changeText(screen.getByPlaceholderText("Your name"), "Ada");
  expect(screen.getByText("Hello, Ada!")).toBeOnTheScreen();
});

test("Trims spaces from the name", () => {
  render(<NameGreeting />);
  fireEvent.changeText(screen.getByPlaceholderText("Your name"), "  Grace  ");
  expect(screen.getByText("Hello, Grace!")).toBeOnTheScreen();
});

test("Only spaces counts as empty", () => {
  render(<NameGreeting />);
  fireEvent.changeText(screen.getByPlaceholderText("Your name"), "   ");
  expect(screen.getByText("Hello, stranger!")).toBeOnTheScreen();
});

test("The input shows what was typed", () => {
  render(<NameGreeting />);
  fireEvent.changeText(screen.getByPlaceholderText("Your name"), "Ada");
  expect(screen.getByPlaceholderText("Your name")).toHaveDisplayValue("Ada");
});

@@hint
Keep the name in state with `value` and `onChangeText`. Then `name.trim() || "stranger"` picks the right word.
:::

:::exercise char-limit A character counter
Build `NoteInput`: a multiline `TextInput` (placeholder `Write a note`) and a `Text` counter like `12/50`.

Notes can be at most **50 characters**: if more is typed (or pasted), keep only the first 50. The counter shows how many characters the note has.

@@starter
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

const MAX = 50;

export function NoteInput() {
  const [note, setNote] = useState("");
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <TextInput
        multiline
        placeholder="Write a note"
        value={note}
        onChangeText={setNote}
        style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, minHeight: 80 }}
      />
      <Text>0/{MAX}</Text>
    </View>
  );
}

export default function App() {
  return <NoteInput />;
}

@@solution
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

const MAX = 50;

export function NoteInput() {
  const [note, setNote] = useState("");
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <TextInput
        multiline
        placeholder="Write a note"
        value={note}
        onChangeText={(text) => setNote(text.slice(0, MAX))}
        style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, minHeight: 80 }}
      />
      <Text>
        {note.length}/{MAX}
      </Text>
    </View>
  );
}

export default function App() {
  return <NoteInput />;
}

@@tests
test("Starts at 0/50", () => {
  render(<NoteInput />);
  expect(screen.getByText("0/50")).toBeOnTheScreen();
});

test("Counts the characters typed", () => {
  render(<NoteInput />);
  fireEvent.changeText(screen.getByPlaceholderText("Write a note"), "Drink water");
  expect(screen.getByText("11/50")).toBeOnTheScreen();
});

test("Keeps only the first 50 characters", () => {
  render(<NoteInput />);
  const input = screen.getByPlaceholderText("Write a note");
  fireEvent.changeText(input, "x".repeat(70));
  expect(input).toHaveDisplayValue("x".repeat(50));
  expect(screen.getByText("50/50")).toBeOnTheScreen();
});

@@hint
The counter is `{note.length}/{MAX}`: work it out from state, don't store it.

@@hint
Shorten the text before storing it: `onChangeText={(text) => setNote(text.slice(0, MAX))}`.
:::

:::exercise add-habit-form An add-habit form
Build `AddHabitForm` with an `onAdd` prop. It has a `TextInput` (placeholder `New habit`) and a `Pressable` with the text `Add`.

- The button is **disabled** while the trimmed text is empty.
- Pressing `Add` calls `onAdd` with the **trimmed** title, then **clears** the input.
- Pressing the keyboard's return key (`onSubmitEditing`) does the same.

@@starter
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

type AddHabitFormProps = { onAdd: (title: string) => void };

export function AddHabitForm({ onAdd }: AddHabitFormProps) {
  const [title, setTitle] = useState("");
  return (
    <View style={{ flexDirection: "row", gap: 8, padding: 16 }}>
      <TextInput
        placeholder="New habit"
        value={title}
        onChangeText={setTitle}
        style={{ flex: 1, borderWidth: 1, borderColor: "#ccc", padding: 10 }}
      />
      <Pressable onPress={() => onAdd(title)} style={{ backgroundColor: "#7c3aed", padding: 12 }}>
        <Text style={{ color: "white" }}>Add</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  return <AddHabitForm onAdd={(title) => console.log("Added:", title)} />;
}

@@solution
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

type AddHabitFormProps = { onAdd: (title: string) => void };

export function AddHabitForm({ onAdd }: AddHabitFormProps) {
  const [title, setTitle] = useState("");
  const trimmed = title.trim();
  const submit = () => {
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  };
  return (
    <View style={{ flexDirection: "row", gap: 8, padding: 16 }}>
      <TextInput
        placeholder="New habit"
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        style={{ flex: 1, borderWidth: 1, borderColor: "#ccc", padding: 10 }}
      />
      <Pressable
        onPress={submit}
        disabled={!trimmed}
        style={{ backgroundColor: "#7c3aed", padding: 12, opacity: trimmed ? 1 : 0.4 }}
      >
        <Text style={{ color: "white" }}>Add</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  return <AddHabitForm onAdd={(title) => console.log("Added:", title)} />;
}

@@tests
test("The button is disabled while the input is empty", () => {
  const onAdd = jest.fn();
  render(<AddHabitForm onAdd={onAdd} />);
  expect(screen.getByText("Add")).toBeDisabled();
  fireEvent.press(screen.getByText("Add"));
  expect(onAdd).not.toHaveBeenCalled();
});

test("Only spaces still counts as empty", () => {
  const onAdd = jest.fn();
  render(<AddHabitForm onAdd={onAdd} />);
  fireEvent.changeText(screen.getByPlaceholderText("New habit"), "   ");
  fireEvent.press(screen.getByText("Add"));
  expect(onAdd).not.toHaveBeenCalled();
});

test("Add sends the trimmed title and clears the input", () => {
  const onAdd = jest.fn();
  render(<AddHabitForm onAdd={onAdd} />);
  fireEvent.changeText(screen.getByPlaceholderText("New habit"), "  Read  ");
  expect(screen.getByText("Add")).toBeEnabled();
  fireEvent.press(screen.getByText("Add"));
  expect(onAdd).toHaveBeenCalledWith("Read");
  expect(screen.getByPlaceholderText("New habit")).toHaveDisplayValue("");
});

test("The return key submits too", () => {
  const onAdd = jest.fn();
  render(<AddHabitForm onAdd={onAdd} />);
  const input = screen.getByPlaceholderText("New habit");
  fireEvent.changeText(input, "Walk");
  fireEvent(input, "submitEditing");
  expect(onAdd).toHaveBeenCalledWith("Walk");
  expect(input).toHaveDisplayValue("");
});

@@hint
Write one `submit` function that checks the trimmed title, calls `onAdd`, and clears the state. Use it for both `onPress` and `onSubmitEditing`.

@@hint
`disabled={!trimmed}` on the `Pressable`: an empty string is falsy.
:::

:::exercise sign-in-form Validation messages
Build `SignInForm` with an `onSubmit` prop. It has two inputs (placeholders `Email` and `Password`, the password with `secureTextEntry`) and a `Sign in` button.

When `Sign in` is pressed:

- if the email doesn't contain `@`, show `Enter a valid email`,
- if the password has fewer than 8 characters, show `Password must be at least 8 characters`,
- show both messages if both are wrong, and don't call `onSubmit`,
- if both are fine, call `onSubmit({ email, password })` with the email trimmed, and show no messages.

Show no messages before the first press.

@@starter
import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";

type Credentials = { email: string; password: string };

export function SignInForm({ onSubmit }: { onSubmit: (c: Credentials) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signIn = () => {
    onSubmit({ email, password });
  };

  return (
    <View style={{ padding: 24, gap: 10 }}>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Button title="Sign in" onPress={signIn} />
    </View>
  );
}

export default function App() {
  return <SignInForm onSubmit={(c) => console.log("Signing in", c.email)} />;
}

@@solution
import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";

type Credentials = { email: string; password: string };

export function SignInForm({ onSubmit }: { onSubmit: (c: Credentials) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const signIn = () => {
    const found: string[] = [];
    if (!email.includes("@")) found.push("Enter a valid email");
    if (password.length < 8) found.push("Password must be at least 8 characters");
    setErrors(found);
    if (found.length === 0) onSubmit({ email: email.trim(), password });
  };

  return (
    <View style={{ padding: 24, gap: 10 }}>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {errors.map((e) => (
        <Text key={e} style={{ color: "#dc2626" }}>
          {e}
        </Text>
      ))}
      <Button title="Sign in" onPress={signIn} />
    </View>
  );
}

export default function App() {
  return <SignInForm onSubmit={(c) => console.log("Signing in", c.email)} />;
}

@@tests
const fill = (email: string, password: string) => {
  fireEvent.changeText(screen.getByPlaceholderText("Email"), email);
  fireEvent.changeText(screen.getByPlaceholderText("Password"), password);
  fireEvent.press(screen.getByText("Sign in"));
};

test("No messages before the first press", () => {
  render(<SignInForm onSubmit={() => {}} />);
  expect(screen.queryByText("Enter a valid email")).toBeNull();
  expect(screen.queryByText("Password must be at least 8 characters")).toBeNull();
});

test("A bad email shows a message and doesn't submit", () => {
  const onSubmit = jest.fn();
  render(<SignInForm onSubmit={onSubmit} />);
  fill("ada.example.com", "correct horse");
  expect(screen.getByText("Enter a valid email")).toBeOnTheScreen();
  expect(screen.queryByText("Password must be at least 8 characters")).toBeNull();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("A short password shows a message", () => {
  const onSubmit = jest.fn();
  render(<SignInForm onSubmit={onSubmit} />);
  fill("ada@example.com", "short");
  expect(screen.getByText("Password must be at least 8 characters")).toBeOnTheScreen();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("Both problems show both messages", () => {
  render(<SignInForm onSubmit={() => {}} />);
  fill("nope", "1234");
  expect(screen.getByText("Enter a valid email")).toBeOnTheScreen();
  expect(screen.getByText("Password must be at least 8 characters")).toBeOnTheScreen();
});

test("Valid details submit, with the email trimmed", () => {
  const onSubmit = jest.fn();
  render(<SignInForm onSubmit={onSubmit} />);
  fill("  ada@example.com ", "correct horse");
  expect(onSubmit).toHaveBeenCalledWith({ email: "ada@example.com", password: "correct horse" });
  expect(screen.queryByText("Enter a valid email")).toBeNull();
});

test("Fixing the problem clears the message on the next press", () => {
  render(<SignInForm onSubmit={() => {}} />);
  fill("nope", "correct horse");
  fill("ada@example.com", "correct horse");
  expect(screen.queryByText("Enter a valid email")).toBeNull();
});

test("The password is hidden", () => {
  render(<SignInForm onSubmit={() => {}} />);
  expect(screen.getByPlaceholderText("Password")).toHaveProp("secureTextEntry", true);
});

@@hint
Keep the error messages in state, as an array of strings. Work out the list when `Sign in` is pressed, and store it.

@@hint
Render them with `errors.map((e) => <Text key={e}>{e}</Text>)`, and only call `onSubmit` when the list is empty.
:::

:::quiz input-check Quick check
? What type of value does `onChangeText` give you?
- [x] Always a string
- [ ] A number when `keyboardType="numeric"`
- [ ] An event object
> Even with a numeric keyboard you get a string. Convert it with `Number(...)` and check for `NaN`.

? What makes a TextInput "controlled"?
- [ ] It has a `placeholder`
- [x] Its text lives in state, passed in with `value` and updated with `onChangeText`
- [ ] It's inside a form component
> Because the state is the source of truth, you can validate, transform or clear the text at any time.

? Which keyboard should a field for an email address use?
- [ ] `keyboardType="default"`
- [x] `keyboardType="email-address"`, with `autoCapitalize="none"`
- [ ] `secureTextEntry`
> The email keyboard puts `@` and `.` on the first screen, and turning off capitalisation avoids "Ada@..." surprises.

? You press a `Pressable` that has `disabled={true}`. What happens?
- [x] Nothing: `onPress` isn't called
- [ ] `onPress` is called with `disabled` as an argument
- [ ] It crashes
> Disabled pressables ignore taps, on phones and in tests.
:::

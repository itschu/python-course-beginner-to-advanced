/**
 * Tests for the React Native simulator (lib/mobile/rn-runtime.mjs): rendering, hooks, the
 * testing library, the preview's event handling, and the error messages learners see.
 * The lessons (npm run validate:mobile) exercise it too; these cover behaviour they don't.
 *
 * Usage:  node scripts/test_rn_runtime.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { transform } from "sucrase";

import { runCode } from "../lib/mobile/rn-runtime.mjs";

async function run(code, tests) {
  const out = { stdout: "", stderr: "" };
  const result = await runCode({ code, tests, transform, log: (stream, text) => (out[stream] += text) });
  return { ...result, ...out };
}

const passed = (r) => r.tests?.every((t) => t.passed);
const failures = (r) => r.tests?.filter((t) => !t.passed).map((t) => `${t.description}: ${t.error}`);
const find = (nodes, predicate) => {
  for (const n of nodes) {
    if (predicate(n)) return n;
    const found = n.children && find(n.children, predicate);
    if (found) return found;
  }
  return undefined;
};

test("renders a default export for the preview and handles taps", async () => {
  const r = await run(`
    import { useState } from "react";
    import { Button, Text, View } from "react-native";
    export default function App() {
      const [n, setN] = useState(0);
      return <View><Text testID="n">{n}</Text><Button title="Add" onPress={() => setN(n + 1)} /></View>;
    }`);
  assert.equal(r.ok, true, r.error);
  const button = find(r.app.tree(), (n) => n.props?.button);
  r.app.dispatch(button.id, "press");
  r.app.dispatch(button.id, "press");
  const count = find(r.app.tree(), (n) => n.props?.testID === "n");
  assert.equal(count.children[0].text, "2");
  r.app.dispatch(find(r.app.tree(), (n) => n.type === "View").id, "press"); // nothing to press: no crash
});

test("typing into a controlled TextInput in the preview", async () => {
  const r = await run(`
    import { useState } from "react";
    import { Text, TextInput, View } from "react-native";
    export default function App() {
      const [t, setT] = useState("");
      return <View><TextInput value={t} onChangeText={(x) => setT(x.toUpperCase())} /><Text>{t}</Text></View>;
    }`);
  const input = find(r.app.tree(), (n) => n.type === "TextInput");
  r.app.dispatch(input.id, "changeText", ["abc"]);
  assert.equal(find(r.app.tree(), (n) => n.type === "TextInput").props.value, "ABC");
});

test("grades with Jest and React Native Testing Library", async () => {
  const r = await run(
    `
    import { useEffect, useState, createContext, useContext } from "react";
    import { FlatList, Pressable, Switch, Text, TextInput, View } from "react-native";
    const Theme = createContext("light");
    function Label() { return <Text>Theme: {useContext(Theme)}</Text>; }
    export function Themed() {
      const [dark, setDark] = useState(false);
      return <Theme.Provider value={dark ? "dark" : "light"}><Label /><Switch testID="sw" value={dark} onValueChange={setDark} /></Theme.Provider>;
    }
    export function Loader({ load }: { load: () => Promise<string> }) {
      const [data, setData] = useState<string | null>(null);
      useEffect(() => { load().then(setData); }, [load]);
      return <Text>{data ? "Loaded " + data : "Loading"}</Text>;
    }
    export function Ticker() {
      const [s, setS] = useState(0);
      useEffect(() => { const id = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(id); }, []);
      return <Text>Seconds: {s}</Text>;
    }
    export function List({ items }: { items: string[] }) {
      return <FlatList data={items} keyExtractor={(i) => i} renderItem={({ item }) => <Text>{item}</Text>} ListEmptyComponent={<Text>Empty</Text>} />;
    }
    export function Form({ onSave }: { onSave: (t: string) => void }) {
      const [t, setT] = useState("");
      return <View><TextInput placeholder="Name" value={t} onChangeText={setT} /><Pressable disabled={!t} onPress={() => onSave(t)}><Text>Save</Text></Pressable></View>;
    }`,
    `
    test("context", () => {
      render(<Themed />);
      fireEvent(screen.getByTestId("sw"), "valueChange", true);
      expect(screen.getByText("Theme: dark")).toBeOnTheScreen();
    });
    test("async effects with findBy", async () => {
      render(<Loader load={() => Promise.resolve("42")} />);
      expect(await screen.findByText("Loaded 42")).toBeTruthy();
    });
    test("fake timers", () => {
      jest.useFakeTimers();
      render(<Ticker />);
      jest.advanceTimersByTime(3000);
      expect(screen.getByText("Seconds: 3")).toBeOnTheScreen();
    });
    test("lists", () => {
      render(<List items={[]} />);
      expect(screen.getByText("Empty")).toBeOnTheScreen();
      render(<List items={["a", "b"]} />);
      expect(screen.getAllByText(/^[ab]$/)).toHaveLength(2);
    });
    test("disabled pressables ignore taps", () => {
      const onSave = jest.fn();
      render(<Form onSave={onSave} />);
      expect(screen.getByText("Save")).toBeDisabled();
      fireEvent.press(screen.getByText("Save"));
      expect(onSave).not.toHaveBeenCalled();
      fireEvent.changeText(screen.getByPlaceholderText("Name"), "Ada");
      fireEvent.press(screen.getByText("Save"));
      expect(onSave).toHaveBeenCalledWith("Ada");
    });
    test("a failing test", () => {
      render(<List items={["a"]} />);
      expect(screen.getByText("b")).toBeTruthy();
    });`,
  );
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(failures(r), [failures(r).find((f) => f.startsWith("a failing test"))]);
  assert.match(failures(r)[0], /Unable to find an element with text: "b"/);
});

test("text outside <Text> fails like on a phone", async () => {
  const r = await run(`import { View } from "react-native";\nexport default function App() { return <View>hi</View>; }`);
  assert.equal(r.ok, false);
  assert.match(r.error, /Text strings must be rendered within a <Text> component/);
});

test("warns about missing keys, naming the component", async () => {
  const r = await run(`
    import { Text, View } from "react-native";
    function Items() { return <View>{["a", "b"].map((x) => <Text>{x}</Text>)}</View>; }
    export default function App() { return <Items />; }`);
  assert.equal(r.ok, true);
  assert.match(r.stderr, /unique "key" prop.*`Items`/);
});

test("children passed through a wrapper don't need keys", async () => {
  const r = await run(`
    import { Text, View } from "react-native";
    function Card({ children }: { children: React.ReactNode }) { return <View><Text>Title</Text>{children}</View>; }
    export default function App() { return <Card><Text>One</Text><Text>Two</Text></Card>; }`);
  assert.equal(r.stderr, "");
});

test("setState during render is reported", async () => {
  const r = await run(`
    import { useState } from "react";
    import { Text } from "react-native";
    export default function App() { const [n, setN] = useState(0); setN(n + 1); return <Text>{n}</Text>; }`);
  assert.match(r.error, /Too many re-renders/);
});

test("conditional hooks are reported", async () => {
  const r = await run(
    `
    import { useState } from "react";
    import { Button, Text, View } from "react-native";
    export function Bad() {
      const [on, setOn] = useState(false);
      if (on) { const [x] = useState(1); }
      return <Button title="Go" onPress={() => setOn(true)} />;
    }`,
    `test("x", () => { render(<Bad />); fireEvent.press(screen.getByText("Go")); });`,
  );
  assert.match(failures(r)[0], /more hooks than during the previous render/);
});

test("runtime errors point at the learner's line", async () => {
  const r = await run(`import { Text } from "react-native";\nexport default function App() {\n  const x: any = null;\n  return <Text>{x.name}</Text>;\n}`);
  assert.match(r.error, /TypeError.*\n\s+at line 4 of your code/);
});

test("syntax errors give a line and column", async () => {
  const r = await run(`const a = ;`);
  assert.match(r.error, /^SyntaxError: .*\(line 1, column \d+\)/);
});

test("unknown modules explain what's available", async () => {
  const r = await run(`import { CameraView } from "expo-camera";\nconsole.log(CameraView);`);
  assert.match(r.error, /Cannot find module 'expo-camera'.*Expo Snack/);
});

test("console.log formats values", async () => {
  const r = await run(`console.log("hi", { a: [1, 2] }, 3, null);`);
  assert.equal(r.stdout, "hi { a: [1, 2] } 3 null\n");
});

test("the learner's source is available to tests", async () => {
  const r = await run(`const answer = 42;`, `test("source", () => { expect(source).toMatch(/answer = 42/); });`);
  assert.ok(passed(r), String(failures(r)));
});

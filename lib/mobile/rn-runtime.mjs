/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps --
   This file implements React's hooks, so it manages hook state and dependency lists itself. */
/**
 * A small React Native simulator for the mobile course.
 *
 * It runs learner code (TypeScript + JSX) without a phone: a compact React-compatible renderer
 * (function components and hooks), the core React Native components (View, Text, Pressable,
 * TextInput, FlatList, …) and a subset of Jest and React Native Testing Library to grade
 * exercises. The browser runs it in a Web Worker (lib/mobile/rn-worker.ts) and draws the
 * rendered tree as a phone preview; scripts/validate_mobile.mjs runs the same file in Node.
 *
 * It is plain JavaScript with no imports so both can load it. The TypeScript compiler is passed
 * in: `transform` is Sucrase's transform function.
 *
 * What it doesn't do: type checking (types are stripped), class components, Suspense,
 * native modules, real layout measurement or virtualised lists (every list item is rendered).
 */

// ------------------------------------------------------------------ elements

const ELEMENT = Symbol.for("rnsim.element");
const FRAGMENT = Symbol.for("rnsim.fragment");
const PROVIDER = Symbol.for("rnsim.provider");
const CONSUMER = Symbol.for("rnsim.consumer");

/** Arrays passed as JSX children ({items.map(…)}): their elements need keys. */
const dynamicLists = new WeakSet();

function createElement(type, config, ...children) {
  for (const child of children) {
    if (Array.isArray(child)) dynamicLists.add(child);
    // Written as separate JSX children, so they don't need keys even if passed on as a list later.
    else if (child && child.$$typeof === ELEMENT) child._validated = true;
  }
  const props = {};
  let key = null;
  if (config != null) {
    for (const name in config) {
      if (name === "key") {
        if (config.key != null) key = String(config.key);
      } else if (name !== "__self" && name !== "__source") {
        props[name] = config[name];
      }
    }
  }
  if (children.length === 1) props.children = children[0];
  else if (children.length > 1) props.children = children;
  if (type && typeof type === "function" && type.defaultProps) {
    for (const name in type.defaultProps) if (props[name] === undefined) props[name] = type.defaultProps[name];
  }
  return { $$typeof: ELEMENT, type, key, props };
}

const isValidElement = (value) => Boolean(value && value.$$typeof === ELEMENT);

/** Pass props.children on to another element without turning several children into a "list". */
const spread = (children) => (Array.isArray(children) && !dynamicLists.has(children) ? children : [children]);

function cloneElement(element, config, ...children) {
  const props = { ...element.props };
  let key = element.key;
  if (config) {
    for (const name in config) {
      if (name === "key") key = config.key == null ? key : String(config.key);
      else props[name] = config[name];
    }
  }
  if (children.length === 1) props.children = children[0];
  else if (children.length > 1) props.children = children;
  return { $$typeof: ELEMENT, type: element.type, key, props };
}

function toChildArray(children) {
  const out = [];
  const walk = (c) => {
    if (c == null || typeof c === "boolean") return;
    if (Array.isArray(c)) c.forEach(walk);
    else out.push(c);
  };
  walk(children);
  return out;
}

const Children = {
  toArray: toChildArray,
  map: (children, fn) => toChildArray(children).map(fn),
  forEach: (children, fn) => toChildArray(children).forEach(fn),
  count: (children) => toChildArray(children).length,
  only: (children) => {
    const all = toChildArray(children);
    if (all.length !== 1 || !isValidElement(all[0])) throw new Error("React.Children.only expected to receive a single React element child.");
    return all[0];
  },
};

function createContext(defaultValue) {
  const context = { _defaultValue: defaultValue, displayName: undefined };
  context.Provider = { $$typeof: PROVIDER, _context: context };
  context.Consumer = { $$typeof: CONSUMER, _context: context };
  return context;
}

function componentName(type) {
  if (typeof type === "string") return type;
  if (typeof type === "function") return type.displayName || type.name || "Anonymous";
  if (type === FRAGMENT) return "Fragment";
  if (type && type.$$typeof === PROVIDER) return "Context.Provider";
  if (type && type.$$typeof === CONSUMER) return "Context.Consumer";
  return String(type);
}

// ------------------------------------------------------------------ the renderer

let nextNodeId = 1;
/** The component currently rendering, for hooks. */
let current = null;
let hookIndex = 0;

const HOOK_ORDER_ERROR = (name) =>
  `React has detected a change in the order of Hooks called by ${name}. Hooks must be called in the same order on every render: don't call them inside conditions, loops or after an early return.`;

function depsChanged(prev, next) {
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  return next.some((d, i) => !Object.is(d, prev[i]));
}

/**
 * A rendered tree. Nodes:
 *   host:     { kind: "host", type: "View", props, children }
 *   text:     { kind: "text", text }
 *   comp:     { kind: "comp", type: fn, props, hooks, children }
 *   frag / provider / consumer: { kind, props, children }
 */
class Root {
  constructor(options = {}) {
    this.kind = "root";
    this.children = [];
    this.parent = null;
    this.depth = 0;
    this.dirty = new Set();
    this.effects = [];
    this.scheduled = false;
    this.listeners = new Set();
    this.error = null;
    this.mounted = true;
    this.log = options.log ?? (() => {});
    this.describe = options.describe ?? formatError;
    this.warned = new Set();
    this.nodes = new Map();
  }

  render(element) {
    this.error = null;
    this.batch(() => this.reconcile(this, element, "App"));
  }

  unmount() {
    for (const child of this.children) this.unmountNode(child);
    this.children = [];
    this.mounted = false;
    this.dirty.clear();
    this.notify();
  }

  warnOnce(key, message) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.log("stderr", `Warning: ${message}\n`);
  }

  /** Run fn, then render everything it made dirty and run effects, synchronously. */
  batch(fn) {
    let result;
    try {
      result = fn();
    } finally {
      this.flush();
    }
    return result;
  }

  schedule(node) {
    if (!this.mounted) return;
    this.dirty.add(node);
    if (!this.scheduled && !this.flushing) {
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        try {
          this.flush();
        } catch (error) {
          this.fail(error);
        }
      });
    }
  }

  fail(error) {
    this.error = error;
    this.log("stderr", this.describe(error) + "\n");
    this.notify();
  }

  flush() {
    if (this.flushing) return;
    this.flushing = true;
    let rounds = 0;
    try {
      while (this.dirty.size > 0 || this.effects.length > 0) {
        if (++rounds > 60) {
          this.dirty.clear();
          this.effects = [];
          throw new Error(
            "Too many re-renders. Your component keeps updating state on every render, so it never finishes rendering. Check for a setState call in the component body or in a useEffect without the right dependencies.",
          );
        }
        if (this.dirty.size > 0) {
          const nodes = [...this.dirty].sort((a, b) => a.depth - b.depth);
          this.dirty.clear();
          for (const node of nodes) {
            if (!node.unmounted && node.needsRender) this.renderComposite(node);
          }
        }
        this.runEffects();
      }
    } finally {
      this.flushing = false;
    }
    this.notify();
  }

  runEffects() {
    const effects = this.effects;
    this.effects = [];
    for (const effect of effects) {
      if (effect.hook.cleanup) {
        const cleanup = effect.hook.cleanup;
        effect.hook.cleanup = null;
        cleanup();
      }
    }
    for (const effect of effects) {
      if (effect.node.unmounted) continue;
      const cleanup = effect.fn();
      if (typeof cleanup === "function") effect.hook.cleanup = cleanup;
      else if (cleanup !== undefined && !(cleanup && typeof cleanup.then === "function")) {
        // React ignores anything else, but a promise means an async effect, which is a common mistake.
      } else if (cleanup && typeof cleanup.then === "function") {
        this.warnOnce(
          "async-effect",
          "useEffect must not return a promise. Write the async function inside the effect and call it: useEffect(() => { async function load() { … } load(); }, []);",
        );
      }
    }
  }

  notify() {
    for (const listener of this.listeners) listener();
  }

  // -------- reconciliation

  register(node, parent) {
    node.parent = parent;
    node.depth = parent.depth + 1;
    node.id = nextNodeId++;
    node.root = this;
    this.nodes.set(node.id, node);
    return node;
  }

  reconcile(parent, children, ownerName) {
    const entries = [];
    const add = (child, keyPath, inArray) => {
      if (child == null || typeof child === "boolean") return;
      if (Array.isArray(child)) {
        child.forEach((c, i) => add(c, `${keyPath}/${isValidElement(c) && c.key != null ? "k" + c.key : "i" + i}`, true));
        return;
      }
      if (inArray && isValidElement(child) && child.key == null && !child._validated) {
        this.warnOnce(
          `key:${ownerName}`,
          `Each child in a list should have a unique "key" prop. Check the render method of \`${ownerName}\`. Add key={…} to the element you return from .map(), using something unique like an id.`,
        );
      }
      if (typeof child === "object" && !isValidElement(child)) {
        throw new Error(
          `Objects are not valid as a React child (found: object with keys {${Object.keys(child).join(", ")}}). Render a value from it, like {item.name}, instead of the whole object.`,
        );
      }
      if (typeof child === "function") {
        this.warnOnce(`fn:${ownerName}`, `Functions are not valid as a React child (in ${ownerName}). Did you mean to call it, or write <Component /> instead of Component?`);
        return;
      }
      entries.push({ key: keyPath, child });
    };
    const top = Array.isArray(children) && !dynamicLists.has(children) ? children : [children];
    top.forEach((c, i) => add(c, `p${i}`, false));
    // Keyed elements at the top level keep their identity when siblings move.
    for (const e of entries) {
      if (isValidElement(e.child) && e.child.key != null && !e.key.includes("/")) e.key = "k" + e.child.key;
    }

    const seen = new Set();
    for (const e of entries) {
      if (seen.has(e.key)) {
        this.warnOnce(`dupe:${ownerName}:${e.key}`, `Encountered two children with the same key, "${e.key.replace(/^.*\/?k/, "")}", in ${ownerName}. Keys must be unique among siblings.`);
        e.key += `#${seen.size}`;
      }
      seen.add(e.key);
    }

    const previous = new Map(parent.children.map((c) => [c.key, c]));
    const next = [];
    for (const { key, child } of entries) {
      const prev = previous.get(key);
      if (prev && sameType(prev, child)) {
        previous.delete(key);
        this.update(prev, child);
        next.push(prev);
      } else {
        next.push(this.mount(child, parent, key));
      }
    }
    for (const stale of previous.values()) this.unmountNode(stale);
    parent.children = next;
    let host = parent;
    while (host.kind !== "host" && host.kind !== "root") host = host.parent;
    this.checkText(host);
  }

  /** React Native only allows strings inside <Text>. */
  checkText(parent) {
    const hostParent = parent.kind === "root" ? null : parent;
    if (hostParent && (hostParent.type === "Text")) return;
    const findText = (nodes) => {
      for (const n of nodes) {
        if (n.kind === "text") return n;
        if (n.kind !== "host") {
          const t = findText(n.children);
          if (t) return t;
        }
      }
      return null;
    };
    const text = findText(parent.children);
    if (text) {
      const where = hostParent ? `<${hostParent.type}>` : "the root of your app";
      throw new Error(
        `Text strings must be rendered within a <Text> component. Found "${text.text}" directly inside ${where}. Wrap it: <Text>${text.text}</Text>`,
      );
    }
  }

  mount(child, parent, key) {
    if (typeof child === "string" || typeof child === "number") {
      return this.register({ kind: "text", text: String(child), key, children: [] }, parent);
    }
    const { type, props } = child;
    if (type === undefined || type === null || (typeof type === "object" && !type.$$typeof)) {
      throw new Error(
        `Element type is invalid: expected a component but got: ${type === null ? "null" : typeof type}. You probably forgot to export your component from the file it's defined in, or mixed up default and named imports (in ${parent.ownerName ?? "your app"}).`,
      );
    }
    if (typeof type === "string") {
      const node = this.register({ kind: "host", type, props, key, children: [], state: {} }, parent);
      setRef(props.ref, hostHandle(node));
      this.reconcile(node, props.children, owner(parent));
      return node;
    }
    if (type === FRAGMENT) {
      const node = this.register({ kind: "frag", props, key, children: [] }, parent);
      node.ownerName = parent.ownerName;
      this.reconcile(node, props.children, parent.ownerName ?? "Fragment");
      return node;
    }
    if (type.$$typeof === PROVIDER) {
      const node = this.register({ kind: "provider", context: type._context, props, key, children: [] }, parent);
      node.ownerName = parent.ownerName;
      this.reconcile(node, props.children, "Context.Provider");
      return node;
    }
    if (type.$$typeof === CONSUMER) {
      const node = this.register({ kind: "consumer", context: type._context, props, key, children: [] }, parent);
      node.ownerName = parent.ownerName;
      this.reconcile(node, props.children(readContext(node, type._context)), "Context.Consumer");
      return node;
    }
    if (typeof type === "function") {
      if (type.prototype && type.prototype.isReactComponent) {
        throw new Error(`${componentName(type)} is a class component. The simulator (and this course) only uses function components.`);
      }
      const node = this.register({ kind: "comp", type, props, key, hooks: [], children: [], effects: [] }, parent);
      node.ownerName = componentName(type);
      this.renderComposite(node);
      return node;
    }
    throw new Error(`Can't render ${componentName(type)}.`);
  }

  update(node, element) {
    if (node.kind === "text") {
      node.text = String(element);
      return;
    }
    const prevProps = node.props;
    node.props = element.props;
    switch (node.kind) {
      case "host":
        if (prevProps.ref !== element.props.ref) {
          setRef(prevProps.ref, null);
          setRef(element.props.ref, hostHandle(node));
        }
        this.reconcile(node, element.props.children, owner(node));
        break;
      case "frag":
      case "provider":
        this.reconcile(node, element.props.children, node.ownerName ?? "Fragment");
        break;
      case "consumer":
        this.reconcile(node, element.props.children(readContext(node, node.context)), "Context.Consumer");
        break;
      case "comp":
        this.renderComposite(node);
        break;
    }
  }

  renderComposite(node) {
    node.needsRender = false;
    this.dirty.delete(node);
    const outer = current;
    const outerIndex = hookIndex;
    current = node;
    hookIndex = 0;
    let output;
    let renders = 0;
    try {
      do {
        node.renderAgain = false;
        hookIndex = 0;
        node.effects = [];
        if (++renders > 25) {
          throw new Error(
            `Too many re-renders in ${node.ownerName}. You're probably calling a state setter while rendering, e.g. onPress={setCount(count + 1)} instead of onPress={() => setCount(count + 1)}.`,
          );
        }
        output = node.type(node.props);
        if (node.hooksReady && hookIndex !== node.hooks.length) {
          throw new Error(
            `${node.ownerName} rendered ${hookIndex < node.hooks.length ? "fewer" : "more"} hooks than during the previous render. ${HOOK_ORDER_ERROR(node.ownerName)}`,
          );
        }
        node.hooksReady = true;
      } while (node.renderAgain);
    } finally {
      current = outer;
      hookIndex = outerIndex;
    }
    if (output === undefined) output = null;
    this.reconcile(node, output, node.ownerName);
    for (const effect of node.effects) this.effects.push(effect);
    node.effects = [];
  }

  unmountNode(node) {
    node.unmounted = true;
    for (const child of node.children) this.unmountNode(child);
    if (node.kind === "comp") {
      for (const hook of node.hooks) {
        if (hook.cleanup) {
          try {
            hook.cleanup();
          } catch (error) {
            this.log("stderr", formatError(error) + "\n");
          }
          hook.cleanup = null;
        }
        if (hook.unsubscribe) hook.unsubscribe();
      }
    }
    if (node.kind === "host") setRef(node.props.ref, null);
    this.dirty.delete(node);
    this.nodes.delete(node.id);
  }
}

/** The name of the component whose render method produced this part of the tree. */
function owner(node) {
  for (let n = node; n; n = n.parent) if (n.kind === "comp") return n.ownerName;
  return "App";
}

function sameType(node, child) {
  if (typeof child === "string" || typeof child === "number") return node.kind === "text";
  if (!isValidElement(child)) return false;
  const { type } = child;
  if (typeof type === "string") return node.kind === "host" && node.type === type;
  if (type === FRAGMENT) return node.kind === "frag";
  if (type && type.$$typeof === PROVIDER) return node.kind === "provider" && node.context === type._context;
  if (type && type.$$typeof === CONSUMER) return node.kind === "consumer" && node.context === type._context;
  return node.kind === "comp" && node.type === type;
}

function setRef(ref, value) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else if (typeof ref === "object") ref.current = value;
}

/** What a ref to a built-in component points at. */
function hostHandle(node) {
  const noop = () => {};
  return {
    node,
    focus: () => {
      node.state.focused = true;
    },
    blur: () => {
      node.state.focused = false;
    },
    isFocused: () => Boolean(node.state.focused),
    clear: () => {
      node.state.text = "";
    },
    scrollTo: noop,
    scrollToEnd: noop,
    scrollToIndex: noop,
    scrollToOffset: noop,
    measure: (cb) => cb?.(0, 0, 0, 0, 0, 0),
  };
}

function readContext(node, context) {
  for (let n = node.parent; n; n = n.parent) {
    if (n.kind === "provider" && n.context === context) return n.props.value;
  }
  return context._defaultValue;
}

// ------------------------------------------------------------------ hooks

function useHook(kind, create) {
  if (!current) {
    throw new Error(
      "Invalid hook call. Hooks can only be called inside the body of a function component, not in event handlers, loops or ordinary functions.",
    );
  }
  const node = current;
  const index = hookIndex++;
  let hook = node.hooks[index];
  if (!hook) {
    if (node.hooksReady) {
      throw new Error(`${node.ownerName} rendered more hooks than during the previous render. ${HOOK_ORDER_ERROR(node.ownerName)}`);
    }
    hook = create(node);
    hook.kind = kind;
    node.hooks[index] = hook;
  } else if (hook.kind !== kind) {
    throw new Error(HOOK_ORDER_ERROR(node.ownerName));
  }
  return [hook, node];
}

function requestRender(node) {
  if (node.unmounted) return;
  node.needsRender = true;
  if (node === current) {
    node.renderAgain = true;
    return;
  }
  node.root.schedule(node);
}

function useReducer(reducer, initialArg, init) {
  const [hook] = useHook("state", (node) => {
    const hook = { state: init ? init(initialArg) : initialArg };
    hook.dispatch = (action) => {
      if (node.unmounted) return;
      const next = hook.reducer(hook.state, action);
      if (Object.is(next, hook.state)) return;
      hook.state = next;
      requestRender(node);
    };
    return hook;
  });
  hook.reducer = reducer;
  return [hook.state, hook.dispatch];
}

const basicStateReducer = (state, action) => (typeof action === "function" ? action(state) : action);

function useState(initial) {
  const [hook] = useHook("state", (node) => {
    const hook = { state: typeof initial === "function" ? initial() : initial, reducer: basicStateReducer };
    hook.dispatch = (action) => {
      if (node.unmounted) return;
      const next = basicStateReducer(hook.state, action);
      if (Object.is(next, hook.state)) return;
      hook.state = next;
      requestRender(node);
    };
    return hook;
  });
  return [hook.state, hook.dispatch];
}

function useRef(initial) {
  const [hook] = useHook("ref", () => ({ ref: { current: initial } }));
  return hook.ref;
}

function useMemo(fn, deps) {
  const [hook] = useHook("memo", () => ({ deps: undefined, value: undefined, ready: false }));
  if (!hook.ready || deps === undefined || depsChanged(hook.deps, deps)) {
    hook.value = fn();
    hook.deps = deps;
    hook.ready = true;
  }
  return hook.value;
}

const useCallback = (fn, deps) => useMemo(() => fn, deps);

function makeEffectHook(kind) {
  return function useEffect(fn, deps) {
    if (typeof fn !== "function") throw new Error(`${kind} expects a function as its first argument.`);
    const [hook, node] = useHook(kind, () => ({ deps: undefined, cleanup: null, ran: false }));
    if (!hook.ran || deps === undefined || depsChanged(hook.deps, deps)) {
      hook.deps = deps;
      hook.ran = true;
      node.effects.push({ node, hook, fn });
    }
  };
}

const useEffect = makeEffectHook("useEffect");
const useLayoutEffect = makeEffectHook("useLayoutEffect");
const useInsertionEffect = makeEffectHook("useInsertionEffect");

function useContext(context) {
  if (!current) throw new Error("Invalid hook call. useContext can only be called inside the body of a function component.");
  return readContext(current, context);
}

let nextId = 0;
function useId() {
  const [hook] = useHook("id", () => ({ id: `:r${(nextId++).toString(36)}:` }));
  return hook.id;
}

function useImperativeHandle(ref, create, deps) {
  useLayoutEffect(() => {
    setRef(ref, create());
    return () => setRef(ref, null);
  }, deps);
}

function useSyncExternalStore(subscribe, getSnapshot) {
  const value = getSnapshot();
  const [hook, node] = useHook("store", () => ({}));
  hook.getSnapshot = getSnapshot;
  hook.value = value;
  if (hook.subscribe !== subscribe) {
    if (hook.unsubscribe) hook.unsubscribe();
    hook.subscribe = subscribe;
    hook.unsubscribe = subscribe(() => {
      if (!Object.is(hook.getSnapshot(), hook.value)) requestRender(node);
    });
  }
  return value;
}

function useTransition() {
  return [false, (fn) => fn()];
}

const useDeferredValue = (value) => value;
const useDebugValue = () => {};

function memo(component) {
  return component;
}

function forwardRef(render) {
  const Forward = (props) => {
    const { ref, ...rest } = props;
    return render(rest, ref ?? null);
  };
  Forward.displayName = render.displayName || render.name || "ForwardRef";
  return Forward;
}

const React = {
  createElement,
  cloneElement,
  isValidElement,
  Fragment: FRAGMENT,
  Children,
  createContext,
  useState,
  useReducer,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useContext,
  useId,
  useImperativeHandle,
  useSyncExternalStore,
  useTransition,
  useDeferredValue,
  useDebugValue,
  memo,
  forwardRef,
  StrictMode: ({ children }) => children ?? null,
  createRef: () => ({ current: null }),
  version: "19.1.0-simulator",
};

// ------------------------------------------------------------------ styles

function flattenStyle(style) {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    const out = {};
    let any = false;
    for (const s of style) {
      const flat = flattenStyle(s);
      if (flat) {
        Object.assign(out, flat);
        any = true;
      }
    }
    return any ? out : undefined;
  }
  if (typeof style === "object") return style;
  return undefined;
}

const absoluteFill = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 };

const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => flattenStyle(style) ?? {},
  compose: (a, b) => (a && b ? [a, b] : a || b),
  hairlineWidth: 0.5,
  absoluteFill,
  absoluteFillObject: absoluteFill,
};

// ------------------------------------------------------------------ react-native

const h = createElement;

function resolvePressable(props) {
  const state = { pressed: false, hovered: false, focused: false };
  return {
    style: typeof props.style === "function" ? props.style(state) : props.style,
    children: typeof props.children === "function" ? props.children(state) : props.children,
  };
}

function Pressable(props) {
  const { style, children } = resolvePressable(props);
  return h("Pressable", { accessibilityRole: props.accessibilityRole ?? props.role, ...props, style, children });
}

function makeTouchable(name) {
  const Touchable = (props) => h(name, props);
  Touchable.displayName = name;
  return Touchable;
}

function Button({ title, onPress, color, disabled, testID, accessibilityLabel }) {
  if (typeof title !== "string") throw new Error("<Button> needs a title prop that is a string, e.g. <Button title=\"Save\" onPress={save} />.");
  return h(
    "Pressable",
    {
      onPress,
      disabled,
      testID,
      accessibilityLabel,
      accessibilityRole: "button",
      accessibilityState: { disabled: Boolean(disabled) },
      style: { paddingVertical: 8, paddingHorizontal: 12, alignItems: "center" },
      __button: true,
    },
    h("Text", { style: { color: disabled ? "#cdcdcd" : (color ?? "#007AFF"), fontSize: 18, textAlign: "center" } }, title),
  );
}

function ScrollView({ children, contentContainerStyle, horizontal, ...rest }) {
  return h(
    "ScrollView",
    { ...rest, horizontal },
    h("View", { style: [horizontal ? { flexDirection: "row" } : null, contentContainerStyle], __content: true }, ...spread(children)),
  );
}

function renderSlot(slot, props) {
  if (!slot) return null;
  if (isValidElement(slot)) return slot;
  return h(slot, props ?? null);
}

const separators = { highlight: () => {}, unhighlight: () => {}, updateProps: () => {} };

function defaultKey(item, index) {
  if (item && typeof item === "object") {
    if (item.key != null) return String(item.key);
    if (item.id != null) return String(item.id);
  }
  return String(index);
}

function FlatList(props) {
  const {
    data,
    renderItem,
    keyExtractor,
    ItemSeparatorComponent,
    ListEmptyComponent,
    ListHeaderComponent,
    ListFooterComponent,
    numColumns = 1,
    columnWrapperStyle,
    ...rest
  } = props;
  delete rest.extraData; // only used by the real FlatList to know when to re-render
  if (typeof renderItem !== "function") throw new Error("<FlatList> needs a renderItem function, e.g. renderItem={({ item }) => <Text>{item.name}</Text>}.");
  const list = data ?? [];
  if (!Array.isArray(list)) throw new Error("<FlatList> data must be an array.");
  const keys = list.map((item, index) => (keyExtractor ? keyExtractor(item, index) : defaultKey(item, index)));
  const cells = list.map((item, index) =>
    h("View", { key: String(keys[index]), __cell: true }, renderItem({ item, index, separators })),
  );
  let rows = cells;
  if (numColumns > 1) {
    rows = [];
    for (let i = 0; i < cells.length; i += numColumns) {
      rows.push(h("View", { key: `row-${keys[i]}`, style: [{ flexDirection: "row" }, columnWrapperStyle] }, cells.slice(i, i + numColumns)));
    }
  }
  const body = [];
  rows.forEach((row, i) => {
    if (i > 0 && ItemSeparatorComponent) body.push(h(Fragment, { key: `sep-${i}` }, renderSlot(ItemSeparatorComponent)));
    body.push(row);
  });
  return h(
    ScrollView,
    rest,
    renderSlot(ListHeaderComponent),
    list.length === 0 ? renderSlot(ListEmptyComponent) : body,
    renderSlot(ListFooterComponent),
  );
}
const Fragment = FRAGMENT;

function SectionList(props) {
  const { sections = [], renderItem, renderSectionHeader, renderSectionFooter, keyExtractor, ItemSeparatorComponent, ListEmptyComponent, ListHeaderComponent, ListFooterComponent, ...rest } = props;
  const body = sections.map((section, s) =>
    h(
      Fragment,
      { key: section.key ?? section.title ?? String(s) },
      renderSectionHeader ? renderSectionHeader({ section }) : null,
      (section.data ?? []).map((item, index) =>
        h(
          Fragment,
          { key: keyExtractor ? keyExtractor(item, index) : defaultKey(item, index) },
          index > 0 && ItemSeparatorComponent ? renderSlot(ItemSeparatorComponent) : null,
          (section.renderItem ?? renderItem)({ item, index, section, separators }),
        ),
      ),
      renderSectionFooter ? renderSectionFooter({ section }) : null,
    ),
  );
  const empty = sections.every((s) => (s.data ?? []).length === 0);
  return h(ScrollView, rest, renderSlot(ListHeaderComponent), empty ? renderSlot(ListEmptyComponent) : body, renderSlot(ListFooterComponent));
}

function Modal({ visible = true, children, ...rest }) {
  return visible ? h("Modal", rest, ...spread(children)) : null;
}

function makeHost(name) {
  const Host = (props) => h(name, props);
  Host.displayName = name;
  return Host;
}

function createReactNative(log, alerts) {
  const window = { width: 390, height: 844, scale: 3, fontScale: 1 };
  const Alert = {
    alert: (title, message, buttons) => {
      alerts.push({ title, message, buttons });
      log("stdout", `[Alert] ${title}${message ? `: ${message}` : ""}\n`);
    },
  };
  return {
    View: "View",
    Text: "Text",
    TextInput: "TextInput",
    Image: "Image",
    ImageBackground: "ImageBackground",
    Switch: "Switch",
    ActivityIndicator: "ActivityIndicator",
    SafeAreaView: "SafeAreaView",
    KeyboardAvoidingView: "KeyboardAvoidingView",
    Pressable,
    TouchableOpacity: makeTouchable("TouchableOpacity"),
    TouchableHighlight: makeTouchable("TouchableHighlight"),
    TouchableWithoutFeedback: makeTouchable("TouchableWithoutFeedback"),
    Button,
    ScrollView,
    FlatList,
    SectionList,
    Modal,
    StatusBar: () => null,
    StyleSheet,
    Alert,
    Platform: {
      OS: "ios",
      Version: "18.0",
      isPad: false,
      isTV: false,
      select: (spec) => ("ios" in spec ? spec.ios : "native" in spec ? spec.native : spec.default),
    },
    Dimensions: { get: () => ({ ...window }), addEventListener: () => ({ remove: () => {} }) },
    useWindowDimensions: () => ({ ...window }),
    useColorScheme: () => "light",
    Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
    Linking: {
      openURL: async (url) => log("stdout", `[Linking] open ${url}\n`),
      canOpenURL: async () => true,
    },
    Vibration: { vibrate: () => {}, cancel: () => {} },
    PixelRatio: { get: () => 3, roundToNearestPixel: (n) => Math.round(n * 3) / 3 },
    I18nManager: { isRTL: false },
    AccessibilityInfo: { isScreenReaderEnabled: async () => false, announceForAccessibility: () => {} },
    Animated: { View: makeHost("View"), Text: makeHost("Text"), Value: class { constructor(v) { this._value = v; } setValue(v) { this._value = v; } } },
  };
}

// ------------------------------------------------------------------ formatting

function formatValue(value, depth = 0, seen = new Set()) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const type = typeof value;
  if (type === "string") return depth === 0 ? value : JSON.stringify(value);
  if (type === "number" || type === "boolean" || type === "bigint") return String(value);
  if (type === "symbol") return value.toString();
  if (type === "function") return `[Function: ${value.name || "anonymous"}]`;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (isHostNode(value)) return describeNode(value);
  if (isValidElement(value)) return `<${componentName(value.type)} />`;
  if (seen.has(value)) return "[Circular]";
  if (depth > 4) return Array.isArray(value) ? "[Array]" : "[Object]";
  seen.add(value);
  let out;
  if (Array.isArray(value)) {
    out = `[${value.map((v) => formatValue(v, depth + 1, seen)).join(", ")}]`;
  } else if (value instanceof Map) {
    out = `Map(${value.size}) {${[...value].map(([k, v]) => `${formatValue(k, depth + 1, seen)} => ${formatValue(v, depth + 1, seen)}`).join(", ")}}`;
  } else if (value instanceof Set) {
    out = `Set(${value.size}) {${[...value].map((v) => formatValue(v, depth + 1, seen)).join(", ")}}`;
  } else if (value instanceof Date) {
    out = value.toISOString();
  } else {
    const entries = Object.entries(value).map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${formatValue(v, depth + 1, seen)}`);
    out = entries.length ? `{ ${entries.join(", ")} }` : "{}";
  }
  seen.delete(value);
  return out;
}

const formatArgs = (args) => args.map((a) => formatValue(a)).join(" ");

function formatError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `Error: ${formatValue(error)}`;
}

// ------------------------------------------------------------------ tree queries

const isHostNode = (n) => Boolean(n && typeof n === "object" && n.kind === "host" && n.root);

function hostChildren(node) {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.kind === "host" || n.kind === "text") out.push(n);
      else walk(n.children);
    }
  };
  walk(node.children);
  return out;
}

function hostParent(node) {
  for (let n = node.parent; n; n = n.parent) if (n.kind === "host") return n;
  return null;
}

function allHosts(node) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (c.kind === "host") out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

function textContent(node) {
  if (node.kind === "text") return node.text;
  return hostChildren(node).map(textContent).join("");
}

const normalize = (text) => text.replace(/\s+/g, " ").trim();

function matches(text, matcher, exact = true) {
  if (text == null) return false;
  const value = normalize(String(text));
  if (matcher instanceof RegExp) return matcher.test(value);
  if (typeof matcher === "function") return Boolean(matcher(value));
  const wanted = normalize(String(matcher));
  return exact ? value === wanted : value.toLowerCase().includes(wanted.toLowerCase());
}

function inputValue(node) {
  if (node.props.value !== undefined) return String(node.props.value ?? "");
  if (node.state.text !== undefined) return node.state.text;
  return String(node.props.defaultValue ?? "");
}

function isDisabled(node) {
  for (let n = node; n; n = hostParent(n)) {
    if (n.kind !== "host") continue;
    if (n.props.disabled === true || n.props.accessibilityState?.disabled === true || n.props["aria-disabled"] === true) return true;
    if (n.type === "TextInput" && n.props.editable === false) return true;
  }
  return false;
}

function describeNode(node, indent = "", maxDepth = 12) {
  if (node.kind === "text") return indent + node.text;
  const shown = ["testID", "accessibilityRole", "accessibilityLabel", "placeholder", "value", "disabled", "title"];
  const attrs = shown
    .filter((k) => node.props[k] !== undefined && node.props[k] !== false)
    .map((k) => ` ${k}=${typeof node.props[k] === "string" ? JSON.stringify(node.props[k]) : `{${formatValue(node.props[k], 1)}}`}`)
    .join("");
  const kids = hostChildren(node);
  if (kids.length === 0) return `${indent}<${node.type}${attrs} />`;
  if (kids.every((k) => k.kind === "text")) return `${indent}<${node.type}${attrs}>${kids.map((k) => k.text).join("")}</${node.type}>`;
  if (maxDepth <= 0) return `${indent}<${node.type}${attrs}>…</${node.type}>`;
  const inner = kids.map((k) => describeNode(k, indent + "  ", maxDepth - 1)).join("\n");
  return `${indent}<${node.type}${attrs}>\n${inner}\n${indent}</${node.type}>`;
}

function describeTree(container) {
  const kids = container.kind === "root" ? hostChildren(container) : [container];
  const text = kids.map((k) => describeNode(k)).join("\n") || "(nothing rendered)";
  const lines = text.split("\n");
  return lines.length > 60 ? lines.slice(0, 60).join("\n") + `\n… (${lines.length - 60} more lines)` : text;
}

function toJSON(node) {
  if (node.kind === "text") return node.text;
  const props = {};
  for (const [k, v] of Object.entries(node.props)) {
    if (k === "children" || k.startsWith("__")) continue;
    props[k] = k === "style" ? flattenStyle(v) : v;
  }
  const kids = hostChildren(node).map(toJSON);
  return { type: node.type, props, children: kids.length ? kids : null };
}

/** The tree the phone preview draws: host components only, no functions. */
function serialize(container) {
  const PROPS = [
    "testID", "value", "defaultValue", "placeholder", "placeholderTextColor", "secureTextEntry", "multiline", "editable",
    "disabled", "numberOfLines", "horizontal", "keyboardType", "accessibilityLabel", "accessibilityRole", "trackColor",
    "thumbColor", "color", "size", "animating", "resizeMode", "transparent", "animationType", "maxLength",
  ];
  const visit = (node) => {
    if (node.kind === "text") return { id: node.id, text: node.text };
    const props = {};
    for (const k of PROPS) {
      const v = node.props[k];
      if (v !== undefined && typeof v !== "function") props[k] = v;
    }
    if (node.type === "TextInput") props.value = inputValue(node);
    if (node.type === "Image" || node.type === "ImageBackground") {
      const source = Array.isArray(node.props.source) ? node.props.source[0] : node.props.source;
      if (source && typeof source === "object" && typeof source.uri === "string") props.uri = source.uri;
    }
    const style = flattenStyle(node.props.style);
    if (style) props.style = JSON.parse(JSON.stringify(style));
    const events = [];
    if (node.props.onPress || node.props.onLongPress) events.push("press");
    if (node.props.onChangeText || node.props.onChange) events.push("changeText");
    if (node.props.onValueChange) events.push("valueChange");
    if (node.props.onSubmitEditing) events.push("submitEditing");
    if (node.props.onRequestClose) events.push("requestClose");
    if (node.props.__button) props.button = true;
    if (node.props.__content) props.content = true;
    return { id: node.id, type: node.type, props, events, children: hostChildren(node).map(visit) };
  };
  return hostChildren(container).map(visit);
}

// ------------------------------------------------------------------ events

function findHandler(node, name) {
  const prop = "on" + name[0].toUpperCase() + name.slice(1);
  for (let n = node; n; n = hostParent(n)) {
    if (n.kind === "host" && typeof n.props[prop] === "function") return { node: n, handler: n.props[prop] };
  }
  return null;
}

const fakeEvent = (extra = {}) => ({
  nativeEvent: { timestamp: Date.now(), ...extra },
  persist: () => {},
  preventDefault: () => {},
  stopPropagation: () => {},
});

/** Fire an event the way React Native Testing Library does. Returns whether a handler ran. */
function dispatchEvent(node, name, args) {
  if (!node || !node.root) throw new Error("fireEvent needs an element from a query like screen.getByText(…).");
  if (node.unmounted) throw new Error("This element is no longer on the screen (it was removed by a re-render). Query for it again.");
  const root = node.root;
  if (name === "changeText") {
    const input = node.type === "TextInput" ? node : allHosts(node).find((n) => n.type === "TextInput") ?? node;
    if (isDisabled(input)) return false;
    const text = String(args[0] ?? "");
    root.batch(() => {
      if (input.type === "TextInput" && input.props.value === undefined) input.state.text = text;
      input.props.onChange?.(fakeEvent({ text }));
      input.props.onChangeText?.(text);
    });
    return true;
  }
  const found = findHandler(node, name);
  if (!found) return false;
  if ((name === "press" || name === "longPress" || name === "pressIn" || name === "pressOut") && isDisabled(found.node)) return false;
  const eventArgs = args.length ? args : name === "press" || name === "longPress" ? [fakeEvent()] : [];
  root.batch(() => found.handler(...eventArgs));
  return true;
}

// ------------------------------------------------------------------ fake timers

function createTimers() {
  const real = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
  const realHandles = new Set();
  const state = { fake: false, now: 0, nextId: 1, timers: new Map() };
  const add = (fn, ms, repeat, args) => {
    const id = state.nextId++;
    state.timers.set(id, { id, fn, at: state.now + Math.max(0, Number(ms) || 0), every: repeat ? Math.max(1, Number(ms) || 0) : 0, args });
    return id;
  };
  const api = {
    setTimeout: (fn, ms, ...args) => {
      if (state.fake) return add(fn, ms, false, args);
      const handle = real.setTimeout(() => {
        realHandles.delete(handle);
        fn(...args);
      }, ms);
      realHandles.add(handle);
      return handle;
    },
    clearTimeout: (id) => {
      if (state.timers.delete(id)) return;
      realHandles.delete(id);
      real.clearTimeout(id);
    },
    setInterval: (fn, ms, ...args) => {
      if (state.fake) return add(fn, ms, true, args);
      const handle = real.setInterval(fn, ms, ...args);
      realHandles.add(handle);
      return handle;
    },
    clearInterval: (id) => {
      if (state.timers.delete(id)) return;
      realHandles.delete(id);
      real.clearInterval(id);
    },
  };
  const advance = (ms, onTick) => {
    const end = state.now + ms;
    for (let guard = 0; guard < 100_000; guard++) {
      const due = [...state.timers.values()].filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      state.now = due.at;
      if (due.every) due.at += due.every;
      else state.timers.delete(due.id);
      onTick(() => due.fn(...due.args));
    }
    state.now = end;
  };
  return { api, state, advance, real, clearAll: () => {
    state.timers.clear();
    for (const handle of realHandles) {
      real.clearTimeout(handle);
      real.clearInterval(handle);
    }
    realHandles.clear();
  } };
}

// ------------------------------------------------------------------ jest

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

function equals(a, b, strict, seen = []) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (isHostNode(a) || isHostNode(b)) return a === b;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !equals(v, b.get(k), strict, seen)) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (seen.some(([x, y]) => x === a && y === b)) return true;
  seen.push([a, b]);
  const keys = (o) => Object.keys(o).filter((k) => strict || o[k] !== undefined);
  const ka = keys(a);
  const kb = keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k) && !(k in b)) return false;
    if (!equals(a[k], b[k], strict, seen)) return false;
  }
  if (Array.isArray(a) && a.length !== b.length) return false;
  return true;
}

function matchesObject(actual, expected) {
  if (typeof expected !== "object" || expected === null) return equals(actual, expected, false);
  if (typeof actual !== "object" || actual === null) return false;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matchesObject(actual[i], e));
  return Object.keys(expected).every((k) => matchesObject(actual[k], expected[k]));
}

const show = (v) => formatValue(v, 1);

function createMockFn(impl) {
  let implementation = impl;
  const onceQueue = [];
  const mock = { calls: [], results: [], instances: [], lastCall: undefined };
  const fn = function (...args) {
    mock.calls.push(args);
    mock.lastCall = args;
    const use = onceQueue.length ? onceQueue.shift() : implementation;
    try {
      const value = use ? use.apply(this, args) : undefined;
      mock.results.push({ type: "return", value });
      return value;
    } catch (error) {
      mock.results.push({ type: "throw", value: error });
      throw error;
    }
  };
  fn._isMockFunction = true;
  fn.mock = mock;
  fn.mockImplementation = (f) => ((implementation = f), fn);
  fn.mockImplementationOnce = (f) => (onceQueue.push(f), fn);
  fn.mockReturnValue = (v) => fn.mockImplementation(() => v);
  fn.mockReturnValueOnce = (v) => fn.mockImplementationOnce(() => v);
  fn.mockResolvedValue = (v) => fn.mockImplementation(() => Promise.resolve(v));
  fn.mockResolvedValueOnce = (v) => fn.mockImplementationOnce(() => Promise.resolve(v));
  fn.mockRejectedValue = (v) => fn.mockImplementation(() => Promise.reject(v));
  fn.mockRejectedValueOnce = (v) => fn.mockImplementationOnce(() => Promise.reject(v));
  fn.mockClear = () => {
    mock.calls.length = 0;
    mock.results.length = 0;
    mock.lastCall = undefined;
    return fn;
  };
  fn.mockReset = () => {
    fn.mockClear();
    implementation = undefined;
    onceQueue.length = 0;
    return fn;
  };
  fn.getMockName = () => "jest.fn()";
  return fn;
}

function createExpect(isOnScreen) {
  const assertMock = (fn, name) => {
    if (!fn || !fn._isMockFunction) throw new AssertionError(`${name} needs a mock function made with jest.fn() or jest.spyOn(), but got ${show(fn)}.`);
  };
  const assertNode = (n, name) => {
    if (!isHostNode(n)) throw new AssertionError(`${name} needs an element from a query like screen.getByText(…), but got ${show(n)}.`);
  };

  const matchers = {
    toBe: (r, e) => [Object.is(r, e), `Expected: ${show(e)}\nReceived: ${show(r)}`],
    toEqual: (r, e) => [equals(r, e, false), `Expected: ${show(e)}\nReceived: ${show(r)}`],
    toStrictEqual: (r, e) => [equals(r, e, true), `Expected: ${show(e)}\nReceived: ${show(r)}`],
    toMatchObject: (r, e) => [matchesObject(r, e), `Expected to contain: ${show(e)}\nReceived: ${show(r)}`],
    toBeTruthy: (r) => [Boolean(r), `Received: ${show(r)}`],
    toBeFalsy: (r) => [!r, `Received: ${show(r)}`],
    toBeNull: (r) => [r === null, `Received: ${show(r)}`],
    toBeUndefined: (r) => [r === undefined, `Received: ${show(r)}`],
    toBeDefined: (r) => [r !== undefined, `Received: ${show(r)}`],
    toBeNaN: (r) => [Number.isNaN(r), `Received: ${show(r)}`],
    toBeInstanceOf: (r, cls) => [r instanceof cls, `Expected an instance of ${cls?.name}\nReceived: ${show(r)}`],
    toBeGreaterThan: (r, e) => [r > e, `Expected: > ${show(e)}\nReceived: ${show(r)}`],
    toBeGreaterThanOrEqual: (r, e) => [r >= e, `Expected: >= ${show(e)}\nReceived: ${show(r)}`],
    toBeLessThan: (r, e) => [r < e, `Expected: < ${show(e)}\nReceived: ${show(r)}`],
    toBeLessThanOrEqual: (r, e) => [r <= e, `Expected: <= ${show(e)}\nReceived: ${show(r)}`],
    toBeCloseTo: (r, e, digits = 2) => [Math.abs(r - e) < 10 ** -digits / 2, `Expected: ${show(e)} (to ${digits} decimal places)\nReceived: ${show(r)}`],
    toContain: (r, e) => [r != null && typeof r.includes === "function" && r.includes(e), `Expected to contain: ${show(e)}\nReceived: ${show(r)}`],
    toContainEqual: (r, e) => [Array.isArray(r) && r.some((x) => equals(x, e, false)), `Expected to contain: ${show(e)}\nReceived: ${show(r)}`],
    toHaveLength: (r, n) => [r != null && r.length === n, `Expected length: ${n}\nReceived length: ${r?.length}\nReceived: ${show(r)}`],
    toHaveProperty: (r, path, value) => {
      const parts = Array.isArray(path) ? path : String(path).split(".");
      let v = r;
      for (const p of parts) {
        if (v == null || !(p in Object(v))) return [false, `Expected path: ${show(path)}\nReceived: ${show(r)}`];
        v = v[p];
      }
      return [value === undefined || equals(v, value, false), `Expected ${show(path)} to be ${show(value)}\nReceived: ${show(v)}`];
    },
    toMatch: (r, e) => [typeof r === "string" && (e instanceof RegExp ? e.test(r) : r.includes(e)), `Expected to match: ${show(e)}\nReceived: ${show(r)}`],
    toThrow: (r, e) => {
      if (typeof r !== "function") return [false, "toThrow needs a function: expect(() => fn()).toThrow()"];
      try {
        r();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const ok = e === undefined || (e instanceof RegExp ? e.test(message) : typeof e === "function" ? error instanceof e : message.includes(String(e)));
        return [ok, `Expected the error to match ${show(e)}\nReceived error: ${show(message)}`];
      }
      return [false, "Expected the function to throw, but it didn't."];
    },
    toHaveBeenCalled: (r) => (assertMock(r, "toHaveBeenCalled"), [r.mock.calls.length > 0, `Number of calls: ${r.mock.calls.length}`]),
    toHaveBeenCalledTimes: (r, n) => (assertMock(r, "toHaveBeenCalledTimes"), [r.mock.calls.length === n, `Expected calls: ${n}\nReceived calls: ${r.mock.calls.length}`]),
    toHaveBeenCalledWith: (r, ...args) => (
      assertMock(r, "toHaveBeenCalledWith"),
      [r.mock.calls.some((c) => equals(c, args, false)), `Expected call with: ${show(args)}\nReceived calls: ${show(r.mock.calls)}`]
    ),
    toHaveBeenLastCalledWith: (r, ...args) => (
      assertMock(r, "toHaveBeenLastCalledWith"),
      [equals(r.mock.lastCall, args, false), `Expected last call with: ${show(args)}\nReceived: ${show(r.mock.lastCall)}`]
    ),
    // React Native Testing Library matchers
    toBeOnTheScreen: (r) => [r != null && isHostNode(r) && isOnScreen(r), r == null ? "Received: null (the query found nothing)" : "The element isn't on the screen any more."],
    toHaveTextContent: (r, text, options = {}) => {
      assertNode(r, "toHaveTextContent");
      const actual = textContent(r);
      return [matches(actual, text, options.exact ?? true), `Expected text: ${show(text)}\nReceived text: ${show(normalize(actual))}`];
    },
    toHaveDisplayValue: (r, value) => {
      assertNode(r, "toHaveDisplayValue");
      return [matches(inputValue(r), value), `Expected value: ${show(value)}\nReceived value: ${show(inputValue(r))}`];
    },
    toHaveStyle: (r, style) => {
      assertNode(r, "toHaveStyle");
      const actual = flattenStyle(r.props.style) ?? {};
      const wanted = flattenStyle(style) ?? {};
      return [Object.keys(wanted).every((k) => equals(actual[k], wanted[k], false)), `Expected style: ${show(wanted)}\nReceived style: ${show(actual)}`];
    },
    toHaveProp: (r, name, value) => {
      assertNode(r, "toHaveProp");
      const has = r.props[name] !== undefined;
      return [has && (value === undefined || equals(r.props[name], value, false)), `Expected prop ${name}${value === undefined ? "" : ` = ${show(value)}`}\nReceived: ${show(r.props[name])}`];
    },
    toBeDisabled: (r) => (assertNode(r, "toBeDisabled"), [isDisabled(r), "The element is enabled."]),
    toBeEnabled: (r) => (assertNode(r, "toBeEnabled"), [!isDisabled(r), "The element is disabled."]),
    toBeVisible: (r) => {
      assertNode(r, "toBeVisible");
      for (let n = r; n; n = hostParent(n)) {
        const s = flattenStyle(n.props.style) ?? {};
        if (s.display === "none" || s.opacity === 0) return [false, `<${n.type}> is hidden by its style.`];
      }
      return [isOnScreen(r), "The element isn't on the screen."];
    },
  };

  function expect(received) {
    const build = (negate) => {
      const api = {};
      for (const [name, fn] of Object.entries(matchers)) {
        api[name] = (...args) => {
          const [pass, detail] = fn(received, ...args);
          if (pass === negate) {
            const head = `expect(received)${negate ? ".not" : ""}.${name}(${args.length ? "expected" : ""})`;
            throw new AssertionError(`${head}\n\n${negate ? "Expected the opposite.\n" : ""}${detail}`);
          }
        };
      }
      return api;
    };
    const api = build(false);
    api.not = build(true);
    const promised = (kind) => {
      const out = {};
      for (const name of Object.keys(matchers)) {
        out[name] = async (...args) => {
          let value;
          try {
            value = await received;
            if (kind === "rejects") throw new AssertionError("Expected the promise to reject, but it resolved.");
          } catch (error) {
            if (kind === "resolves" || error instanceof AssertionError) throw error;
            value = error;
          }
          return expect(value)[name](...args);
        };
      }
      return out;
    };
    api.resolves = promised("resolves");
    api.rejects = promised("rejects");
    return api;
  }
  expect.assertions = () => {};
  return expect;
}

// ------------------------------------------------------------------ the module system and runs

const TRANSFORM_OPTIONS = {
  transforms: ["typescript", "jsx", "imports"],
  jsxPragma: "React.createElement",
  jsxFragmentPragma: "React.Fragment",
  production: true,
  disableESTransforms: true,
  filePath: "App.tsx",
};

export const FILE_NAME = "App.tsx";

function compile(transform, source) {
  try {
    return transform(source, TRANSFORM_OPTIONS).code;
  } catch (error) {
    const m = String(error.message).match(/\((\d+):(\d+)\)/);
    const where = m ? ` (line ${m[1]}, column ${Number(m[2]) + 1})` : "";
    const message = String(error.message).replace(/^Error transforming [^:]+: /, "").replace(/\s*\(\d+:\d+\)\s*$/, "");
    const err = new SyntaxError(`${message}${where}`);
    err.compile = true;
    throw err;
  }
}

/** How many lines `new Function` adds before the body, so stack line numbers can be mapped back. */
let wrapperOffset = null;
function getWrapperOffset() {
  if (wrapperOffset !== null) return wrapperOffset;
  try {
    new Function("a", "b", `throw new Error("probe")\n//# sourceURL=probe.tsx`)();
  } catch (error) {
    const m = String(error.stack).match(/probe\.tsx:(\d+)/);
    wrapperOffset = m ? Number(m[1]) - 1 : 2;
  }
  return wrapperOffset;
}

/** Lines added before the learner's code: the wrapper, plus our "use strict" line. */
const lineOffset = () => getWrapperOffset() + 1;

/** "TypeError: x is undefined (line 4 of your code)" */
function describeRuntimeError(error, codeLines) {
  const base = formatError(error);
  if (!(error instanceof Error) || error instanceof AssertionError || error.compile) return base;
  const m = String(error.stack ?? "").match(/App\.tsx:(\d+):(\d+)/);
  if (!m) return base;
  const line = Number(m[1]) - lineOffset();
  if (line < 1) return base;
  return line <= codeLines ? `${base}\n    at line ${line} of your code` : `${base}\n    at line ${line - codeLines - 1} of the tests`;
}

const TEST_GLOBALS = [
  "render", "screen", "fireEvent", "waitFor", "act", "within", "cleanup",
  "test", "it", "describe", "expect", "jest", "beforeEach", "afterEach", "source",
];

/**
 * Run learner code, optionally followed by tests.
 *
 *   transform  Sucrase's transform function
 *   log(stream, text)  console output ("stdout" or "stderr")
 *
 * Returns { ok, error, tests, app } where app (when the code exports a component and there are
 * no tests) is a live preview: { root, tree(), dispatch(id, event, args), subscribe(fn) }.
 */
export async function runCode({ code, tests, transform, log, testTimeoutMs = 5000 }) {
  const started = Date.now();
  const alerts = [];
  const timers = createTimers();
  const roots = new Set();
  let activeRoot = null;
  const spies = [];

  const userConsole = {
    log: (...a) => log("stdout", formatArgs(a) + "\n"),
    info: (...a) => log("stdout", formatArgs(a) + "\n"),
    debug: (...a) => log("stdout", formatArgs(a) + "\n"),
    warn: (...a) => log("stderr", formatArgs(a) + "\n"),
    error: (...a) => log("stderr", formatArgs(a) + "\n"),
    table: (data) => log("stdout", formatValue(data) + "\n"),
    group: () => {},
    groupEnd: () => {},
    time: () => {},
    timeEnd: () => {},
  };

  const ReactNative = createReactNative(log, alerts);
  const isOnScreen = (node) => !node.unmounted && Boolean(node.root?.mounted);

  // ---- testing library
  const makeRoot = () => {
    const root = new Root({ log, describe: (error) => describeRuntimeError(error, code.split("\n").length) });
    roots.add(root);
    return root;
  };

  const queriesFor = (getContainer) => {
    const all = (predicate) => {
      const container = getContainer();
      return allHosts(container).filter(predicate);
    };
    const kinds = {
      Text: { find: (m, o = {}) => all((n) => n.type === "Text" && matches(textContent(n), m, o.exact ?? true)), what: (m) => `text: ${show(m)}` },
      TestId: { find: (m) => all((n) => matches(n.props.testID, m)), what: (m) => `testID: ${show(m)}` },
      PlaceholderText: { find: (m, o = {}) => all((n) => n.type === "TextInput" && matches(n.props.placeholder, m, o.exact ?? true)), what: (m) => `placeholder: ${show(m)}` },
      DisplayValue: { find: (m, o = {}) => all((n) => n.type === "TextInput" && matches(inputValue(n), m, o.exact ?? true)), what: (m) => `display value: ${show(m)}` },
      LabelText: { find: (m, o = {}) => all((n) => matches(n.props.accessibilityLabel ?? n.props["aria-label"], m, o.exact ?? true)), what: (m) => `accessibility label: ${show(m)}` },
      Role: {
        find: (role, o = {}) =>
          all((n) => {
            const r = n.props.accessibilityRole ?? n.props.role ?? (n.type === "Switch" ? "switch" : n.type === "Image" ? "image" : n.type === "TextInput" ? "searchbox" : undefined);
            if (!matches(r, role)) return false;
            if (o.name === undefined) return true;
            return matches(n.props.accessibilityLabel ?? textContent(n), o.name, true);
          }),
        what: (role, o = {}) => `role: ${show(role)}${o.name !== undefined ? ` and name: ${show(o.name)}` : ""}`,
      },
    };
    const api = {};
    for (const [kind, { find, what }] of Object.entries(kinds)) {
      const notFound = (args) => new AssertionError(`Unable to find an element with ${what(...args)}\n\n${describeTree(getContainer())}`);
      api[`queryAllBy${kind}`] = (...args) => find(...args);
      api[`getAllBy${kind}`] = (...args) => {
        const found = find(...args);
        if (found.length === 0) throw notFound(args);
        return found;
      };
      api[`queryBy${kind}`] = (...args) => {
        const found = find(...args);
        if (found.length > 1) throw new AssertionError(`Found ${found.length} elements with ${what(...args)}. Use getAllBy${kind} if you expect several.`);
        return found[0] ?? null;
      };
      api[`getBy${kind}`] = (...args) => {
        const found = find(...args);
        if (found.length === 0) throw notFound(args);
        if (found.length > 1) throw new AssertionError(`Found ${found.length} elements with ${what(...args)}. Use getAllBy${kind} if you expect several.`);
        return found[0];
      };
      api[`findBy${kind}`] = (...args) => waitFor(() => api[`getBy${kind}`](...args));
      api[`findAllBy${kind}`] = (...args) => waitFor(() => api[`getAllBy${kind}`](...args));
    }
    api.toJSON = () => {
      const kids = hostChildren(getContainer()).map(toJSON);
      return kids.length === 0 ? null : kids.length === 1 ? kids[0] : kids;
    };
    api.debug = () => log("stdout", describeTree(getContainer()) + "\n");
    return api;
  };

  function render(element, options = {}) {
    if (!isValidElement(element)) {
      throw new Error(`render() needs a React element like render(<App />), but got ${show(element)}. Did you write render(App) instead of render(<App />)?`);
    }
    const root = makeRoot();
    const wrapped = options.wrapper ? h(options.wrapper, null, element) : element;
    root.render(wrapped);
    activeRoot = root;
    return {
      ...queriesFor(() => root),
      root,
      rerender: (next) => root.render(options.wrapper ? h(options.wrapper, null, next) : next),
      update: (next) => root.render(options.wrapper ? h(options.wrapper, null, next) : next),
      unmount: () => root.unmount(),
    };
  }

  const screen = queriesFor(() => {
    if (!activeRoot) throw new Error("Call render(<YourComponent />) before using screen.");
    return activeRoot;
  });

  const within = (node) => {
    if (!isHostNode(node)) throw new Error("within() needs an element from a query.");
    return queriesFor(() => node);
  };

  const fireEvent = (node, name, ...args) => dispatchEvent(node, name, args);
  fireEvent.press = (node, ...args) => dispatchEvent(node, "press", args);
  fireEvent.longPress = (node, ...args) => dispatchEvent(node, "longPress", args);
  fireEvent.changeText = (node, ...args) => dispatchEvent(node, "changeText", args);
  fireEvent.scroll = (node, ...args) => dispatchEvent(node, "scroll", args);

  const flushAll = () => {
    for (const root of roots) if (root.mounted) root.flush();
  };

  async function act(fn) {
    const result = fn?.();
    if (result && typeof result.then === "function") await result;
    await Promise.resolve();
    flushAll();
    return undefined;
  }

  async function waitFor(fn, options = {}) {
    const timeout = options.timeout ?? 1000;
    const interval = options.interval ?? 50;
    const start = Date.now();
    let fakeElapsed = 0;
    let lastError;
    for (;;) {
      await new Promise((r) => timers.real.setTimeout(r, 0));
      flushAll();
      try {
        return await fn();
      } catch (error) {
        lastError = error;
      }
      const elapsed = timers.state.fake ? fakeElapsed : Date.now() - start;
      if (elapsed >= timeout) throw lastError;
      if (timers.state.fake) {
        jest.advanceTimersByTime(interval);
        fakeElapsed += interval;
      } else {
        await new Promise((r) => timers.real.setTimeout(r, interval));
      }
    }
  }

  const cleanup = () => {
    for (const root of roots) if (root.mounted) root.unmount();
    roots.clear();
    activeRoot = null;
  };

  // ---- jest
  const registered = [];
  const before = [];
  const after = [];
  const prefix = [];
  const test = (name, fn) => registered.push({ name: [...prefix, String(name)].join(" › "), fn });
  test.skip = () => {};
  test.only = test;
  test.todo = () => {};
  const describe = (name, fn) => {
    prefix.push(String(name));
    try {
      fn();
    } finally {
      prefix.pop();
    }
  };
  describe.skip = () => {};

  const runTick = (fn) => {
    let error;
    try {
      fn();
    } catch (e) {
      error = e;
    }
    flushAll();
    if (error) throw error;
  };
  const jest = {
    fn: createMockFn,
    spyOn: (object, method) => {
      const original = object[method];
      if (typeof original !== "function") throw new Error(`jest.spyOn: ${String(method)} is not a function.`);
      const spy = createMockFn((...args) => original.apply(object, args));
      spy.mockRestore = () => {
        object[method] = original;
      };
      object[method] = spy;
      spies.push(spy);
      return spy;
    },
    useFakeTimers: () => {
      timers.state.fake = true;
      return jest;
    },
    useRealTimers: () => {
      timers.state.fake = false;
      timers.state.timers.clear();
      return jest;
    },
    advanceTimersByTime: (ms) => {
      if (!timers.state.fake) throw new Error("Call jest.useFakeTimers() before jest.advanceTimersByTime().");
      timers.advance(ms, runTick);
    },
    runAllTimers: () => timers.advance(60 * 60 * 1000, runTick),
    runOnlyPendingTimers: () => {
      const latest = Math.max(timers.state.now, ...[...timers.state.timers.values()].map((t) => t.at));
      timers.advance(latest - timers.state.now, runTick);
    },
    getTimerCount: () => timers.state.timers.size,
    clearAllTimers: () => timers.state.timers.clear(),
    clearAllMocks: () => spies.forEach((s) => s.mockClear()),
    restoreAllMocks: () => spies.splice(0).forEach((s) => s.mockRestore()),
  };
  const expect = createExpect(isOnScreen);

  const testing = {
    render, screen, fireEvent, waitFor, act, within, cleanup,
    test, it: test, describe, expect, jest,
    beforeEach: (fn) => before.push(fn),
    afterEach: (fn) => after.push(fn),
    /** The learner's code as a string, for tests that check how something was written. */
    source: code,
  };

  const modules = {
    react: { ...React, default: React, __esModule: true },
    "react-native": { ...ReactNative, default: ReactNative, __esModule: true },
    "expo-status-bar": { StatusBar: () => null, __esModule: true },
    "@testing-library/react-native": { ...testing, __esModule: true },
  };
  const require = (name) => {
    const mod = modules[name];
    if (!mod) {
      throw new Error(
        `Cannot find module '${name}'. The in-browser simulator includes react, react-native, expo-status-bar and @testing-library/react-native. Run code that needs other packages in Expo Snack or your own Expo project.`,
      );
    }
    return mod;
  };

  // ---- compile and run
  const codeLines = code.split("\n").length;
  const grading = tests !== undefined;
  const source = grading ? `${code}\n${tests}` : code;
  const finish = (extra) => ({ duration: Date.now() - started, alerts, ...extra });

  let js;
  try {
    js = compile(transform, source);
  } catch (error) {
    const line = Number(String(error.message).match(/line (\d+)/)?.[1] ?? 0);
    const message = grading && line > codeLines ? error.message.replace(/line \d+/, `line ${line - codeLines - 1} of the tests`) : error.message;
    return finish({ ok: false, error: `SyntaxError: ${message.replace(/^SyntaxError: /, "")}`, tests: null, app: null });
  }

  const exportsObject = {};
  const moduleObject = { exports: exportsObject };
  const findApp = `\n;try { if (typeof App === "function" && !exports.__App) exports.__App = App; } catch (e) {}\n`;
  const params = ["require", "exports", "module", "React", "console", "setTimeout", "clearTimeout", "setInterval", "clearInterval", ...(grading ? TEST_GLOBALS : [])];
  const values = [require, exportsObject, moduleObject, React, userConsole, timers.api.setTimeout, timers.api.clearTimeout, timers.api.setInterval, timers.api.clearInterval, ...(grading ? TEST_GLOBALS.map((g) => testing[g]) : [])];

  try {
    const body = `"use strict";\n${js}${grading ? "" : findApp}\n//# sourceURL=${FILE_NAME}`;
    const fn = new Function(...params, body);
    fn(...values);
  } catch (error) {
    const message = describeRuntimeError(error, codeLines);
    cleanup();
    timers.clearAll();
    return finish({
      ok: false,
      error: grading ? `Your code raised an error before the tests could run:\n${message}` : message,
      tests: null,
      app: null,
    });
  }

  if (grading) {
    const results = [];
    for (const [i, t] of registered.entries()) {
      let error = null;
      try {
        for (const fn of before) await fn();
        const outcome = t.fn();
        if (outcome && typeof outcome.then === "function") {
          let timer;
          await Promise.race([
            outcome,
            new Promise((_, reject) => {
              timer = timers.real.setTimeout(() => reject(new Error(`This test took longer than ${testTimeoutMs / 1000} seconds.`)), testTimeoutMs);
            }),
          ]).finally(() => timers.real.clearTimeout(timer));
        }
        for (const fn of after) await fn();
      } catch (e) {
        error = e instanceof AssertionError ? e.message : describeRuntimeError(e, codeLines);
      } finally {
        cleanup();
        spies.splice(0).forEach((s) => s.mockRestore?.());
        timers.state.fake = false;
        timers.clearAll();
      }
      results.push({ name: `test_${i + 1}`, description: t.name, passed: error === null, error });
    }
    if (results.length === 0) return finish({ ok: false, error: "No tests were found.", tests: null, app: null });
    return finish({ ok: true, error: null, tests: results, app: null });
  }

  // A preview of the default export (or a component called App).
  const exported = moduleObject.exports.default ?? exportsObject.default ?? exportsObject.__App;
  if (typeof exported !== "function") {
    return finish({ ok: true, error: null, tests: null, app: null });
  }
  const root = makeRoot();
  const app = {
    root,
    tree: () => serialize(root),
    error: () => (root.error ? describeRuntimeError(root.error, codeLines) : null),
    subscribe: (fn) => {
      root.listeners.add(fn);
      return () => root.listeners.delete(fn);
    },
    dispatch: (id, event, args = []) => {
      const node = root.nodes.get(id);
      if (!node) return false;
      try {
        if (event === "press") {
          const found = findHandler(node, "press");
          if (found && !isDisabled(found.node)) root.batch(() => found.handler(fakeEvent()));
          else if (node.props.onLongPress && !isDisabled(node)) root.batch(() => node.props.onLongPress(fakeEvent()));
        } else {
          dispatchEvent(node, event, args);
        }
      } catch (error) {
        root.error = error;
        log("stderr", describeRuntimeError(error, codeLines) + "\n");
        root.notify();
      }
      return true;
    },
    dispose: () => {
      root.unmount();
      timers.clearAll();
    },
  };
  try {
    root.render(h(exported, null));
  } catch (error) {
    const message = describeRuntimeError(error, codeLines);
    app.dispose();
    return finish({ ok: false, error: message, tests: null, app: null });
  }
  return finish({ ok: true, error: null, tests: null, app });
}

export const SIMULATOR_MODULES = ["react", "react-native", "expo-status-bar", "@testing-library/react-native"];

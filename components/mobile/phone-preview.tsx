"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import type { PreviewNode, PreviewState } from "@/lib/mobile/rn-runner";

/**
 * Draws the simulator's component tree as a phone screen, with React Native's layout
 * defaults (flexbox, column direction, unitless sizes in points). Taps, typing and switches
 * are sent back to the app running in the worker.
 */

type Style = Record<string, unknown>;
type Dispatch = (nodeId: number, event: string, args?: unknown[]) => void;

const UNITLESS = new Set(["flexGrow", "flexShrink", "opacity", "zIndex", "fontWeight", "aspectRatio"]);
const EXPAND: Record<string, string[]> = {
  marginHorizontal: ["marginLeft", "marginRight"],
  marginVertical: ["marginTop", "marginBottom"],
  paddingHorizontal: ["paddingLeft", "paddingRight"],
  paddingVertical: ["paddingTop", "paddingBottom"],
  marginStart: ["marginLeft"],
  marginEnd: ["marginRight"],
  paddingStart: ["paddingLeft"],
  paddingEnd: ["paddingRight"],
  start: ["left"],
  end: ["right"],
  borderStartWidth: ["borderLeftWidth"],
  borderEndWidth: ["borderRightWidth"],
  borderStartColor: ["borderLeftColor"],
  borderEndColor: ["borderRightColor"],
};
const SKIP = new Set(["shadowColor", "shadowOffset", "shadowOpacity", "shadowRadius", "elevation", "resizeMode", "tintColor", "textAlignVertical", "includeFontPadding"]);

const px = (key: string, value: unknown) => (typeof value === "number" && !UNITLESS.has(key) ? `${value}px` : value);

function transformCss(list: unknown): string | undefined {
  if (!Array.isArray(list)) return typeof list === "string" ? list : undefined;
  return list
    .map((t) => {
      const [[name, value]] = Object.entries(t as Record<string, unknown>);
      const unit = typeof value === "number" && /^translate/.test(name) ? "px" : "";
      return `${name}(${value}${unit})`;
    })
    .join(" ");
}

function hexToRgba(color: string, opacity: number): string {
  const m = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return color;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

/** React Native style → CSS. */
export function rnStyleToCss(style: Style = {}): CSSProperties {
  const css: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null || SKIP.has(key)) continue;
    if (key === "flex" && typeof value === "number") {
      if (value > 0) Object.assign(css, { flexGrow: value, flexShrink: 1, flexBasis: "0%" });
      else if (value === 0) Object.assign(css, { flexGrow: 0, flexShrink: 0, flexBasis: "auto" });
      else Object.assign(css, { flexGrow: 0, flexShrink: -value, flexBasis: "auto" });
    } else if (EXPAND[key]) {
      for (const k of EXPAND[key]) css[k] = px(k, value);
    } else if (key === "transform") {
      css.transform = transformCss(value);
    } else if (key === "fontWeight") {
      css.fontWeight = value === "normal" ? 400 : value === "bold" ? 700 : value;
    } else {
      css[key] = px(key, value);
    }
  }
  if (Object.keys(style).some((k) => /^border(Top|Right|Bottom|Left)?Width$/.test(k)) && !style.borderStyle) css.borderStyle = "solid";
  const shadowOpacity = typeof style.shadowOpacity === "number" ? style.shadowOpacity : 0;
  if (style.shadowColor && shadowOpacity > 0) {
    const offset = (style.shadowOffset as { width?: number; height?: number }) ?? {};
    css.boxShadow = `${offset.width ?? 0}px ${offset.height ?? 0}px ${style.shadowRadius ?? 0}px ${hexToRgba(String(style.shadowColor), shadowOpacity)}`;
  } else if (typeof style.elevation === "number" && style.elevation > 0) {
    css.boxShadow = `0 ${style.elevation / 2}px ${style.elevation}px rgba(0,0,0,0.25)`;
  }
  return css as CSSProperties;
}

const VIEW_BASE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  position: "relative",
  boxSizing: "border-box",
  alignItems: "stretch",
  flexShrink: 0,
  flexBasis: "auto",
  minWidth: 0,
  minHeight: 0,
  borderWidth: 0,
  borderStyle: "solid",
  borderColor: "black",
  margin: 0,
  padding: 0,
};

const TEXT_BASE: CSSProperties = {
  display: "block",
  boxSizing: "border-box",
  margin: 0,
  padding: 0,
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
  fontSize: 14,
  lineHeight: "normal",
  color: "#000",
  borderWidth: 0,
  borderStyle: "solid",
  position: "relative",
};

const PRESSABLE = new Set(["Pressable", "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback"]);

function Spinner({ color, size }: { color?: string; size?: unknown }) {
  const d = size === "large" ? 36 : typeof size === "number" ? size : 20;
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-solid"
      style={{ width: d, height: d, borderColor: color ?? "#999", borderTopColor: "transparent", alignSelf: "center" }}
      aria-label="Loading"
    />
  );
}

function RnTextInput({ node, style, dispatch, version }: { node: PreviewNode; style: CSSProperties; dispatch: Dispatch; version: number }) {
  const props = node.props ?? {};
  const value = String(props.value ?? "");
  const [draft, setDraft] = useState(value);
  // Each new tree carries the app's value: show it, even if the app rejected the keystroke.
  const [synced, setSynced] = useState({ value, version });
  if (synced.value !== value || synced.version !== version) {
    setSynced({ value, version });
    setDraft(value);
  }
  const common = {
    value: draft,
    placeholder: props.placeholder as string | undefined,
    maxLength: typeof props.maxLength === "number" ? props.maxLength : undefined,
    disabled: props.editable === false,
    "aria-label": (props.accessibilityLabel as string | undefined) ?? (props.placeholder as string | undefined),
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value);
      dispatch(node.id, "changeText", [e.target.value]);
    },
    style: {
      ...TEXT_BASE,
      // Like React Native Web: no intrinsic width, so flex rows with inputs don't overflow.
      minWidth: 0,
      width: "auto",
      fontSize: 14,
      background: "transparent",
      outline: "none",
      font: "inherit",
      ...style,
      ...(props.placeholderTextColor ? ({ "--ph": props.placeholderTextColor } as CSSProperties) : null),
    },
    className: "rn-input",
  };
  if (props.multiline) return <textarea {...common} rows={Number(props.numberOfLines ?? 2)} />;
  const type = props.secureTextEntry ? "password" : "text";
  return (
    <input
      {...common}
      size={1}
      type={type}
      inputMode={/numeric|number-pad|decimal-pad/.test(String(props.keyboardType ?? "")) ? "decimal" : props.keyboardType === "email-address" ? "email" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" && node.events?.includes("submitEditing")) dispatch(node.id, "submitEditing", [{ nativeEvent: { text: draft } }]);
      }}
    />
  );
}

function RnSwitch({ node, dispatch }: { node: PreviewNode; dispatch: Dispatch }) {
  const props = node.props ?? {};
  const on = Boolean(props.value);
  const track = (props.trackColor as { true?: string; false?: string }) ?? {};
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={Boolean(props.disabled)}
      onClick={() => dispatch(node.id, "valueChange", [!on])}
      style={{
        width: 51,
        height: 31,
        borderRadius: 16,
        padding: 2,
        border: 0,
        background: on ? (track.true ?? "#34C759") : (track.false ?? "#e9e9ea"),
        display: "flex",
        justifyContent: on ? "flex-end" : "flex-start",
        cursor: "pointer",
        flexShrink: 0,
        alignSelf: "flex-start",
        transition: "background 0.15s",
      }}
    >
      <span style={{ width: 27, height: 27, borderRadius: 14, background: (props.thumbColor as string) ?? "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
    </button>
  );
}

function renderNode(node: PreviewNode, dispatch: Dispatch, version: number, inText: boolean): ReactNode {
  if (node.text !== undefined) return node.text;
  const type = node.type ?? "View";
  const props = node.props ?? {};
  const style = rnStyleToCss(props.style as Style);
  const children = (node.children ?? []).map((child) => (
    <PreviewChild key={child.id} node={child} dispatch={dispatch} version={version} inText={inText || type === "Text"} />
  ));
  const pressable = node.events?.includes("press");
  const onPress = pressable
    ? (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        if (!props.disabled) dispatch(node.id, "press");
      }
    : undefined;
  const testId = props.testID as string | undefined;

  switch (type) {
    case "Text": {
      const lines = Number(props.numberOfLines ?? 0);
      const clamp: CSSProperties = lines > 0 ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } : {};
      const base = inText ? { display: "inline" as const } : TEXT_BASE;
      return (
        <span data-testid={testId} onClick={onPress} style={{ ...base, ...clamp, ...style, cursor: onPress ? "pointer" : undefined }}>
          {children}
        </span>
      );
    }
    case "TextInput":
      return <RnTextInput node={node} style={style} dispatch={dispatch} version={version} />;
    case "Switch":
      return <RnSwitch node={node} dispatch={dispatch} />;
    case "ActivityIndicator":
      return props.animating === false ? null : <Spinner color={props.color as string | undefined} size={props.size} />;
    case "Image":
    case "ImageBackground": {
      const uri = typeof props.uri === "string" && /^https:\/\//.test(props.uri) ? props.uri : null;
      const fit = (props.style as Style | undefined)?.resizeMode ?? props.resizeMode ?? "cover";
      return (
        <div data-testid={testId} style={{ ...VIEW_BASE, overflow: "hidden", background: uri ? undefined : "#e4e4e7", ...style }}>
          {uri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uri} alt={(props.accessibilityLabel as string) ?? ""} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit === "stretch" ? "fill" : (fit as CSSProperties["objectFit"]) }} />
          ) : null}
          {children}
        </div>
      );
    }
    case "ScrollView":
      return (
        <div
          data-testid={testId}
          className="rn-scroll"
          style={{ ...VIEW_BASE, flexGrow: 1, flexShrink: 1, overflowX: props.horizontal ? "auto" : "hidden", overflowY: props.horizontal ? "hidden" : "auto", ...style }}
        >
          {children}
        </div>
      );
    case "Modal":
      return (
        <div
          role="dialog"
          style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", background: props.transparent ? "transparent" : "#fff" }}
        >
          {children}
        </div>
      );
    default: {
      const isPressable = PRESSABLE.has(type);
      const disabled = Boolean(props.disabled);
      const feedback = isPressable && onPress && !disabled ? (type === "TouchableOpacity" ? "active:opacity-20" : "active:opacity-60") : "";
      return (
        <div
          data-testid={testId}
          role={isPressable && onPress ? "button" : undefined}
          aria-disabled={isPressable ? disabled : undefined}
          aria-label={props.accessibilityLabel as string | undefined}
          tabIndex={isPressable && onPress && !disabled ? 0 : undefined}
          onClick={onPress}
          onKeyDown={
            onPress
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPress(e);
                  }
                }
              : undefined
          }
          className={feedback}
          style={{ ...VIEW_BASE, cursor: onPress && !disabled ? "pointer" : undefined, transition: "opacity 0.1s", ...style }}
        >
          {children}
        </div>
      );
    }
  }
}

function PreviewChild({ node, dispatch, version, inText }: { node: PreviewNode; dispatch: Dispatch; version: number; inText: boolean }) {
  return <>{renderNode(node, dispatch, version, inText)}</>;
}

export function PhonePreview({ preview, dispatch }: { preview: PreviewState; dispatch: Dispatch }) {
  return (
    <div className="mx-auto w-[300px] shrink-0 rounded-[2.4rem] border-[10px] border-zinc-900 bg-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-700">
      <div
        className="relative flex h-[560px] flex-col overflow-hidden rounded-[1.7rem] bg-white text-left text-black"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif' }}
        aria-label="Phone preview of your app"
      >
        <div className="flex h-7 shrink-0 items-center justify-between px-6 text-[11px] font-semibold" aria-hidden>
          <span>9:41</span>
          <span className="h-4 w-16 rounded-full bg-black" />
          <span>100%</span>
        </div>
        <div style={{ ...VIEW_BASE, flexGrow: 1, flexShrink: 1, flexBasis: "0%", overflow: "hidden" }}>
          {preview.tree.map((node) => (
            <PreviewChild key={node.id} node={node} dispatch={dispatch} version={preview.version} inText={false} />
          ))}
        </div>
        {preview.error && (
          <div role="alert" className="absolute inset-0 z-[60] overflow-auto bg-[#c4282d] p-4 pt-10 font-mono text-[12px] leading-snug whitespace-pre-wrap text-white">
            <div className="mb-2 font-sans text-base font-bold">Your app crashed</div>
            {preview.error}
            <div className="mt-4 font-sans text-[11px] opacity-80">Fix the code and press Run to restart the app.</div>
          </div>
        )}
      </div>
    </div>
  );
}

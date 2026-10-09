"use client";

import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { useMemo, type KeyboardEvent } from "react";

import { useIsDark } from "@/components/use-is-dark";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  onReady?: () => void;
  minHeight?: string;
  maxHeight?: string;
  ariaLabel?: string;
}

const baseTheme = EditorView.theme({
  "&": { fontSize: "14px" },
  ".cm-content": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" },
  ".cm-gutters": { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" },
  "&.cm-focused": { outline: "none" },
});

export default function CodeEditor({
  value,
  onChange,
  onRun,
  onReady,
  minHeight = "3rem",
  maxHeight = "32rem",
  ariaLabel = "Python code editor",
}: CodeEditorProps) {
  const isDark = useIsDark();

  const extensions = useMemo(
    () => [
      python(),
      indentUnit.of("    "),
      baseTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
    ],
    [ariaLabel],
  );

  // Ctrl/⌘ + Enter or Shift + Enter runs the code. Handled in the capture phase so
  // CodeMirror doesn't also insert a new line.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey || event.shiftKey) && onRun) {
      event.preventDefault();
      event.stopPropagation();
      onRun();
    }
  };

  return (
    <div onKeyDownCapture={onKeyDownCapture}>
      <CodeMirror
        value={value}
        onChange={onChange}
        onCreateEditor={() => onReady?.()}
        extensions={extensions}
        theme={isDark ? "dark" : "light"}
        minHeight={minHeight}
        maxHeight={maxHeight}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          autocompletion: true,
          tabSize: 4,
        }}
        indentWithTab
      />
    </div>
  );
}

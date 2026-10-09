"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const CodeEditor = dynamic(() => import("./code-editor"), { ssr: false });

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  minHeight?: string;
  maxHeight?: string;
  ariaLabel?: string;
}

/**
 * CodeMirror only works in the browser. Until it has loaded, the code is shown
 * as plain text so it's readable straight away and the page doesn't jump.
 */
export default function Editor(props: EditorProps) {
  const [ready, setReady] = useState(false);
  return (
    <div className="relative">
      {!ready && (
        <pre className="m-0 overflow-x-auto bg-transparent py-[4px] pr-4 pl-[3.1rem] font-mono text-sm leading-[1.4] text-zinc-800 dark:text-zinc-200">
          {props.value || " "}
        </pre>
      )}
      <div
        className={ready ? "" : "pointer-events-none absolute inset-x-0 top-0"}
        style={ready ? undefined : { visibility: "hidden" }}
      >
        <CodeEditor {...props} onReady={() => setReady(true)} />
      </div>
    </div>
  );
}

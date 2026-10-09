"use client";

import { Play, RotateCcw, Square } from "lucide-react";
import { useState } from "react";

import Editor from "./editor";
import { OutputPanel } from "./output-panel";
import { useCodeRun } from "./use-code-run";

export function RunButton({
  running,
  onRun,
  onStop,
  label = "Run",
}: {
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  label?: string;
}) {
  return running ? (
    <button type="button" onClick={onStop} className="btn btn-sm btn-danger">
      <Square className="size-3.5" aria-hidden /> Stop
    </button>
  ) : (
    <button type="button" onClick={onRun} className="btn btn-sm btn-primary" title="Run (Ctrl/⌘ + Enter)">
      <Play className="size-3.5" aria-hidden /> {label}
    </button>
  );
}

export function CodeCell({ code: initialCode }: { code: string }) {
  const [code, setCode] = useState(initialCode);
  const run = useCodeRun();
  const execute = () => {
    if (!run.running) void run.execute(code);
  };

  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/80">
        <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
          python · editable
        </span>
        <div className="flex items-center gap-1.5">
          {code !== initialCode && (
            <button
              type="button"
              onClick={() => setCode(initialCode)}
              className="btn btn-sm btn-ghost"
              title="Restore the original code"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Reset
            </button>
          )}
          <RunButton running={run.running} onRun={execute} onStop={run.stop} />
        </div>
      </div>
      <Editor value={code} onChange={setCode} onRun={execute} />
      <OutputPanel run={run} runnerStatus={run.runner.status} runnerMessage={run.runner.message} />
    </div>
  );
}
